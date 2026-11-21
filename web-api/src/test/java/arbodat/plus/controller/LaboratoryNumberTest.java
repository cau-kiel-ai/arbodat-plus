package arbodat.plus.controller;

import arbodat.plus.Fixtures;
import arbodat.plus.PostgresTest;
import arbodat.plus.model.*;
import arbodat.plus.service.LabNumberConstraints;
import arbodat.plus.service.LaboratoryNumberTakenException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.HashSet;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/** Laboratory + number identify one C14, dendro or other dating. */
class LaboratoryNumberTest extends PostgresTest {

    private static final String KIA = "https://example.org/c14-lab/kia";

    @Autowired AbsoluteDatingController controller;
    @Autowired LabNumberConstraints constraints;
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
    void theDatabaseRefusesASecondDatingWithTheSameNumber() {
        assertThrows(DuplicateKeyException.class, () -> jdbc.update(
                "INSERT INTO c14_dating (id, c14_laboratory, number) VALUES (?, ?, 'KIA-1234')", UUID.randomUUID(), KIA));
        // Without laboratory or number, nothing is unique.
        jdbc.update("INSERT INTO c14_dating (id, number) VALUES (?, 'KIA-1234')", UUID.randomUUID());
        jdbc.update("INSERT INTO c14_dating (id, number) VALUES (?, 'KIA-1234')", UUID.randomUUID());
    }

    @Test
    void aNewDatingWithATakenNumberIsRefusedWithAReadableReason() {
        for (String number : new String[]{"KIA-1234", "  KIA-1234 "}) {
            LaboratoryNumberTakenException e = assertThrows(
                    LaboratoryNumberTakenException.class,
                    () -> tx.executeWithoutResult(status -> controller.create(c14Dating("new", number))));
            assertTrue(e.getMessage().contains("KIA-1234") && e.getMessage().contains("Haithabu › Pit 7 › S-1 › a"), e.getMessage());
        }
        tx.executeWithoutResult(status -> controller.create(c14Dating("new", "KIA-9999")));
        assertEquals(2, count("c14_dating"));
    }

    @Test
    void updatingADatingChangesItInsteadOfLeavingTheOldOneBehind() {
        UUID c14Id = jdbc.queryForObject("SELECT c14_dating_id FROM absolute_dating WHERE id = ?", UUID.class, data.adC14());
        for (int i = 0; i < 2; i++) { // the form sends the dating without its id
            tx.executeWithoutResult(status -> controller.update(c14Dating("a", "KIA-1234"), data.adC14()));
        }
        assertEquals(1, count("c14_dating"));
        assertEquals(c14Id, jdbc.queryForObject("SELECT c14_dating_id FROM absolute_dating WHERE id = ?", UUID.class, data.adC14()));

        // Another method: the C14 dating goes.
        AbsoluteDating dendro = c14Dating("a", null);
        dendro.getDatingMethod().setLabel("Dendrochronology");
        dendro.setC14Dating(null);
        dendro.setDendrochronologicalDating(new DendrochronologicalDating());
        tx.executeWithoutResult(status -> controller.update(dendro, data.adC14()));
        assertEquals(0, count("c14_dating"));
    }

    @Test
    void atStartUnreachableDatingsGoAndTheConstraintIsAddedWhenPossible() {
        jdbc.execute("ALTER TABLE c14_dating DROP CONSTRAINT uk_c14_dating_laboratory_number");
        // Left behind by an update in an earlier version: same number, no absolute dating.
        jdbc.update("INSERT INTO c14_dating (id, c14_laboratory, number) VALUES (?, ?, 'KIA-1234')", UUID.randomUUID(), KIA);

        constraints.run(new DefaultApplicationArguments());
        assertEquals(1, count("c14_dating"));
        assertEquals(1, constraintCount());

        // Real duplicates (both in use): logged, the constraint waits for them to be corrected.
        jdbc.execute("ALTER TABLE c14_dating DROP CONSTRAINT uk_c14_dating_laboratory_number");
        UUID duplicate = UUID.randomUUID();
        jdbc.update("INSERT INTO c14_dating (id, c14_laboratory, number) VALUES (?, ?, 'KIA-1234')", duplicate, KIA);
        jdbc.update("UPDATE absolute_dating SET c14_dating_id = ? WHERE id = ?", duplicate, data.adOther());
        try {
            constraints.run(new DefaultApplicationArguments());
            assertEquals(2, count("c14_dating"));
            assertEquals(0, constraintCount());
        } finally { // corrected: the constraint comes back (and stays for the other tests)
            jdbc.update("UPDATE c14_dating SET number = 'KIA-5678' WHERE id = ?", duplicate);
            constraints.run(new DefaultApplicationArguments());
        }
        assertEquals(1, constraintCount());
    }

    private int constraintCount() {
        return jdbc.queryForObject("SELECT count(*) FROM pg_constraint WHERE conname = 'uk_c14_dating_laboratory_number'", Integer.class);
    }

    /** An absolute dating as the input form sends it: a C14 dating without id. */
    private AbsoluteDating c14Dating(String subSample, String number) {
        AbsoluteDating ad = new AbsoluteDating();
        ad.setSubSample(subSample);
        ad.setSample(em.getReference(Sample.class, data.sample1()));
        ad.setLiteratureList(new HashSet<>());
        DatingMethod method = new DatingMethod();
        method.setId("https://example.org/dating-method/c14");
        method.setLabel("Radiocarbon Dating");
        ad.setDatingMethod(method);
        C14Laboratory lab = new C14Laboratory();
        lab.setId(KIA);
        lab.setLabel("Kiel");
        C14Dating c14 = new C14Dating();
        c14.setC14Laboratory(lab);
        c14.setNumber(number);
        c14.setC14AgeBp(1100);
        ad.setC14Dating(c14);
        return ad;
    }
}
