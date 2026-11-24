package arbodat.plus.service;

import arbodat.plus.model.Result;
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
 * Makes results unique within their sample (see ResultKey) with a unique index that treats empty values as
 * equal (NULLS NOT DISTINCT, e.g. results of a renamed fraction without org / min and sieve size). Results
 * without sample (their sample was deleted) are left out. Hibernate can't create such an index, so on every
 * start a missing index is created, unless duplicates remain: those are logged, to be corrected in the Data
 * Explorer; the index follows on the next start after that.
 */
@Component
public class ResultConstraints implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(ResultConstraints.class);

    static final String COLUMNS = "sample, tax_code, org_or_min, sieve_size, fraction_analyzed, "
            + "classification_confer, rest_type, state_of_preservation";

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;

    public ResultConstraints(JdbcTemplate jdbc, TransactionTemplate tx) {
        this.jdbc = jdbc;
        this.tx = tx;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            tx.executeWithoutResult(status -> ensure());
        } catch (RuntimeException e) {
            log.warn("Could not check the uniqueness of the results: {}", e.getMessage());
        }
    }

    void ensure() {
        Integer exists = jdbc.queryForObject("SELECT count(*) FROM pg_indexes WHERE indexname = ?", Integer.class,
                Result.UNIQUE_KEY);
        if (exists != null && exists > 0) return;

        // GROUP BY treats empty values as equal, like the index
        List<Map<String, Object>> duplicates = jdbc.queryForList("SELECT sample, tax_code, org_or_min, sieve_size, "
                + "fraction_analyzed, count(*) AS n FROM result WHERE sample IS NOT NULL GROUP BY " + COLUMNS
                + " HAVING count(*) > 1 ORDER BY 1, 2 LIMIT 20");
        if (duplicates.isEmpty()) {
            jdbc.execute("CREATE UNIQUE INDEX " + Result.UNIQUE_KEY + " ON result (" + COLUMNS + ")"
                    + " NULLS NOT DISTINCT WHERE sample IS NOT NULL");
            log.info("Results are unique now.");
        } else {
            log.warn("Results are not unique yet. Please correct these in the Data Explorer: {}",
                    duplicates.stream().map(d -> "tax code " + d.get("tax_code") + " in sample " + d.get("sample")
                                    + ", fraction " + d.get("org_or_min") + " " + d.get("sieve_size")
                                    + " (" + d.get("n") + " times)")
                            .collect(Collectors.joining("; ")));
        }
    }
}
