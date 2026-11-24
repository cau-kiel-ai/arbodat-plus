package arbodat.plus.dataimport;

import arbodat.plus.dataimport.Resolution.Action;
import arbodat.plus.dataimport.Resolution.MatchedBy;
import arbodat.plus.exchange.EntityType;

import java.util.*;

/**
 * The import preview as the frontend gets it. Long lists are cut at {@link #LIMIT} entries (their
 * totals stay complete); the conflict counts per field allow deciding the rest in bulk.
 */
public record PlanView(
        String planFingerprint,
        FileInfo file,
        boolean canCommit,
        long unresolved,
        List<TypeSummary> summary,
        List<Ambiguity> ambiguities,
        List<KeyMatch> keyMatches,
        int keyMatchTotal,
        List<Conflict> conflicts,
        int conflictTotal,
        List<FieldCount> conflictFields,
        List<Fill> fills,
        int fillTotal,
        List<LinkAdd> links,
        int linkTotal,
        List<Lookup> newLookups,
        List<LookupDiff> lookupLabelDiffs,
        List<Issue> warnings,
        List<Issue> errors) {

    static final int LIMIT = 2000;

    public record FileInfo(int formatVersion, String appVersion, String exportedAt, String sha256, int records) {}

    public record TypeSummary(EntityType type, int total, int create, int matchById, int matchByKey, int ambiguous,
                              int pending, int conflicts, int fills, int links) {}

    /** An existing record the user can choose; {@code details} tells it apart from the others ("12 features"). */
    public record Candidate(String targetId, String label, String details) {}

    /** Describes an existing record by what it holds, for telling candidates apart. */
    interface Describer {
        String describe(EntityType type, Object id);
    }

    /** A record that needs a choice: one of the candidates, or "NEW". {@code chosen}: the current choice. */
    public record Ambiguity(String key, EntityType type, String label, String path, String reason,
                            List<Candidate> candidates, String chosen) {}

    /** A record merged into an existing one by label (or the user's choice), not by id. */
    public record KeyMatch(String key, EntityType type, String label, String path, String targetId, String target,
                           MatchedBy matchedBy, int candidates) {}

    /** {@code key}: "SITE:&lt;uuid&gt;:remarks" for {@link Decisions.Conflicts#byField()}; {@code take}: the current choice. */
    public record Conflict(String key, String recordKey, EntityType type, String label, String path, String target,
                           String field, Object existing, Object imported, boolean take) {}

    public record FieldCount(EntityType type, String field, int count) {}

    public record Fill(String recordKey, EntityType type, String path, String field, Object imported) {}

    public record LinkAdd(String recordKey, EntityType type, String path, String field, List<String> added) {}

    public record Lookup(EntityType type, String id, String label) {}

    public record LookupDiff(EntityType type, String id, String field, Object existing, Object imported) {}

    static PlanView of(ImportPlan plan, Decisions decisions, Describer describer) {
        ImportGraph graph = plan.graph;
        Decisions d = decisions == null ? Decisions.none() : decisions;

        Map<EntityType, int[]> counts = new EnumMap<>(EntityType.class); // conflicts, fills, links
        for (ImportPlan.Change c : plan.changes) counts.computeIfAbsent(c.record().type, t -> new int[3])[c.conflict() ? 0 : 1]++;
        for (ImportPlan.LinkAdd l : plan.links) counts.computeIfAbsent(l.record().type, t -> new int[3])[2] += l.targets().size();

        List<TypeSummary> summary = new ArrayList<>();
        List<Ambiguity> ambiguities = new ArrayList<>();
        List<KeyMatch> keyMatches = new ArrayList<>();
        List<Lookup> newLookups = new ArrayList<>();
        int keyMatchTotal = 0;
        for (EntityType type : EntityType.values()) {
            Collection<ImportRecord> records = graph.of(type);
            if (records.isEmpty()) continue;
            int create = 0, byId = 0, byKey = 0, ambiguous = 0, pending = 0;
            for (ImportRecord record : records) {
                Resolution r = plan.resolution(type, record.id);
                switch (r.action) {
                    case CREATE -> create++;
                    case MATCH -> {
                        if (r.matchedBy == MatchedBy.ID) byId++;
                        else byKey++;
                    }
                    case AMBIGUOUS -> ambiguous++;
                    case PENDING -> pending++;
                }
                if (type.isLookup()) {
                    if (r.action == Action.CREATE) newLookups.add(new Lookup(type, (String) record.id, record.string("label")));
                    continue;
                }
                boolean chosenByUser = d.match(record.key()) != null && !r.candidates.isEmpty();
                if (r.action == Action.AMBIGUOUS || chosenByUser) {
                    ambiguities.add(new Ambiguity(record.key(), type, Labels.record(graph, record), Labels.recordPath(graph, record),
                            r.reason, candidates(plan, type, r.candidates, describer), d.match(record.key())));
                } else if (r.action == Action.MATCH && r.matchedBy == MatchedBy.KEY) {
                    keyMatchTotal++;
                    if (keyMatches.size() < LIMIT) {
                        Object target = plan.entity(type, r.targetId);
                        keyMatches.add(new KeyMatch(record.key(), type, Labels.record(graph, record), Labels.recordPath(graph, record),
                                r.targetId.toString(), Labels.entityPath(type, target), r.matchedBy, r.candidates.size()));
                    }
                }
            }
            int[] c = counts.getOrDefault(type, new int[3]);
            summary.add(new TypeSummary(type, records.size(), create, byId, byKey, ambiguous, pending, c[0], c[1], c[2]));
        }

        List<Conflict> conflicts = new ArrayList<>();
        Map<String, FieldCount> fieldCounts = new LinkedHashMap<>();
        List<Fill> fills = new ArrayList<>();
        int conflictTotal = 0, fillTotal = 0;
        for (ImportPlan.Change c : plan.changes) {
            ImportRecord record = c.record();
            if (c.conflict()) {
                conflictTotal++;
                String fieldKey = record.type + ":" + c.field();
                FieldCount fc = fieldCounts.get(fieldKey);
                fieldCounts.put(fieldKey, new FieldCount(record.type, c.field(), fc == null ? 1 : fc.count() + 1));
                if (conflicts.size() < LIMIT) {
                    Resolution r = plan.resolution(record.type, record.id);
                    conflicts.add(new Conflict(record.key() + ":" + c.field(), record.key(), record.type,
                            Labels.record(graph, record), Labels.recordPath(graph, record),
                            Labels.entityPath(record.type, plan.entity(record.type, r.targetId)),
                            c.field(), c.existing(), c.imported(), d.take(record.key(), record.type, c.field())));
                }
            } else {
                fillTotal++;
                if (fills.size() < LIMIT) {
                    fills.add(new Fill(record.key(), record.type, Labels.recordPath(graph, record), c.field(), c.imported()));
                }
            }
        }

        List<LinkAdd> links = new ArrayList<>();
        for (ImportPlan.LinkAdd l : plan.links) {
            if (links.size() >= LIMIT) break;
            if (plan.resolution(l.record().type, l.record().id).action != Action.MATCH) continue; // new records: counted only
            links.add(new LinkAdd(l.record().key(), l.record().type, Labels.recordPath(graph, l.record()), l.field(), l.labels()));
        }
        int linkTotal = (int) plan.links.stream()
                .filter(l -> plan.resolution(l.record().type, l.record().id).action == Action.MATCH).count();

        List<LookupDiff> lookupDiffs = plan.lookupDiffs.stream().limit(LIMIT)
                .map(l -> new LookupDiff(l.type(), l.id(), l.field(), l.existing(), l.imported())).toList();

        return new PlanView(plan.fingerprint,
                new FileInfo(graph.formatVersion, graph.appVersion, graph.exportedAt, graph.sha256, graph.size()),
                !plan.blocked(), plan.unresolved(), summary, ambiguities, keyMatches, keyMatchTotal,
                conflicts, conflictTotal, new ArrayList<>(fieldCounts.values()), fills, fillTotal, links, linkTotal,
                newLookups.stream().limit(LIMIT).toList(), lookupDiffs,
                plan.warnings.stream().limit(LIMIT).toList(), plan.errors);
    }

    private static List<Candidate> candidates(ImportPlan plan, EntityType type, List<Object> ids, Describer describer) {
        List<Candidate> candidates = new ArrayList<>();
        for (Object id : ids) {
            candidates.add(new Candidate(id.toString(), Labels.entityPath(type, plan.entity(type, id)), describer.describe(type, id)));
        }
        return candidates;
    }
}
