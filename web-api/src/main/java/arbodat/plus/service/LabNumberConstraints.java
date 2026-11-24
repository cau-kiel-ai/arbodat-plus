package arbodat.plus.service;

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
 * Makes laboratory + number unique for C14, dendro and other datings in databases from before
 * this rule. Hibernate adds the constraints (see the entities) to a new database, but can't to one
 * that already has duplicates, so on every start:
 * <ol>
 *   <li>Datings that no absolute dating refers to are deleted. Nothing can reach them (an update
 *       used to leave the old dating behind instead of changing it), but their numbers would count.</li>
 *   <li>A missing constraint is added, unless real duplicates remain: those are logged, to be
 *       corrected in the Data Explorer; the constraint follows on the next start after that.</li>
 * </ol>
 */
@Component
public class LabNumberConstraints implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(LabNumberConstraints.class);

    record Table(String name, String kind, String laboratoryColumn, String absoluteDatingColumn, String constraint) {}

    static final List<Table> TABLES = List.of(
            new Table("c14_dating", "C14", "c14_laboratory", "c14_dating_id", "uk_c14_dating_laboratory_number"),
            new Table("dendrochronological_dating", "dendro", "laboratory", "dendrochronological_dating_id",
                    "uk_dendrochronological_dating_laboratory_number"),
            new Table("other_dating", "other", "laboratory", "other_dating_id", "uk_other_dating_laboratory_number"));

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;

    public LabNumberConstraints(JdbcTemplate jdbc, TransactionTemplate tx) {
        this.jdbc = jdbc;
        this.tx = tx;
    }

    @Override
    public void run(ApplicationArguments args) {
        for (Table table : TABLES) {
            try {
                tx.executeWithoutResult(status -> ensure(table));
            } catch (RuntimeException e) {
                log.warn("Could not check the {} laboratory numbers: {}", table.kind(), e.getMessage());
            }
        }
    }

    void ensure(Table t) {
        int orphans = jdbc.update("DELETE FROM " + t.name() + " d WHERE NOT EXISTS (SELECT 1 FROM absolute_dating a WHERE a."
                + t.absoluteDatingColumn() + " = d.id)");
        if (orphans > 0) {
            log.info("Deleted {} {} datings that no absolute dating referred to.", orphans, t.kind());
        }

        Integer exists = jdbc.queryForObject("SELECT count(*) FROM pg_constraint WHERE conname = ?", Integer.class, t.constraint());
        if (exists != null && exists > 0) return;

        List<Map<String, Object>> duplicates = jdbc.queryForList("SELECT " + t.laboratoryColumn() + " AS laboratory, number, count(*) AS n"
                + " FROM " + t.name() + " WHERE " + t.laboratoryColumn() + " IS NOT NULL AND number IS NOT NULL"
                + " GROUP BY 1, 2 HAVING count(*) > 1 ORDER BY 1, 2 LIMIT 20");
        if (duplicates.isEmpty()) {
            jdbc.execute("ALTER TABLE " + t.name() + " ADD CONSTRAINT " + t.constraint()
                    + " UNIQUE (" + t.laboratoryColumn() + ", number)");
            log.info("{} laboratory numbers are unique now.", t.kind());
        } else {
            log.warn("{} laboratory numbers are not unique yet. Please correct these in the Data Explorer: {}", t.kind(),
                    duplicates.stream().map(d -> "laboratory " + d.get("laboratory") + ", number " + d.get("number") + " (" + d.get("n") + " times)")
                            .collect(Collectors.joining("; ")));
        }
    }
}
