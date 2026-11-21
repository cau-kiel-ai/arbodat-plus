package arbodat.plus.service;

import arbodat.plus.Fixtures;
import arbodat.plus.PostgresTest;
import arbodat.plus.controller.AbsoluteDatingController;
import arbodat.plus.dto_migration.BulkItemStatus;
import arbodat.plus.dto_migration.BulkLabAndNumberItem;
import arbodat.plus.model.*;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.HashSet;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/** Labs and numbers of the migration in bulk: laboratory + number identify one dating, checked per row. */
class LabAndNumberMigrationServiceTest extends PostgresTest {

    private static final String KIA = "https://example.org/c14-lab/kia";

    @Autowired LabAndNumberMigrationService service;
    @Autowired AbsoluteDatingController controller;
    @Autowired TransactionTemplate tx;
    @PersistenceContext EntityManager em;

    private Fixtures.Full data;

    @BeforeEach
    void setUp() {
        clearDatabase();
        data = tx.execute(status -> Fixtures.full(em));
        // The controller tells the dating kinds apart by the DANTE label of the method.
        jdbc.update("UPDATE dating_method SET label = 'Radiocarbon Dating' WHERE id = 'https://example.org/dating-method/c14'");
    }

    @Test
    void aTakenNumberFailsOnlyItsRow() {
        UUID x1 = newC14Dating("x1");
        UUID x2 = newC14Dating("x2");
        UUID x3 = newC14Dating("x3");

        List<BulkItemStatus> statuses = service.updateAll(List.of(
                c14("1", x1, "KIA-1234"),           // taken by the fixture dating 'a'
                c14("2", x2, "KIA-2000"),
                c14("3", x3, " KIA-2000 "),         // the same number as row 2 (spaces don't count)
                c14("4", data.adC14(), "KIA-1234")  // its own number: no conflict
        ));

        assertEquals("error", statuses.get(0).getStatus());
        assertTrue(statuses.get(0).getMessage().contains("Haithabu › Pit 7 › S-1 › a"), statuses.get(0).getMessage());
        assertEquals("updated", statuses.get(1).getStatus());
        assertEquals("error", statuses.get(2).getStatus());
        assertTrue(statuses.get(2).getMessage().contains("another selected row"), statuses.get(2).getMessage());
        assertEquals("updated", statuses.get(3).getStatus());

        assertEquals("KIA-2000", c14Number(x2));
        assertNull(c14Number(x1));
        assertNull(c14Number(x3));
    }

    @Test
    void aNewLaboratoryIsCreatedOnceAndOnlyForSavedRows() {
        List<BulkItemStatus> statuses = service.updateAll(List.of(
                laboratory("1", data.adDendro(), "dendroDating", "New Lab", "N-1"),
                laboratory("2", data.adOther(), "otherDating", "New Lab", "N-1"),   // other table: the same number is fine
                laboratory("3", data.adC14(), "dendroDating", "Orphan Lab", "N-2")  // no dendro dating -> error
        ));

        assertEquals(List.of("updated", "updated", "error"), statuses.stream().map(BulkItemStatus::getStatus).toList());
        assertEquals(1, labCount("New Lab"));
        assertEquals(0, labCount("Orphan Lab"));
    }

    @Test
    void aTakenDendroNumberOfAnExistingLaboratoryFailsItsRow() {
        UUID x = tx.execute(status -> {
            AbsoluteDating ad = new AbsoluteDating();
            ad.setSubSample("x");
            ad.setSample(em.getReference(Sample.class, data.sample1()));
            ad.setDendrochronologicalDating(new DendrochronologicalDating());
            em.persist(ad);
            return ad.getId();
        });

        List<BulkItemStatus> statuses = service.updateAll(List.of(
                laboratory("1", x, "dendroDating", "Dendro Lab Hamburg", "D-7"),             // taken by the fixture dating 'b'
                laboratory("2", data.adDendro(), "dendroDating", "Dendro Lab Hamburg", "D-7") // its own number
        ));

        assertEquals("error", statuses.get(0).getStatus());
        assertTrue(statuses.get(0).getMessage().contains("D-7"), statuses.get(0).getMessage());
        assertEquals("updated", statuses.get(1).getStatus());
    }

    // Helpers ---------------------------------------------------------------------------------------

    private BulkLabAndNumberItem c14(String clientId, UUID absoluteDatingId, String number) {
        BulkLabAndNumberItem item = item(clientId, absoluteDatingId, "c14Dating", number);
        C14Laboratory lab = new C14Laboratory();
        lab.setId(KIA);
        lab.setLabel("Kiel");
        item.setC14Laboratory(lab);
        return item;
    }

    private BulkLabAndNumberItem laboratory(String clientId, UUID absoluteDatingId, String method, String label, String number) {
        BulkLabAndNumberItem item = item(clientId, absoluteDatingId, method, number);
        Laboratory lab = new Laboratory();
        lab.setLabel(label);
        item.setLaboratory(lab);
        return item;
    }

    private BulkLabAndNumberItem item(String clientId, UUID absoluteDatingId, String method, String number) {
        BulkLabAndNumberItem item = new BulkLabAndNumberItem();
        item.setClientId(clientId);
        item.setAbsoluteDatingId(absoluteDatingId);
        item.setDatingMethod(method);
        item.setNumber(number);
        return item;
    }

    /** A C14 dating without laboratory and number, as the migration creates it. */
    private UUID newC14Dating(String subSample) {
        return tx.execute(status -> {
            AbsoluteDating ad = new AbsoluteDating();
            ad.setSubSample(subSample);
            ad.setSample(em.getReference(Sample.class, data.sample1()));
            ad.setLiteratureList(new HashSet<>());
            ad.setC14Dating(new C14Dating());
            em.persist(ad);
            return ad.getId();
        });
    }

    private String c14Number(UUID absoluteDatingId) {
        return jdbc.queryForObject("SELECT c.number FROM absolute_dating a JOIN c14_dating c ON c.id = a.c14_dating_id WHERE a.id = ?",
                String.class, absoluteDatingId);
    }

    private int labCount(String label) {
        return jdbc.queryForObject("SELECT count(*) FROM laboratory WHERE label = ?", Integer.class, label);
    }
}
