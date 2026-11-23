package arbodat.plus.service;

import arbodat.plus.Fixtures;
import arbodat.plus.PostgresTest;
import arbodat.plus.dto_migration.BulkDanteAttributeItem;
import arbodat.plus.dto_migration.BulkItemStatus;
import arbodat.plus.model.*;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;

/** Non-matching attributes of the migration in bulk: one status per row, a new DANTE entry is created once. */
class NonMatchingAttributeMigrationServiceTest extends PostgresTest {

    private static final String SETTLEMENT = "https://example.org/site-type/settlement"; // in the fixtures
    private static final String CAVE = "https://example.org/site-type/cave";              // new
    private static final String NOT_ANALYZED = "https://example.org/investigated/no";     // new, used by two attributes

    @Autowired NonMatchingAttributeMigrationService service;
    @Autowired TransactionTemplate tx;
    @PersistenceContext EntityManager em;

    private Fixtures.Full data;

    @BeforeEach
    void setUp() {
        clearDatabase();
        data = tx.execute(status -> Fixtures.full(em));
    }

    @Test
    void eachRowGetsItsStatusAndNewEntriesAreCreatedOnce() {
        List<BulkItemStatus> statuses = service.updateAll(List.of(
                item("1", "siteType", data.site1(), value(SETTLEMENT, "Settlement"), value(CAVE, "cave")),
                item("2", "naturalUnit", data.site1(), value("https://example.org/natural-unit/2", "river valley")),
                item("3", "charcoalInvestigated", data.sample1(), value(NOT_ANALYZED, "not analyzed")),
                item("4", "woodSubfossile", data.sample1(), value(NOT_ANALYZED, "not analyzed")),
                item("5", "material", data.adC14(), value("https://example.org/material/charcoal", "charcoal")),
                item("6", "chronozone", UUID.randomUUID(), value("https://example.org/chronozone/subboreal", "Subboreal")),
                item("7", "featureType", data.feature1()),
                item("8", "colour", data.site1(), value("https://example.org/colour/red", "red"))
        ));

        assertEquals(List.of("updated", "updated", "updated", "updated", "updated", "error", "error", "error"),
                statuses.stream().map(BulkItemStatus::getStatus).toList());
        assertEquals("invalid sample id", statuses.get(5).getMessage());
        assertEquals("no featureType selected", statuses.get(6).getMessage());
        assertEquals("invalid attribute: colour", statuses.get(7).getMessage());

        tx.executeWithoutResult(status -> {
            Site site = em.find(Site.class, data.site1());
            // site types are added (the fixtures have settlement and burial)
            assertEquals(Set.of(SETTLEMENT, "https://example.org/site-type/burial", CAVE),
                    site.getSiteTypeList().stream().map(SiteType::getId).collect(Collectors.toSet()));
            assertEquals("river valley", site.getNaturalUnit().getLabel());

            Sample sample = em.find(Sample.class, data.sample1());
            assertEquals(NOT_ANALYZED, sample.getCharcoalInvestigated().getId());
            assertEquals(NOT_ANALYZED, sample.getWoodSubfossile().getId());
        });
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM sample_investigated WHERE id = ?", Integer.class, NOT_ANALYZED));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM site_type WHERE id = ?", Integer.class, CAVE));
    }

    // Helpers ---------------------------------------------------------------------------------------

    private BulkDanteAttributeItem item(String clientId, String attribute, UUID id, BulkDanteAttributeItem.Value... values) {
        BulkDanteAttributeItem item = new BulkDanteAttributeItem();
        item.setClientId(clientId);
        item.setAttribute(attribute);
        item.setId(id);
        item.setValues(Arrays.asList(values));
        return item;
    }

    private BulkDanteAttributeItem.Value value(String id, String label) {
        BulkDanteAttributeItem.Value value = new BulkDanteAttributeItem.Value();
        value.setId(id);
        value.setLabel(label);
        return value;
    }
}
