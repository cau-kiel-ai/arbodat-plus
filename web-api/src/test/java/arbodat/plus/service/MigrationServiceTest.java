package arbodat.plus.service;

import arbodat.plus.PostgresTest;
import arbodat.plus.dto_migration.MigrationResponse;
import arbodat.plus.model.ResearchProject;
import com.healthmarketscience.jackcess.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;

import java.io.File;
import java.io.IOException;
import java.nio.file.Path;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Migration from ArboDat 2018: every site is migrated in its own transaction, a failing site is rolled back
 * completely and reported, the other sites are migrated. The .mdb files are built with Jackcess.
 */
class MigrationServiceTest extends PostgresTest {

    @Autowired MigrationService migrationService;

    @TempDir Path tempDir;

    private File dataFile;
    private File strukDataFile;

    @BeforeEach
    void setUp() throws IOException {
        clearDatabase();
        dataFile = tempDir.resolve("ArchBotDaten.mdb").toFile();
        strukDataFile = tempDir.resolve("ArchBotStrukDat.mdb").toFile();
        createStrukData();
    }

    @Test
    void aFailingSiteIsRolledBackAndTheOthersAreMigrated() throws IOException {
        // 'bad': the sample refers to a feature, which doesn't exist -> the feature is not found
        createData(site("ok"), site("bad").feature("F9"));

        MigrationResponse response = migrate(List.of("ok", "bad"), newResearchProject());

        assertEquals(1, response.getFailedSiteList().size());
        assertEquals("bad", response.getFailedSiteList().get(0).getLabel());

        // 'ok' with its feature, sample and dating; nothing of 'bad' (not even the site or its feature)
        assertEquals(List.of("ok"), jdbc.queryForList("SELECT site_label FROM site", String.class));
        assertEquals(1, count("feature"));
        assertEquals(1, count("sample"));
        assertEquals(1, count("absolute_dating"));
        assertEquals(1, count("research_project"));

        // The lists for the further steps contain only 'ok'
        assertTrue(response.getLabAndNumberList().stream().allMatch(item -> item.getSiteLabel().equals("ok")));
        assertTrue(response.getNonMatchingDanteAttributeList().stream()
                .noneMatch(item -> item.getLabel().equals("bad")));
    }

    @Test
    void nullValuesOfArboDatDontStopTheMigration() throws IOException {
        // gebäud, okErh, Methode and EDatProb are empty in the created rows
        createData(site("ok"));

        MigrationResponse response = migrate(List.of("ok"), newResearchProject());

        assertTrue(response.getFailedSiteList().isEmpty());
        assertEquals(1, count("site"));
        assertEquals(1, count("feature"));
        assertEquals(1, count("sample"));
        assertEquals(1, count("absolute_dating"));
        assertEquals(1, count("other_dating")); // no method -> other dating
        assertEquals(1, response.getResultList().size());
        assertNull(response.getResultList().get(0).getValue().get(0).getResult().getEntryDate());
    }

    @Test
    void entitiesAreInsertedCompletely() throws IOException {
        createData(site("ok"));

        migrate(List.of("ok"), newResearchProject());

        // No empty rows, the ids of the response lists belong to the inserted entities
        assertEquals(0, count("site WHERE site_label IS NULL"));
        assertEquals(0, count("feature WHERE feature_label IS NULL OR site IS NULL"));
        assertEquals(0, count("sample WHERE sample_label IS NULL OR feature_id IS NULL"));
        assertEquals(0, count("absolute_dating WHERE sub_sample IS NULL OR sample IS NULL"));
    }

    @Test
    void ifNoSiteCanBeMigratedTheNewResearchProjectsAreRemoved() throws IOException {
        createData(site("bad").feature("F9"));

        MigrationResponse response = migrate(List.of("bad"), newResearchProject());

        assertEquals(1, response.getFailedSiteList().size());
        assertEquals(0, count("site"));
        assertEquals(0, count("feature"));
        assertEquals(0, count("research_project"));
    }

    @Test
    void aSecondMigrationFindsTheExistingEntities() throws IOException {
        createData(site("ok"));
        migrate(List.of("ok"), newResearchProject());

        MigrationResponse response = migrate(List.of("ok"), existingResearchProject());

        assertTrue(response.getFailedSiteList().isEmpty());
        assertEquals(1, count("site"));
        assertEquals(1, count("feature"));
        assertEquals(1, count("sample"));
        assertEquals(1, count("absolute_dating"));
        assertEquals(1, response.getExistingSiteList().size());
        assertEquals(1, response.getExistingAbsoluteDatingList().size());
    }

    @Test
    void keysInOtherLetterCaseAreMigratedLikeInAccess() throws IOException {
        // Access compares keys case-insensitively: every child row spells its site, feature and sample differently
        createData(site("Ok").featureSite("OK")
                             .sampleKeys("ok", "f1", "S1")
                             .datingKeys("OK", "F1", "s1")
                             .resultKeys("oK", "f1", "s1")
                             .excavationYear("ok", "f1", 2001));

        MigrationResponse response = migrate(List.of("Ok"), newResearchProject());

        assertTrue(response.getFailedSiteList().isEmpty(), () -> String.valueOf(response.getFailedSiteList()));
        assertEquals(List.of("Ok"), jdbc.queryForList("SELECT site_label FROM site", String.class));
        assertEquals(List.of("F1"), jdbc.queryForList("SELECT feature_label FROM feature", String.class));
        assertEquals(1, count("sample"));
        assertEquals(1, count("absolute_dating"));

        // Everything is assigned to its parent, nothing is lost
        assertEquals(1, count("sample s JOIN feature f ON s.feature_id = f.id"));
        assertEquals(1, count("absolute_dating d JOIN sample s ON d.sample = s.id"));
        assertEquals(List.of(2001), jdbc.queryForList("SELECT excavation_year FROM excavation_years", Integer.class));
        UUID sampleId = jdbc.queryForObject("SELECT id FROM sample", UUID.class);
        assertEquals(sampleId, response.getResultList().get(0).getValue().get(0).getSampleId());

        // The lists for the further steps use the site label as spelled in 'Projekte'
        assertEquals("Ok", response.getResultList().get(0).getKey());
        assertEquals("Ok", response.getLabAndNumberList().get(0).getSiteLabel());
    }

    @Test
    void aSecondMigrationFindsTheExistingEntitiesAlsoInOtherLetterCase() throws IOException {
        createData(site("Ok").featureSite("OK")
                             .sampleKeys("ok", "f1", "S1")
                             .datingKeys("OK", "F1", "s1")
                             .resultKeys("oK", "f1", "s1"));
        migrate(List.of("Ok"), newResearchProject());

        MigrationResponse response = migrate(List.of("Ok"), existingResearchProject());

        assertTrue(response.getFailedSiteList().isEmpty(), () -> String.valueOf(response.getFailedSiteList()));
        assertEquals(1, count("site"));
        assertEquals(1, count("feature"));
        assertEquals(1, count("sample"));
        assertEquals(1, count("absolute_dating"));
        assertEquals(1, response.getExistingFeatureList().size());
        assertEquals(1, response.getExistingSampleList().size());
        assertEquals(1, response.getExistingAbsoluteDatingList().size());
    }

    @Test
    void rowsOfOtherSitesAreNotMixedIn() throws IOException {
        // 'ok2' starts like 'ok' and 'OK2' differs only in letter case from 'ok2'
        createData(site("ok"), site("ok2").featureSite("OK2"));

        MigrationResponse response = migrate(List.of("ok"), newResearchProject());

        assertTrue(response.getFailedSiteList().isEmpty());
        assertEquals(List.of("ok"), jdbc.queryForList("SELECT site_label FROM site", String.class));
        assertEquals(1, count("feature"));
        assertEquals(1, count("sample"));
    }

    // Helpers -------------------------------------------------------------------------------------

    private MigrationResponse migrate(List<String> siteLabels, ResearchProject researchProject) {
        return migrationService.migrateData(dataFile.getAbsolutePath(), strukDataFile.getAbsolutePath(),
                                            new ArrayList<>(List.of(researchProject)), siteLabels);
    }

    private ResearchProject newResearchProject() {
        ResearchProject researchProject = new ResearchProject();
        researchProject.setProjectName("Migration test");
        return researchProject;
    }

    private ResearchProject existingResearchProject() {
        ResearchProject researchProject = new ResearchProject();
        researchProject.setId(jdbc.queryForObject("SELECT id FROM research_project", UUID.class));
        return researchProject;
    }

    private void createStrukData() throws IOException {
        try (Database db = DatabaseBuilder.create(Database.FileFormat.V2000, strukDataFile)) {
            Table fractions = new TableBuilder("Fraktionen")
                    .addColumn(new ColumnBuilder("Nummer", DataType.INT))
                    .addColumn(new ColumnBuilder("Fraktion", DataType.TEXT))
                    .toTable(db);
            Object[][] values = {{5, "ORG 2,0"}, {10, "ORG 1,0"}, {20, "ORG 0,5"}, {30, "ORG 0,25"},
                                 {35, "MIN 2,0"}, {40, "MIN 1,0"}, {50, "MIN 0,5"}, {60, "MIN 0,25"}};
            for (Object[] value : values) {
                fractions.addRow((short) (int) (Integer) value[0], value[1]);
            }
        }
    }

    // One feature 'F1', sample 'S1', dating 'U1' and result per site (keys as given by SiteRows).
    // Nullable fields (gebäud, okErh, Methode, EDatProb) are empty.
    private void createData(SiteRows... siteRowsList) throws IOException {
        try (Database db = DatabaseBuilder.create(Database.FileFormat.V2000, dataFile)) {
            Table sites = table(db, "Projekte",
                    text("Projekt", "Fustel", "EVNr", "NaturE", "ArchAusg", "ArchBear", "BotBear", "KoordSys", "TK",
                         "Land", "Staat", "Kreis", "Ort", "FlurStr", "Aut", "PublJahr"),
                    Map.of("okFustel", DataType.BOOLEAN, "Limes", DataType.BOOLEAN, "AnmFustel", DataType.MEMO,
                           "rWert", DataType.DOUBLE, "hWert", DataType.DOUBLE, "üNN", DataType.DOUBLE));
            Table features = table(db, "Befunde",
                    text("Projekt", "Befu", "FlSchn", "FustelTyp", "BefuTyp", "BotBest", "BestJa"),
                    Map.of("Anmerkung", DataType.MEMO, "okBefu", DataType.BOOLEAN, "gebäud", DataType.INT,
                           "FuTypVermut", DataType.BOOLEAN, "okErh", DataType.INT));
            Table excavationYears = table(db, "Grabungsjahre", text("Projekt", "Befu"), Map.of("Jahr", DataType.INT));
            Map<String, DataType> sampleTypes = new HashMap<>(Map.of(
                    "Vorfu", DataType.BOOLEAN, "SedProb", DataType.BOOLEAN, "Trocken", DataType.BOOLEAN,
                    "AnmProb", DataType.MEMO, "TiefeVon", DataType.FLOAT, "TiefeBis", DataType.FLOAT,
                    "ProbVol", DataType.FLOAT, "Prob_üNN", DataType.FLOAT,
                    "GesamtgewichtHK", DataType.DOUBLE, "GewichtHK_unbestimmt", DataType.DOUBLE));
            sampleTypes.putAll(Map.of("KoordX", DataType.DOUBLE, "KoordY", DataType.DOUBLE, "KoordZ", DataType.DOUBLE));
            Table samples = table(db, "Proben",
                    text("Projekt", "Befu", "ProbNr", "Strat", "Schi", "Quadr", "Plan", "ChronoDat", "ArchDat",
                         "KultGr", "ProbTyp", "Inventar_SaFr", "Inventar_HK", "Inventar_Holz_sf",
                         "ORG2_0", "ORG1_0", "ORG0_5", "ORG0_25", "MIN2_0", "MIN1_0", "MIN0_5", "MIN0_25"),
                    sampleTypes);
            Table datings = table(db, "Datierung",
                    text("Projekt", "Befu", "ProbNr", "Unterprobe", "Anmerkungen", "Material", "Methode",
                         "C14 cal", "Dendroalter", "Alter andere", "Labornummer"),
                    Map.of("C14-Alter BP", DataType.LONG, "Standardab C14", DataType.LONG,
                           "13C PDB-Wert", DataType.DOUBLE, "Standardab 13C PDB", DataType.DOUBLE,
                           "pMC-Wert", DataType.DOUBLE, "Standardab PMC", DataType.DOUBLE,
                           "Waldkante", DataType.BOOLEAN));
            Table results = table(db, "Details",
                    text("Projekt", "Befu", "ProbNr", "PCODE", "Fraktion", "Zust", "RTyp", "cf"),
                    Map.of("rAnzahl", DataType.LONG, "rGewicht", DataType.DOUBLE, "geschätzt", DataType.BOOLEAN,
                           "rFrag", DataType.LONG, "Multiplikator", DataType.DOUBLE, "AnmFrakt", DataType.MEMO,
                           "EDatProb", DataType.SHORT_DATE_TIME));

            for (SiteRows site : siteRowsList) {
                addRow(sites, Map.of("Projekt", site.site, "okFustel", true, "Limes", false));
                addRow(features, Map.of("Projekt", site.featureSite, "Befu", "F1", "okBefu", true, "FustelTyp", "-99"));
                if (site.excavationYear != null) {
                    addRow(excavationYears, Map.of("Projekt", site.yearKeys[0], "Befu", site.yearKeys[1],
                                                   "Jahr", (short) (int) site.excavationYear));
                }
                addRow(samples, Map.of("Projekt", site.sampleKeys[0], "Befu", site.sampleKeys[1],
                                       "ProbNr", site.sampleKeys[2], "Trocken", true, "ORG1_0", "ja"));
                addRow(datings, Map.of("Projekt", site.datingKeys[0], "Befu", site.datingKeys[1],
                                       "ProbNr", site.datingKeys[2], "Unterprobe", "U1", "Labornummer", "KIA 1"));
                addRow(results, Map.of("Projekt", site.resultKeys[0], "Befu", site.resultKeys[1],
                                       "ProbNr", site.resultKeys[2], "PCODE", "TRDIC", "Fraktion", "ORG 1,0",
                                       "Zust", "vk", "RTyp", "Sa/Fr", "cf", "-", "rAnzahl", 3));
            }
        }
    }

    private static SiteRows site(String site) {
        return new SiteRows(site);
    }

    // Keys (site, feature, sample) of the rows of one site in the child tables, default: 'site', 'F1', 'S1'
    private static class SiteRows {
        final String site;
        String featureSite;
        String[] sampleKeys;
        String[] datingKeys;
        String[] resultKeys;
        String[] yearKeys;
        Integer excavationYear;

        SiteRows(String site) {
            this.site = site;
            featureSite = site;
            sampleKeys = new String[]{site, "F1", "S1"};
            datingKeys = new String[]{site, "F1", "S1"};
            resultKeys = new String[]{site, "F1", "S1"};
        }

        // Feature of the sample, dating and result
        SiteRows feature(String feature) {
            sampleKeys[1] = feature;
            datingKeys[1] = feature;
            resultKeys[1] = feature;
            return this;
        }

        SiteRows featureSite(String site) {
            featureSite = site;
            return this;
        }

        SiteRows sampleKeys(String site, String feature, String sample) {
            sampleKeys = new String[]{site, feature, sample};
            return this;
        }

        SiteRows datingKeys(String site, String feature, String sample) {
            datingKeys = new String[]{site, feature, sample};
            return this;
        }

        SiteRows resultKeys(String site, String feature, String sample) {
            resultKeys = new String[]{site, feature, sample};
            return this;
        }

        SiteRows excavationYear(String site, String feature, int year) {
            yearKeys = new String[]{site, feature};
            excavationYear = year;
            return this;
        }
    }

    // Jackcess writes back into the given row map -> mutable copy
    private static void addRow(Table table, Map<String, Object> row) throws IOException {
        table.addRowFromMap(new HashMap<>(row));
    }

    private static List<String> text(String... names) {
        return List.of(names);
    }

    private static Table table(Database db, String name, List<String> textColumns, Map<String, DataType> otherColumns)
            throws IOException {
        TableBuilder builder = new TableBuilder(name);
        for (String column : textColumns) {
            builder.addColumn(new ColumnBuilder(column, DataType.TEXT));
        }
        for (Map.Entry<String, DataType> column : otherColumns.entrySet()) {
            builder.addColumn(new ColumnBuilder(column.getKey(), column.getValue()));
        }
        return builder.toTable(db);
    }
}
