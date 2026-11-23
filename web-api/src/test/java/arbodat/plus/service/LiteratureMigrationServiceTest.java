package arbodat.plus.service;

import arbodat.plus.Fixtures;
import arbodat.plus.PostgresTest;
import arbodat.plus.dto_migration.BulkItemStatus;
import arbodat.plus.dto_migration.BulkLiteratureItem;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/** Literature of the migration in bulk: added to the sites (links set so far stay), one status per row. */
class LiteratureMigrationServiceTest extends PostgresTest {

    @Autowired LiteratureMigrationService service;
    @Autowired TransactionTemplate tx;
    @PersistenceContext EntityManager em;

    private Fixtures.Full data;

    @BeforeEach
    void setUp() {
        clearDatabase();
        data = tx.execute(status -> Fixtures.full(em));
    }

    @Test
    void literatureIsAddedToTheSitesAndEachRowGetsItsStatus() {
        Set<UUID> before = sitesOf(data.literature1());

        List<BulkItemStatus> statuses = service.linkAll(List.of(
                item("1", data.orphanSite(), data.literature1()),
                item("2", data.orphanSite(), data.literature1()),   // twice: no second link
                item("3", UUID.randomUUID(), data.literature1()),
                item("4", data.site1()),
                item("5", data.site1(), UUID.randomUUID())
        ));

        assertEquals(List.of("updated", "updated", "error", "error", "error"),
                statuses.stream().map(BulkItemStatus::getStatus).toList());
        assertEquals("invalid site id", statuses.get(2).getMessage());
        assertEquals("no literature", statuses.get(3).getMessage());
        assertTrue(statuses.get(4).getMessage().startsWith("invalid literature id"), statuses.get(4).getMessage());

        Set<UUID> after = sitesOf(data.literature1());
        assertTrue(after.containsAll(before), "the links set so far stay");
        assertTrue(after.contains(data.orphanSite()));
        assertEquals(before.size() + (before.contains(data.orphanSite()) ? 0 : 1), after.size());
    }

    // Helpers ---------------------------------------------------------------------------------------

    private BulkLiteratureItem item(String clientId, UUID siteId, UUID... literatureIds) {
        BulkLiteratureItem item = new BulkLiteratureItem();
        item.setClientId(clientId);
        item.setSiteId(siteId);
        item.setLiteratureIds(List.of(literatureIds));
        return item;
    }

    private Set<UUID> sitesOf(UUID literatureId) {
        return Set.copyOf(jdbc.queryForList("SELECT site_id FROM literature_site_relation WHERE literature_id = ?", UUID.class, literatureId));
    }
}
