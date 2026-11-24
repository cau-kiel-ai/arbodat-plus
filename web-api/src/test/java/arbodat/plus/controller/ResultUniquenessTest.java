package arbodat.plus.controller;

import arbodat.plus.Fixtures;
import arbodat.plus.PostgresTest;
import arbodat.plus.dto_migration.BulkItemStatus;
import arbodat.plus.dto_migration.BulkResultItem;
import arbodat.plus.model.*;
import arbodat.plus.service.ResultConstraints;
import arbodat.plus.service.ResultMigrationService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.HashSet;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * A result is unique within its sample by tax code, org / min, sieve size, fraction analyzed, cf, rest type and
 * state of preservation; empty values count as values. Fixtures in sample 'S-1': result 1 (all values set) and
 * result 2 (tax code and 'min' only, the rest empty).
 */
class ResultUniquenessTest extends PostgresTest {

    private static final String TAX_CODE = "http://uri.gbv.de/terminology/arbodat_taxonomy/triticum";
    private static final String CF = "http://uri.gbv.de/terminology/arbodat_classification_confer/cf";
    private static final String REST_TYPE = "http://uri.gbv.de/terminology/arbodat_rest_type/grain";
    private static final String STATE = "http://uri.gbv.de/terminology/arbodat_result_condition/charred";

    @Autowired ResultController controller;
    @Autowired ResultMigrationService resultMigrationService;
    @Autowired ResultConstraints constraints;
    @Autowired TransactionTemplate tx;
    @PersistenceContext EntityManager em;

    private Fixtures.Full data;

    @BeforeEach
    void setUp() {
        clearDatabase();
        data = tx.execute(status -> Fixtures.full(em));
    }

    @Test
    void theDatabaseRefusesASecondResultWithTheSameKeyAlsoWithEmptyValues() {
        // Result 2 again: tax code + 'min', the rest empty
        assertThrows(DuplicateKeyException.class, () -> jdbc.update(
                "INSERT INTO result (id, sample, tax_code, org_or_min) VALUES (?, ?, ?, 'min')",
                UUID.randomUUID(), data.sample1(), TAX_CODE));

        // Another fraction analyzed: another result
        jdbc.update("INSERT INTO result (id, sample, tax_code, org_or_min, fraction_analyzed) VALUES (?, ?, ?, 'min', 'partly')",
                UUID.randomUUID(), data.sample1(), TAX_CODE);

        // Without sample (it was deleted) nothing is unique
        jdbc.update("INSERT INTO result (id, tax_code, org_or_min) VALUES (?, ?, 'min')", UUID.randomUUID(), TAX_CODE);
        jdbc.update("INSERT INTO result (id, tax_code, org_or_min) VALUES (?, ?, 'min')", UUID.randomUUID(), TAX_CODE);
    }

    @Test
    void creatingAnExistingResultIsRefused() {
        assertEquals("result already exists",
                tx.execute(status -> controller.create(result("org", 0.5, "all", CF, REST_TYPE, STATE))));
        // Result 2 with its empty values
        assertEquals("result already exists",
                tx.execute(status -> controller.create(result("min", null, null, null, null, null))));
        assertEquals(2, count("result"));

        // Differs in fraction analyzed only: another result
        assertEquals("result is created",
                tx.execute(status -> controller.create(result("org", 0.5, "partly", CF, REST_TYPE, STATE))));
        assertEquals(3, count("result"));
    }

    @Test
    void changingAResultIntoAnExistingOneIsRefusedAndLeavesItUnchanged() {
        assertEquals("result already exists",
                tx.execute(status -> controller.update(result("org", 0.5, "all", CF, REST_TYPE, STATE), data.result2())));
        assertEquals("min", jdbc.queryForObject("SELECT org_or_min FROM result WHERE id = ?", String.class, data.result2()));

        // Its own values: fine
        assertEquals("result is updated",
                tx.execute(status -> controller.update(result("org", 0.5, "all", CF, REST_TYPE, STATE), data.result1())));
    }

    @Test
    void inTheMigrationAResultOfARenamedFractionIsCreatedOnlyOnce() {
        // Renamed fraction: no org / min and sieve size
        List<BulkItemStatus> statuses = resultMigrationService.createAll("Archaeobotany", List.of(
                item("1", result(null, null, null, null, REST_TYPE, STATE)),
                item("2", result(null, null, null, null, REST_TYPE, STATE))));
        assertEquals(List.of("created", "exists"), statuses.stream().map(BulkItemStatus::getStatus).toList());

        // Migrating again
        statuses = resultMigrationService.createAll("Archaeobotany", List.of(
                item("3", result(null, null, null, null, REST_TYPE, STATE))));
        assertEquals("exists", statuses.get(0).getStatus());
        assertEquals(3, count("result"));
    }

    @Test
    void atStartTheIndexIsCreatedWhenPossible() {
        jdbc.execute("DROP INDEX " + Result.UNIQUE_KEY);
        UUID duplicate = UUID.randomUUID();
        jdbc.update("INSERT INTO result (id, sample, tax_code, org_or_min) VALUES (?, ?, ?, 'min')",
                duplicate, data.sample1(), TAX_CODE);
        try {
            constraints.run(new DefaultApplicationArguments());
            assertEquals(0, indexCount());
        } finally { // corrected: the index comes back (and stays for the other tests)
            jdbc.update("UPDATE result SET org_or_min = 'org' WHERE id = ?", duplicate);
            constraints.run(new DefaultApplicationArguments());
        }
        assertEquals(1, indexCount());
    }

    // Helpers ---------------------------------------------------------------------------------------

    // A result of sample 'S-1' with tax code 'Triticum'
    private Result result(String orgOrMin, Double sieveSize, String fractionAnalyzed,
                          String cf, String restType, String state) {
        Result result = new Result();
        Sample sample = new Sample();
        sample.setId(data.sample1());
        result.setSample(sample);
        result.setTaxCode(withId(new TaxCode(), TAX_CODE));
        result.setOrgOrMin(orgOrMin);
        result.setSieveSize(sieveSize);
        result.setFractionAnalyzed(fractionAnalyzed);
        result.setClassificationConfer(cf == null ? null : withId(new ClassificationConfer(), cf));
        result.setRestType(restType == null ? null : withId(new RestType(), restType));
        result.setStateOfPreservation(state == null ? null : withId(new StateOfPreservation(), state));
        result.setRestCount(1);
        result.setAbsoluteDatingList(new HashSet<>());
        return result;
    }

    private static <T> T withId(T value, String id) {
        if (value instanceof TaxCode v) v.setId(id);
        if (value instanceof ClassificationConfer v) v.setId(id);
        if (value instanceof RestType v) v.setId(id);
        if (value instanceof StateOfPreservation v) v.setId(id);
        return value;
    }

    private static BulkResultItem item(String clientId, Result result) {
        BulkResultItem item = new BulkResultItem();
        item.setClientId(clientId);
        item.setResult(result);
        return item;
    }

    private int indexCount() {
        return jdbc.queryForObject("SELECT count(*) FROM pg_indexes WHERE indexname = ?", Integer.class, Result.UNIQUE_KEY);
    }
}
