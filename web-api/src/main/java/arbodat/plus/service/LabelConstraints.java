package arbodat.plus.service;

import arbodat.plus.model.AbsoluteDating;
import arbodat.plus.model.Feature;
import arbodat.plus.model.ResearchProject;
import arbodat.plus.model.Sample;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Makes research project names unique, feature labels unique within their site, sample labels within their
 * feature and sub-samples within their sample in databases from before this rule. Hibernate adds the
 * constraints (see the entities) to a new database, but can't to one that already has duplicates, so on every
 * start a missing constraint is added, unless duplicates remain: those are logged, to be corrected in the Data
 * Explorer; the constraint follows on the next start after that. (Ignoring letter case is checked by
 * LabelUniqueness, not by the database.)
 */
@Component
public class LabelConstraints implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(LabelConstraints.class);

    // parentColumn: null if the label is unique overall
    record Table(String name, String kind, String parentColumn, String labelColumn, String constraint) {

        String columns() {
            return parentColumn == null ? labelColumn : parentColumn + ", " + labelColumn;
        }
    }

    static final List<Table> TABLES = List.of(
            new Table("research_project", "Research project names", null, "project_name", ResearchProject.UNIQUE_NAME),
            new Table("feature", "Feature labels", "site", "feature_label", Feature.UNIQUE_LABEL),
            new Table("sample", "Sample labels", "feature_id", "sample_label", Sample.UNIQUE_LABEL),
            new Table("absolute_dating", "Sub-samples", "sample", "sub_sample", AbsoluteDating.UNIQUE_SUB_SAMPLE));

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;

    public LabelConstraints(JdbcTemplate jdbc, TransactionTemplate tx) {
        this.jdbc = jdbc;
        this.tx = tx;
    }

    @Override
    public void run(ApplicationArguments args) {
        for (Table table : TABLES) {
            try {
                tx.executeWithoutResult(status -> ensure(table));
            } catch (RuntimeException e) {
                log.warn("Could not check the uniqueness of the {}: {}", table.kind().toLowerCase(), e.getMessage());
            }
        }
    }

    void ensure(Table t) {
        Integer exists = jdbc.queryForObject("SELECT count(*) FROM pg_constraint WHERE conname = ?", Integer.class, t.constraint());
        if (exists != null && exists > 0) return;

        String parent = t.parentColumn() == null ? "NULL" : t.parentColumn();
        String parentNotNull = t.parentColumn() == null ? "" : t.parentColumn() + " IS NOT NULL AND ";
        List<Map<String, Object>> duplicates = jdbc.queryForList("SELECT " + parent + " AS parent, "
                + t.labelColumn() + " AS label, count(*) AS n FROM " + t.name()
                + " WHERE " + parentNotNull + t.labelColumn() + " IS NOT NULL"
                + " GROUP BY 1, 2 HAVING count(*) > 1 ORDER BY 1, 2 LIMIT 20");
        if (duplicates.isEmpty()) {
            jdbc.execute("ALTER TABLE " + t.name() + " ADD CONSTRAINT " + t.constraint() + " UNIQUE (" + t.columns() + ")");
            log.info("{} are unique now.", t.kind());
        } else {
            log.warn("{} are not unique yet. Please correct these in the Data Explorer: {}", t.kind(),
                    duplicates.stream().map(d -> "'" + d.get("label") + "'"
                                    + (t.parentColumn() == null ? "" : " in " + t.parentColumn() + " " + d.get("parent"))
                                    + " (" + d.get("n") + " times)")
                            .collect(Collectors.joining("; ")));
        }
    }
}
