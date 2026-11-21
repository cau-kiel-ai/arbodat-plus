package arbodat.plus.dataimport;

import arbodat.plus.exchange.EntityType;
import jakarta.persistence.PersistenceException;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;

/**
 * Merges an export file into this database. Two steps, both reading the whole file:
 * <ol>
 *   <li>{@link #preview}: what would happen (nothing is written).</li>
 *   <li>{@link #commit}: plans again and, if the plan is still the one the user reviewed, writes
 *       it in one transaction: everything or nothing.</li>
 * </ol>
 * Nothing is ever deleted: existing values are only overwritten where the user chose the imported
 * one, and links only ever added.
 */
@Service
public class ImportService {

    /** One import at a time (pg_advisory_xact_lock key). */
    private static final long LOCK = 0x4172626f44617449L; // "ArboDatI"

    private final ImportReader reader;
    private final ImportPlanner planner;
    private final ImportApplier applier;
    private final JdbcTemplate jdbc;

    public ImportService(ImportReader reader, ImportPlanner planner, ImportApplier applier, JdbcTemplate jdbc) {
        this.reader = reader;
        this.planner = planner;
        this.applier = applier;
        this.jdbc = jdbc;
    }

    /** What the import did, per type. */
    public record Outcome(EntityType type, int created, int updated) {}

    public record CommitResult(String planFingerprint, List<Outcome> outcomes, int links, List<Issue> warnings) {}

    @Transactional(readOnly = true)
    public PlanView preview(InputStream file, Decisions decisions) throws IOException {
        Decisions d = checked(decisions);
        ImportPlan plan = planner.plan(reader.read(file), d);
        return PlanView.of(plan, d, this::describe);
    }

    @Transactional(rollbackFor = Exception.class)
    public CommitResult commit(InputStream file, Decisions decisions) throws IOException {
        Decisions d = checked(decisions);
        if (d.planFingerprint() == null) {
            throw ImportException.invalidDecisions("The preview's planFingerprint is missing.");
        }
        jdbc.execute("SELECT pg_advisory_xact_lock(" + LOCK + ")");

        ImportPlan plan = planner.plan(reader.read(file), d);
        if (!plan.fingerprint.equals(d.planFingerprint())) {
            throw ImportException.planChanged(PlanView.of(plan, d, this::describe));
        }
        if (plan.blocked()) {
            throw ImportException.unresolved(PlanView.of(plan, d, this::describe));
        }
        List<Outcome> outcomes;
        try {
            outcomes = applier.apply(plan, d);
        } catch (DataIntegrityViolationException | PersistenceException e) {
            // E.g. a conflict choice that gives a dating a laboratory number another dating has
            throw ImportException.refusedByDatabase(NestedExceptionUtils.getMostSpecificCause(e).getMessage());
        }
        int links = plan.links.stream().mapToInt(l -> l.targets().size()).sum();
        return new CommitResult(plan.fingerprint, outcomes, links, plan.warnings);
    }

    /** What an existing record holds ("3 features, 12 samples"), so that same-named candidates can be told apart. */
    private String describe(EntityType type, Object id) {
        List<String> parts = new java.util.ArrayList<>();
        switch (type) {
            case SITE -> {
                String number = jdbc.queryForObject("SELECT site_number FROM site WHERE id = ?", String.class, id);
                if (number != null && !number.isBlank()) parts.add("site number " + number);
                count(parts, "SELECT count(*) FROM feature WHERE site = ?", id, "feature", "features");
                count(parts, "SELECT count(*) FROM sample s JOIN feature f ON f.id = s.feature_id WHERE f.site = ?", id, "sample", "samples");
            }
            case FEATURE -> count(parts, "SELECT count(*) FROM sample WHERE feature_id = ?", id, "sample", "samples");
            case SAMPLE -> {
                count(parts, "SELECT count(*) FROM result WHERE sample = ?", id, "result", "results");
                count(parts, "SELECT count(*) FROM absolute_dating WHERE sample = ?", id, "absolute dating", "absolute datings");
            }
            case ABSOLUTE_DATING -> count(parts, "SELECT count(*) FROM result_absolute_dating_relation WHERE absolute_dating_id = ?", id, "result", "results");
            default -> {
                return null;
            }
        }
        return String.join(", ", parts);
    }

    private void count(List<String> parts, String sql, Object id, String one, String many) {
        Integer n = jdbc.queryForObject(sql, Integer.class, id);
        int count = n == null ? 0 : n;
        parts.add(count == 0 ? "no " + many : count + " " + (count == 1 ? one : many));
    }

    private static Decisions checked(Decisions decisions) {
        Decisions d = decisions == null ? Decisions.none() : decisions;
        d.validate();
        return d;
    }
}
