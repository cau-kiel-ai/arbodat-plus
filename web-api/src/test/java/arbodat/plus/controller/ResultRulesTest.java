package arbodat.plus.controller;

import arbodat.plus.Fixtures;
import arbodat.plus.PostgresTest;
import arbodat.plus.dto_migration.BulkItemStatus;
import arbodat.plus.dto_migration.BulkResultItem;
import arbodat.plus.model.*;
import arbodat.plus.service.ResultMigrationService;
import arbodat.plus.service.ResultRules;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.HashSet;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Rules of a result row from ArboDat 2018: a quantity (count, fragments or weight; -1 as count = present, not
 * counted) and no entry date in the future. Input and explorer are refused, the migration notes them.
 */
class ResultRulesTest extends PostgresTest {

    @Autowired ResultController controller;
    @Autowired ResultMigrationService resultMigrationService;
    @Autowired TransactionTemplate tx;
    @PersistenceContext EntityManager em;

    private Fixtures.Full data;

    @BeforeEach
    void setUp() {
        clearDatabase();
        data = tx.execute(status -> Fixtures.full(em));
    }

    @Test
    void aResultWithoutQuantityIsRefused() {
        ResultRules.ResultRuleException e = assertThrows(ResultRules.ResultRuleException.class,
                () -> tx.execute(status -> controller.create(result("A", null, null, null))));
        assertEquals(ResultRules.NO_QUANTITY, e.getMessage());
        // 0 is no quantity either
        assertThrows(ResultRules.ResultRuleException.class,
                () -> tx.execute(status -> controller.create(result("B", 0, 0, 0.0))));
        assertEquals(2, count("result"));
    }

    @Test
    void countFragmentsOrWeightIsEnoughAndMinusOneMeansPresent() {
        assertEquals("result is created", tx.execute(status -> controller.create(result("A", -1, null, null))));
        assertEquals("result is created", tx.execute(status -> controller.create(result("B", null, 3, null))));
        assertEquals("result is created", tx.execute(status -> controller.create(result("C", null, null, 0.42))));
        assertEquals(5, count("result"));
    }

    @Test
    void anEntryDateInTheFutureIsRefused() {
        Result future = result("A", 1, null, null);
        future.setEntryDate(Date.from(Instant.now().plus(Duration.ofDays(3))));
        ResultRules.ResultRuleException e = assertThrows(ResultRules.ResultRuleException.class,
                () -> tx.execute(status -> controller.create(future)));
        assertEquals(ResultRules.FUTURE_ENTRY_DATE, e.getMessage());

        Result today = result("A", 1, null, null);
        today.setEntryDate(new Date());
        assertEquals("result is created", tx.execute(status -> controller.create(today)));
    }

    @Test
    void removingTheQuantityOfAResultIsRefusedAndLeavesItUnchanged() {
        Result withoutQuantity = result("org", null, null, null);
        assertThrows(ResultRules.ResultRuleException.class,
                () -> tx.execute(status -> controller.update(withoutQuantity, data.result1())));
        assertEquals(12, jdbc.queryForObject("SELECT rest_count FROM result WHERE id = ?", Integer.class, data.result1()));
    }

    @Test
    void theMigrationCreatesResultsOfArboDatWithoutQuantityWithANote() {
        List<BulkItemStatus> statuses = resultMigrationService.createAll("Archaeobotany", List.of(
                item("1", result("A", null, null, null)),
                item("2", result("B", -1, null, null))));

        assertEquals(List.of("created", "created"), statuses.stream().map(BulkItemStatus::getStatus).toList());
        assertEquals(ResultRules.NO_QUANTITY, statuses.get(0).getMessage());
        assertNull(statuses.get(1).getMessage());
        assertEquals(4, count("result"));
    }

    // A result of sample 'S-1' (fraction analyzed tells the results apart)
    private Result result(String fractionAnalyzed, Integer count, Integer fragments, Double weight) {
        Result result = new Result();
        Sample sample = new Sample();
        sample.setId(data.sample1());
        result.setSample(sample);
        TaxCode taxCode = new TaxCode();
        taxCode.setId("http://uri.gbv.de/terminology/arbodat_taxonomy/triticum");
        result.setTaxCode(taxCode);
        ClassificationConfer cf = new ClassificationConfer();
        cf.setId("http://uri.gbv.de/terminology/arbodat_classification_confer/cf");
        result.setClassificationConfer(cf);
        RestType restType = new RestType();
        restType.setId("http://uri.gbv.de/terminology/arbodat_rest_type/grain");
        result.setRestType(restType);
        StateOfPreservation state = new StateOfPreservation();
        state.setId("http://uri.gbv.de/terminology/arbodat_result_condition/charred");
        result.setStateOfPreservation(state);
        result.setOrgOrMin("org");
        result.setSieveSize(1.0);
        result.setFractionAnalyzed(fractionAnalyzed);
        result.setRestCount(count);
        result.setRestFragment(fragments);
        result.setRestWeight(weight);
        result.setAbsoluteDatingList(new HashSet<>());
        return result;
    }

    private static BulkResultItem item(String clientId, Result result) {
        BulkResultItem item = new BulkResultItem();
        item.setClientId(clientId);
        item.setResult(result);
        return item;
    }
}
