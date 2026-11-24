package arbodat.plus.controller;

import arbodat.plus.Fixtures;
import arbodat.plus.PostgresTest;
import arbodat.plus.model.*;
import arbodat.plus.service.ExcavationYears;
import arbodat.plus.service.LabelConstraints;
import arbodat.plus.service.LabelTakenException;
import arbodat.plus.service.LabelUniqueness;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Year;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Labels are unique, ignoring letter case, as the keys of ArboDat 2018: a research project name, a site
 * within each of its research projects, a feature within its site, a sample within its feature, a
 * sub-sample within its sample.
 * Fixtures: site 'Haithabu' (projects A and B) › feature 'Pit 7' › sample 'S-1' › datings 'a', 'b', 'c'.
 */
class LabelUniquenessTest extends PostgresTest {

    @Autowired ResearchProjectController researchProjectController;
    @Autowired FeatureController featureController;
    @Autowired SampleController sampleController;
    @Autowired AbsoluteDatingController absoluteDatingController;
    @Autowired LabelUniqueness labelUniqueness;
    @Autowired LabelConstraints constraints;
    @Autowired TransactionTemplate tx;
    @PersistenceContext EntityManager em;

    private Fixtures.Full data;

    @BeforeEach
    void setUp() {
        clearDatabase();
        data = tx.execute(status -> Fixtures.full(em));
    }

    // Database --------------------------------------------------------------------------------------

    @Test
    void theDatabaseRefusesTheSameLabelTwice() {
        assertThrows(DuplicateKeyException.class, () -> jdbc.update(
                "INSERT INTO feature (id, site, feature_label) VALUES (?, ?, 'Pit 7')", UUID.randomUUID(), data.site1()));
        assertThrows(DuplicateKeyException.class, () -> jdbc.update(
                "INSERT INTO sample (id, feature_id, sample_label) VALUES (?, ?, 'S-1')", UUID.randomUUID(), data.feature1()));
        assertThrows(DuplicateKeyException.class, () -> jdbc.update(
                "INSERT INTO absolute_dating (id, sample, sub_sample) VALUES (?, ?, 'a')", UUID.randomUUID(), data.sample1()));

        // Without parent (e.g. after deleting it) nothing is unique
        jdbc.update("INSERT INTO feature (id, feature_label) VALUES (?, 'Pit 7')", UUID.randomUUID());
        jdbc.update("INSERT INTO feature (id, feature_label) VALUES (?, 'Pit 7')", UUID.randomUUID());
    }

    @Test
    void atStartTheConstraintIsAddedWhenPossible() {
        jdbc.execute("ALTER TABLE feature DROP CONSTRAINT " + Feature.UNIQUE_LABEL);
        UUID duplicate = UUID.randomUUID();
        jdbc.update("INSERT INTO feature (id, site, feature_label) VALUES (?, ?, 'Pit 7')", duplicate, data.site1());
        try {
            // Duplicates: logged, the constraint waits for them to be corrected
            constraints.run(new DefaultApplicationArguments());
            assertEquals(0, constraintCount(Feature.UNIQUE_LABEL));
        } finally { // corrected: the constraint comes back (and stays for the other tests)
            jdbc.update("UPDATE feature SET feature_label = 'Pit 8' WHERE id = ?", duplicate);
            constraints.run(new DefaultApplicationArguments());
        }
        assertEquals(1, constraintCount(Feature.UNIQUE_LABEL));
    }

    // Features --------------------------------------------------------------------------------------

    @Test
    void aFeatureLabelInOtherLetterCaseIsRefusedWithAReadableReason() {
        LabelTakenException e = assertThrows(LabelTakenException.class,
                () -> tx.executeWithoutResult(status -> featureController.create(feature(data.site1(), "PIT 7"))));
        assertEquals("Feature 'PIT 7' already exists in this site.", e.getMessage());

        // Another label, or the same label in another site: fine
        tx.executeWithoutResult(status -> featureController.create(feature(data.site1(), "Pit 8")));
        tx.executeWithoutResult(status -> featureController.create(feature(data.orphanSite(), "Pit 7")));
        assertEquals(1, count("feature WHERE lower(feature_label) = 'pit 7' AND site = '" + data.site1() + "'"));
    }

    @Test
    void renamingAFeatureToATakenLabelIsRefusedButItsOwnLabelInOtherCaseIsFine() {
        tx.executeWithoutResult(status -> featureController.create(feature(data.site1(), "Pit 8")));
        UUID pit8 = jdbc.queryForObject("SELECT id FROM feature WHERE feature_label = 'Pit 8'", UUID.class);

        assertThrows(LabelTakenException.class,
                () -> tx.executeWithoutResult(status -> featureController.update(feature(data.site1(), "pit 7"), pit8)));

        tx.executeWithoutResult(status -> featureController.update(feature(data.site1(), "PIT 7"), data.feature1()));
        assertEquals("PIT 7", jdbc.queryForObject("SELECT feature_label FROM feature WHERE id = ?", String.class, data.feature1()));
    }

    // Excavation years ------------------------------------------------------------------------------

    @Test
    void excavationYearsAreStoredOnceInOrderAndInvalidOnesAreRefused() {
        Feature feature = feature(data.site1(), "Pit 8");
        feature.setExcavationYears(Arrays.asList(2014, 2013, 2014, null));
        tx.executeWithoutResult(status -> featureController.create(feature));
        UUID pit8 = jdbc.queryForObject("SELECT id FROM feature WHERE feature_label = 'Pit 8'", UUID.class);
        assertEquals(List.of(2013, 2014), excavationYears(pit8));

        Feature future = feature(data.site1(), "Pit 8");
        future.setExcavationYears(new ArrayList<>(List.of(2013, Year.now().getValue() + 1)));
        assertThrows(ExcavationYears.InvalidExcavationYearException.class,
                () -> tx.executeWithoutResult(status -> featureController.update(future, pit8)));
        assertEquals(List.of(2013, 2014), excavationYears(pit8));

        Feature old = feature(data.site1(), "Pit 9");
        old.setExcavationYears(new ArrayList<>(List.of(1650)));
        assertThrows(ExcavationYears.InvalidExcavationYearException.class,
                () -> tx.executeWithoutResult(status -> featureController.create(old)));
        assertEquals(0, count("feature WHERE feature_label = 'Pit 9'"));
    }

    // Samples and sub-samples -----------------------------------------------------------------------

    @Test
    void aSampleLabelInOtherLetterCaseIsRefused() {
        LabelTakenException e = assertThrows(LabelTakenException.class,
                () -> tx.executeWithoutResult(status -> sampleController.create(sample(data.feature1(), "s-1"))));
        assertEquals("Sample 's-1' already exists in this feature.", e.getMessage());

        tx.executeWithoutResult(status -> sampleController.create(sample(data.feature1(), "S-2")));
        UUID s2 = jdbc.queryForObject("SELECT id FROM sample WHERE sample_label = 'S-2'", UUID.class);
        assertThrows(LabelTakenException.class,
                () -> tx.executeWithoutResult(status -> sampleController.update(sample(data.feature1(), "S-1"), s2)));
    }

    @Test
    void aSubSampleInOtherLetterCaseIsRefused() {
        LabelTakenException e = assertThrows(LabelTakenException.class,
                () -> tx.executeWithoutResult(status -> absoluteDatingController.update(dating("A"), data.adDendro())));
        assertEquals("Sub-sample 'A' already exists in this sample.", e.getMessage());

        assertThrows(LabelTakenException.class,
                () -> tx.executeWithoutResult(status -> absoluteDatingController.create(dating("C"))));
    }

    @Test
    void aViolationOfTheLabelConstraintIsReportedAsTakenLabelOthersWithTheirReason() {
        // E.g. another request saved the same label between the check and the save
        assertEquals("The feature could not be saved: its label is already used in this site.",
                featureController.handleDataIntegrityViolation(violation("duplicate key value violates unique constraint \""
                        + Feature.UNIQUE_LABEL + "\"")).getBody());
        assertEquals("The sample could not be saved: its label is already used in this feature.",
                sampleController.handleDataIntegrityViolation(violation("duplicate key value violates unique constraint \""
                        + Sample.UNIQUE_LABEL + "\"")).getBody());

        // Another violation: not a taken label
        String other = "insert or update on table \"sample\" violates foreign key constraint \"fk_x\"";
        assertEquals("The sample could not be saved: " + other,
                sampleController.handleDataIntegrityViolation(violation(other)).getBody());
        assertEquals("The feature could not be saved: " + other,
                featureController.handleDataIntegrityViolation(violation(other)).getBody());
    }

    // Research projects -----------------------------------------------------------------------------

    @Test
    void aResearchProjectNameInOtherLetterCaseIsRefused() {
        ResearchProject project = new ResearchProject();
        project.setProjectName("PROJECT A");
        LabelTakenException e = assertThrows(LabelTakenException.class,
                () -> tx.executeWithoutResult(status -> researchProjectController.create(project)));
        assertEquals("Research project 'PROJECT A' already exists.", e.getMessage());

        // Renaming another project to the name: refused; the project itself in other letter case: fine
        ResearchProject renamed = new ResearchProject();
        renamed.setProjectName("project a");
        renamed.setSiteList(new HashSet<>());
        assertThrows(LabelTakenException.class,
                () -> tx.executeWithoutResult(status -> researchProjectController.update(renamed, data.rpB())));
        labelUniqueness.checkResearchProject("PROJECT A", data.rpA());

        assertThrows(DuplicateKeyException.class, () -> jdbc.update(
                "INSERT INTO research_project (id, project_name) VALUES (?, 'Project A')", UUID.randomUUID()));
        assertEquals(1, count("research_project WHERE lower(project_name) = 'project a'"));
    }

    @Test
    void atStartTheProjectNameConstraintIsAddedWhenPossible() {
        jdbc.execute("ALTER TABLE research_project DROP CONSTRAINT " + ResearchProject.UNIQUE_NAME);
        UUID duplicate = UUID.randomUUID();
        jdbc.update("INSERT INTO research_project (id, project_name) VALUES (?, 'Project A')", duplicate);
        try {
            constraints.run(new DefaultApplicationArguments());
            assertEquals(0, constraintCount(ResearchProject.UNIQUE_NAME));
        } finally {
            jdbc.update("UPDATE research_project SET project_name = 'Project C' WHERE id = ?", duplicate);
            constraints.run(new DefaultApplicationArguments());
        }
        assertEquals(1, constraintCount(ResearchProject.UNIQUE_NAME));
    }

    // Sites -----------------------------------------------------------------------------------------

    @Test
    void aSiteLabelIsUniqueWithinEachResearchProject() {
        ResearchProject projectA = em.find(ResearchProject.class, data.rpA());
        LabelTakenException e = assertThrows(LabelTakenException.class,
                () -> labelUniqueness.checkSite("HAITHABU", List.of(projectA), null));
        assertEquals("Site 'HAITHABU' already exists in this research project.", e.getMessage());

        // Itself, another research project or no research project: fine
        labelUniqueness.checkSite("HAITHABU", List.of(projectA), data.site1());
        ResearchProject other = tx.execute(status -> {
            ResearchProject project = new ResearchProject();
            project.setProjectName("Project D");
            em.persist(project);
            return project;
        });
        labelUniqueness.checkSite("HAITHABU", List.of(other), null);
        labelUniqueness.checkSite("HAITHABU", List.of(), null);
    }

    @Test
    void aResearchProjectCantGetTwoSitesWithTheSameLabel() {
        Site haithabu = new Site();
        haithabu.setLabel("Haithabu");
        Site other = new Site();
        other.setLabel("HAITHABU");
        Site third = new Site();
        third.setLabel("Schleswig");

        assertThrows(LabelTakenException.class, () -> labelUniqueness.checkSitesOfResearchProject(List.of(haithabu, other)));
        labelUniqueness.checkSitesOfResearchProject(List.of(haithabu, third));
    }

    // Helpers ---------------------------------------------------------------------------------------

    private Feature feature(UUID siteId, String label) {
        Feature feature = new Feature();
        Site site = new Site();
        site.setId(siteId);
        feature.setSite(site);
        feature.setLabel(label);
        return feature;
    }

    private Sample sample(UUID featureId, String label) {
        Sample sample = new Sample();
        Feature feature = new Feature();
        feature.setId(featureId);
        sample.setFeature(feature);
        sample.setLabel(label);
        sample.setFractionAnalyzedList(new HashSet<>());
        return sample;
    }

    private AbsoluteDating dating(String subSample) {
        AbsoluteDating dating = new AbsoluteDating();
        Sample sample = new Sample();
        sample.setId(data.sample1());
        dating.setSample(sample);
        dating.setSubSample(subSample);
        dating.setLiteratureList(new HashSet<>());
        return dating;
    }

    private static DataIntegrityViolationException violation(String databaseMessage) {
        return new DataIntegrityViolationException("could not execute statement", new RuntimeException(databaseMessage));
    }

    private List<Integer> excavationYears(UUID featureId) {
        return jdbc.queryForList("SELECT excavation_year FROM excavation_years WHERE feature_id = ? ORDER BY excavation_year",
                Integer.class, featureId);
    }

    private int constraintCount(String name) {
        return jdbc.queryForObject("SELECT count(*) FROM pg_constraint WHERE conname = ?", Integer.class, name);
    }
}
