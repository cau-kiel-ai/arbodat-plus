package arbodat.plus.dataimport;

import arbodat.plus.Fixtures;
import arbodat.plus.PostgresTest;
import arbodat.plus.exchange.EntityType;
import arbodat.plus.service.ExportFilter;
import arbodat.plus.service.ExportService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.TextNode;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.*;
import java.util.function.Consumer;
import java.util.zip.GZIPOutputStream;

import static arbodat.plus.CanonicalJson.canonical;
import static org.junit.jupiter.api.Assertions.*;

class ImportServiceTest extends PostgresTest {

    private static final List<String> DATA_TABLES = List.of("research_project", "site", "feature", "sample",
            "fraction_analyzed", "absolute_dating", "c14_dating", "dendrochronological_dating", "other_dating", "result",
            "users", "institution", "literature", "author", "laboratory", "address", "coordinate",
            "site_research_project_relation", "site_directors", "archaeologists", "institutions", "site_type_relation",
            "literature_site_relation", "literature_absolute_dating_relation", "literature_author_relation",
            "user_institution_relation", "botanical_determination_by", "result_absolute_dating_relation",
            "activity_numbers", "excavation_years", "tax_code", "site_type");

    @Autowired ImportService importService;
    @Autowired ExportService exportService;
    @Autowired TransactionTemplate tx;
    @PersistenceContext EntityManager em;

    private final ObjectMapper mapper = new ObjectMapper();
    private Fixtures.Full data;

    @BeforeEach
    void setUp() {
        clearDatabase();
        data = tx.execute(status -> Fixtures.full(em));
    }

    // Round trips -------------------------------------------------------------------------------

    @Test
    void importIntoAnEmptyDatabaseRecreatesEverythingWithTheSameIds() throws Exception {
        // As found in real data: empty strings, and a coordinate with every field empty.
        jdbc.update("UPDATE research_project SET funder = '' WHERE id = ?", data.rpB());
        UUID emptyCoordinate = UUID.randomUUID();
        jdbc.update("INSERT INTO coordinate (id) VALUES (?)", emptyCoordinate);
        jdbc.update("UPDATE site SET coordinate = ? WHERE id = ?", emptyCoordinate, data.orphanSite());
        byte[] file = exportAll();
        clearDatabase();

        PlanView plan = preview(file, null);
        assertTrue(plan.canCommit());
        assertTrue(plan.summary().stream().allMatch(s -> s.create() == s.total()), plan.summary().toString());

        commit(file, plan, null);
        assertEquals(canonical(withoutExportTime(file)), canonical(withoutExportTime(exportAll())));
    }

    @Test
    void importingTheSameFileAgainChangesNothing() throws Exception {
        byte[] file = exportAll();
        Map<String, Integer> before = counts();

        PlanView plan = preview(file, null);
        assertTrue(plan.canCommit());
        assertTrue(plan.summary().stream().allMatch(s -> s.matchById() == s.total()), plan.summary().toString());
        assertEquals(0, plan.conflictTotal());
        assertEquals(0, plan.fillTotal());
        assertEquals(0, plan.linkTotal());
        assertTrue(plan.newLookups().isEmpty());

        ImportService.CommitResult result = commit(file, plan, null);
        assertTrue(result.outcomes().isEmpty(), result.outcomes().toString());
        assertEquals(0, result.links());
        assertEquals(before, counts());
    }

    @Test
    void readsTheOldBareArrayFormat() throws Exception {
        JsonNode envelope = json(exportAll());
        byte[] legacy = mapper.writeValueAsBytes(envelope.get("researchProjects"));
        clearDatabase();

        PlanView plan = preview(legacy, null);
        assertEquals(0, plan.file().formatVersion());
        commit(legacy, plan, null);
        assertEquals(2, count("research_project"));
        assertEquals(1, count("site")); // the site without research project isn't in the old format
    }

    @Test
    void readsGzippedFiles() throws Exception {
        byte[] file = exportAll();
        ByteArrayOutputStream gz = new ByteArrayOutputStream();
        try (GZIPOutputStream out = new GZIPOutputStream(gz)) {
            out.write(file);
        }
        clearDatabase();
        commit(gz.toByteArray(), preview(gz.toByteArray(), null), null);
        assertEquals(2, count("site"));
    }

    @Test
    void rejectsNewerFormatsAndBrokenFiles() throws Exception {
        ObjectNode newer = (ObjectNode) json(exportAll());
        newer.put("formatVersion", 99);
        ImportException e = assertThrows(ImportException.class, () -> preview(mapper.writeValueAsBytes(newer), null));
        assertEquals("NEWER_FORMAT", e.reason());

        e = assertThrows(ImportException.class, () -> preview("{\"formatVersion\": 1, \"researchProjects\": [".getBytes(), null));
        assertEquals("INVALID_FILE", e.reason());
        e = assertThrows(ImportException.class, () -> preview("{\"researchProjects\": []}".getBytes(), null));
        assertEquals("INVALID_FILE", e.reason());
        e = assertThrows(ImportException.class, () -> preview(
                "{\"formatVersion\": 1, \"researchProjects\": [{\"id\": \"not-a-uuid\"}]}".getBytes(), null));
        assertEquals("INVALID_FILE", e.reason());
        assertTrue(e.getMessage().contains("/researchProjects/0/id"), e.getMessage());
    }

    @Test
    void unknownFieldsAreWarningsNotErrors() throws Exception {
        ObjectNode file = (ObjectNode) json(exportAll());
        ((ObjectNode) file.get("researchProjects").get(0)).put("colour", "blue");
        PlanView plan = preview(mapper.writeValueAsBytes(file), null);
        assertTrue(plan.warnings().stream().anyMatch(w -> w.code().equals("UNKNOWN_FIELD") && w.message().contains("colour")));
    }

    // Matching ---------------------------------------------------------------------------------

    @Test
    void dataFromAnotherInstallMatchesByLabelsAndIdentifiers() throws Exception {
        byte[] file = otherInstall(exportAll(), json -> {});
        Map<String, Integer> before = counts();

        PlanView plan = preview(file, null);
        assertTrue(plan.canCommit(), plan.toString());
        for (PlanView.TypeSummary s : plan.summary()) {
            if (s.type().isLookup()) {
                assertEquals(s.total(), s.matchById(), s.toString());
            } else {
                assertEquals(s.total(), s.matchByKey(), s.toString()); // incl. the result whose key has nulls
            }
        }
        assertEquals(0, plan.conflictTotal());
        assertEquals(0, plan.fillTotal());
        assertEquals(0, plan.linkTotal()); // links remapped onto the matched records: all exist already

        commit(file, plan, null);
        assertEquals(before, counts());
    }

    @Test
    void labelsInOtherLetterCaseMatchTheExistingRecords() throws Exception {
        byte[] file = otherInstall(exportAll(), json -> {
            JsonNode project = json.get("researchProjects").get(0);
            ((ObjectNode) project).put("projectName", project.get("projectName").asText().toUpperCase());
            JsonNode site = json.get("researchProjects").get(0).get("sites").get(0);
            ((ObjectNode) site).put("label", site.get("label").asText().toUpperCase());
            JsonNode feature = site.get("features").get(0);
            ((ObjectNode) feature).put("label", feature.get("label").asText().toUpperCase());
            JsonNode sample = firstSample(json);
            ((ObjectNode) sample).put("label", sample.get("label").asText().toLowerCase());
        });
        Map<String, Integer> before = counts();

        PlanView plan = preview(file, null);
        for (EntityType type : List.of(EntityType.RESEARCH_PROJECT, EntityType.SITE, EntityType.FEATURE, EntityType.SAMPLE,
                                       EntityType.ABSOLUTE_DATING)) {
            PlanView.TypeSummary s = summary(plan, type);
            assertEquals(s.total(), s.matchByKey(), s.toString());
        }
        assertEquals(before, counts());
    }

    @Test
    void sameIdWinsOverADifferentLabel() throws Exception {
        byte[] file = exportAll();
        jdbc.update("UPDATE site SET site_label = 'Hedeby' WHERE id = ?", data.site1());

        PlanView plan = preview(file, null);
        PlanView.Conflict conflict = single(plan.conflicts());
        assertEquals("label", conflict.field());
        assertEquals("Hedeby", conflict.existing());
        assertEquals("Haithabu", conflict.imported());
        assertFalse(conflict.take());

        commit(file, plan, null); // default: keep
        assertEquals("Hedeby", siteLabel(data.site1()));

        Decisions take = new Decisions(null, null, new Decisions.Conflicts(null, null, null, null, Map.of(conflict.key(), "TAKE")));
        commit(file, preview(file, take), take);
        assertEquals("Haithabu", siteLabel(data.site1()));
    }

    @Test
    void emptyFieldsAreFilledAndImportedEmptiesNeverErase() throws Exception {
        byte[] file = otherInstall(exportAll(), json -> {
            ObjectNode site = (ObjectNode) json.get("researchProjects").get(0).get("sites").get(0);
            site.putNull("siteNumber");
        });
        jdbc.update("UPDATE site SET remarks_site = NULL WHERE id = ?", data.site1());

        PlanView plan = preview(file, null);
        assertEquals(0, plan.conflictTotal());
        PlanView.Fill fill = single(plan.fills());
        assertEquals("remarks", fill.field());

        commit(file, plan, null);
        assertEquals("Viking age trading place", jdbc.queryForObject("SELECT remarks_site FROM site WHERE id = ?", String.class, data.site1()));
        assertEquals("SN-42", jdbc.queryForObject("SELECT site_number FROM site WHERE id = ?", String.class, data.site1()));
    }

    @Test
    void linksAndValueListsOnlyGrow() throws Exception {
        byte[] file = exportAll();
        jdbc.update("DELETE FROM site_type_relation WHERE site_id = ? AND site_type_id = 'https://example.org/site-type/burial'", data.site1());
        jdbc.update("DELETE FROM activity_numbers WHERE site_id = ? AND activity_number = 'AN-2'", data.site1());
        jdbc.update("INSERT INTO activity_numbers (site_id, activity_number) VALUES (?, 'AN-local')", data.site1());

        PlanView plan = preview(file, null);
        assertEquals(2, plan.linkTotal());
        commit(file, plan, null);

        assertEquals(Set.of("AN-1", "AN-2", "AN-local"), Set.copyOf(jdbc.queryForList(
                "SELECT activity_number FROM activity_numbers WHERE site_id = ?", String.class, data.site1())));
        assertEquals(2, (int) jdbc.queryForObject("SELECT count(*) FROM site_type_relation WHERE site_id = ?", Integer.class, data.site1()));
    }

    @Test
    void aSiteListedUnderAnExistingAndANewResearchProjectIsLinkedToBoth() throws Exception {
        byte[] file = otherInstall(exportAll(), json -> {
            for (JsonNode rp : json.get("researchProjects")) {
                if (rp.get("projectName").textValue().equals("Project B")) ((ObjectNode) rp).put("projectName", "Project C");
            }
        });
        PlanView plan = preview(file, null);
        assertEquals(1, summary(plan, EntityType.RESEARCH_PROJECT).create());
        assertEquals(0, summary(plan, EntityType.SITE).create());

        commit(file, plan, null);
        assertEquals(3, count("research_project"));
        assertEquals(3, (int) jdbc.queryForObject(
                "SELECT count(*) FROM site_research_project_relation WHERE site_id = ?", Integer.class, data.site1()));
    }

    @Test
    void severalCandidatesNeedAChoiceAndBlockTheCommitUntilThen() throws Exception {
        byte[] file = otherInstall(exportAll(), json -> {});
        // A second "Haithabu" in Project A.
        UUID twin = UUID.randomUUID();
        jdbc.update("INSERT INTO site (id, site_label) VALUES (?, 'Haithabu')", twin);
        jdbc.update("INSERT INTO site_research_project_relation (site_id, research_project_id) VALUES (?, ?)", twin, data.rpA());

        PlanView plan = preview(file, null);
        assertFalse(plan.canCommit());
        PlanView.Ambiguity ambiguity = single(plan.ambiguities());
        assertEquals(EntityType.SITE, ambiguity.type());
        assertEquals(2, ambiguity.candidates().size());
        assertTrue(summary(plan, EntityType.FEATURE).pending() > 0);

        ImportException e = assertThrows(ImportException.class, () -> commit(file, plan, null));
        assertEquals("UNRESOLVED", e.reason());

        // Choosing the original: its children match below it, nothing new.
        Decisions choose = new Decisions(null, Map.of(ambiguity.key(), data.site1().toString()), null);
        PlanView chosen = preview(file, choose);
        assertTrue(chosen.canCommit());
        assertEquals(0, summary(chosen, EntityType.FEATURE).create());
        Map<String, Integer> before = counts();
        commit(file, chosen, choose);
        assertEquals(before, counts());

        // Choosing "new": the whole site is created again, with its subtree.
        Decisions createNew = new Decisions(null, Map.of(ambiguity.key(), Decisions.NEW), null);
        PlanView fresh = preview(file, createNew);
        assertEquals(1, summary(fresh, EntityType.SITE).create());
        assertEquals(1, summary(fresh, EntityType.FEATURE).create());
        commit(file, fresh, createNew);
        assertEquals(4, count("site"));
    }

    @Test
    void twoImportedSitesWithTheSameLabelUnderANewProjectStayTwo() throws Exception {
        byte[] file = otherInstall(exportAll(), json -> {
            ObjectNode rp = (ObjectNode) json.get("researchProjects").get(0);
            rp.put("projectName", "Brand new project");
            ArrayNode sites = (ArrayNode) rp.get("sites");
            ObjectNode copy = sites.get(0).deepCopy();
            reassignIds(copy, new HashMap<>());
            copy.findParents("number").forEach(dating -> ((ObjectNode) dating).putNull("number")); // lab numbers are unique
            sites.add(copy);
        });
        PlanView plan = preview(file, null);
        assertTrue(plan.canCommit());
        commit(file, plan, null);
        assertEquals(2, (int) jdbc.queryForObject("SELECT count(*) FROM site s JOIN site_research_project_relation r ON r.site_id = s.id"
                + " JOIN research_project p ON p.id = r.research_project_id WHERE p.project_name = 'Brand new project'", Integer.class));
    }

    @Test
    void peopleMatchByOrcidWhateverItsSpelling() throws Exception {
        jdbc.update("UPDATE users SET orcid = 'https://orcid.org/0000-0002-1825-0097', last_name = 'Mueller' WHERE id = ?", data.user1());
        byte[] file = otherInstall(exportAll(), json -> {
            for (JsonNode user : json.get("researchProjects").get(0).get("sites").get(0).get("siteDirectors")) {
                ((ObjectNode) user).put("orcid", "0000-0002-1825-0097");
                ((ObjectNode) user).put("lastName", "Müller");
            }
        });
        PlanView plan = preview(file, null);
        assertEquals(0, summary(plan, EntityType.USER).create(), plan.summary().toString());
        assertTrue(plan.conflicts().stream().anyMatch(c -> c.type() == EntityType.USER && c.field().equals("lastName")));
    }

    @Test
    void unknownVocabularyIsCreatedAndKnownKeepsItsLabels() throws Exception {
        byte[] file = exportAll();
        jdbc.update("UPDATE tax_code SET label = 'Triticum sp.' WHERE id = 'https://example.org/tax-code/triticum'");
        clearVocabulary("https://example.org/site-type/burial");

        PlanView plan = preview(file, null);
        assertEquals(List.of("https://example.org/site-type/burial"), plan.newLookups().stream().map(PlanView.Lookup::id).toList());
        assertTrue(plan.lookupLabelDiffs().stream().anyMatch(d -> d.field().equals("label") && d.existing().equals("Triticum sp.")));

        commit(file, plan, null);
        assertEquals("Triticum sp.", jdbc.queryForObject("SELECT label FROM tax_code WHERE id = 'https://example.org/tax-code/triticum'", String.class));
        assertEquals("Burial", jdbc.queryForObject("SELECT label FROM site_type WHERE id = 'https://example.org/site-type/burial'", String.class));
    }

    @Test
    void resultLinksToDatingsFollowTheMatchedDatingsAndSkipMissingOnes() throws Exception {
        byte[] file = otherInstall(exportAll(), json -> {
            ObjectNode sample = (ObjectNode) json.get("researchProjects").get(0).get("sites").get(0)
                    .get("features").get(0).get("samples").get(0);
            for (JsonNode result : sample.get("results")) {
                ArrayNode ids = (ArrayNode) result.get("absoluteDatingIds");
                if (!ids.isEmpty()) ids.add(UUID.randomUUID().toString()); // a dating nobody has
            }
        });
        PlanView plan = preview(file, null);
        assertTrue(plan.warnings().stream().anyMatch(w -> w.code().equals("MISSING_REFERENCE")));
        assertEquals(0, plan.linkTotal());
        commit(file, plan, null);
        assertEquals(2, count("result_absolute_dating_relation"));
    }

    @Test
    void aDatingWithTheSameLaboratoryNumberIsTheSameDatingAndStaysWithItsAbsoluteDating() throws Exception {
        // Another install, where the absolute dating with the C14 dating has another sub-sample.
        byte[] file = otherInstall(exportAll(), json -> {
            for (JsonNode ad : firstSample(json).get("absoluteDatings")) {
                if (ad.get("c14Dating").isObject()) ((ObjectNode) ad).put("subSample", "a-renamed");
            }
        });
        PlanView plan = preview(file, null);
        assertTrue(plan.canCommit(), plan.errors().toString());
        assertEquals(1, summary(plan, EntityType.ABSOLUTE_DATING).create());
        assertEquals(1, summary(plan, EntityType.C14_DATING).matchByKey());
        assertTrue(plan.warnings().stream().anyMatch(w -> w.code().equals("DATING_ELSEWHERE")), plan.warnings().toString());

        commit(file, plan, null);
        assertEquals(1, count("c14_dating"));
        assertEquals(1, (int) jdbc.queryForObject("SELECT count(*) FROM absolute_dating WHERE sub_sample = 'a-renamed' AND c14_dating_id IS NULL", Integer.class));
    }

    @Test
    void twoDatingsWithOneLaboratoryNumberInTheFileBlockTheImport() throws Exception {
        byte[] file = otherInstall(exportAll(), json -> {
            ArrayNode ads = (ArrayNode) firstSample(json).get("absoluteDatings");
            for (JsonNode ad : ads) {
                if (ad.get("c14Dating").isObject()) {
                    ObjectNode copy = ad.deepCopy();
                    reassignIds(copy, new HashMap<>());
                    copy.put("subSample", "z");
                    ads.add(copy);
                    break;
                }
            }
        });
        PlanView plan = preview(file, null);
        assertFalse(plan.canCommit());
        assertTrue(plan.errors().stream().anyMatch(e -> e.code().equals("LAB_NUMBER_TWICE")), plan.errors().toString());
        assertThrows(ImportException.class, () -> commit(file, plan, null));
    }

    @Test
    void aChildMatchedByIdUnderAnotherParentIsAParentConflict() throws Exception {
        byte[] file = exportAll();
        jdbc.update("UPDATE feature SET site = ? WHERE id = ?", data.orphanSite(), data.feature1());

        PlanView plan = preview(file, null);
        PlanView.Conflict conflict = single(plan.conflicts());
        assertEquals("site", conflict.field());
        assertEquals("Orphan site", conflict.existing());

        Decisions take = new Decisions(null, null, new Decisions.Conflicts(null, Map.of("FEATURE", "TAKE"), null, null, null));
        commit(file, preview(file, take), take);
        assertEquals(data.site1(), jdbc.queryForObject("SELECT site FROM feature WHERE id = ?", UUID.class, data.feature1()));
    }

    // Safety -----------------------------------------------------------------------------------

    @Test
    void aChangeAfterThePreviewStopsTheCommit() throws Exception {
        byte[] file = exportAll();
        jdbc.update("UPDATE site SET site_label = 'Hedeby' WHERE id = ?", data.site1());
        PlanView plan = preview(file, null);

        jdbc.update("UPDATE site SET site_label = 'Haddeby' WHERE id = ?", data.site1());
        ImportException e = assertThrows(ImportException.class, () -> commit(file, plan, null));
        assertEquals("PLAN_CHANGED", e.reason());
        assertEquals("Haddeby", ((PlanView) e.plan()).conflicts().get(0).existing());
    }

    @Test
    void aFailureLeavesTheDatabaseAsItWas() throws Exception {
        byte[] file = exportAll();
        clearDatabase();
        // Valid JSON, but too long for the column: fails when the links are written, after all records.
        ObjectNode json = (ObjectNode) json(file);
        ((ArrayNode) json.get("researchProjects").get(0).get("sites").get(0).get("activityNumbers")).add("x".repeat(300));
        byte[] broken = mapper.writeValueAsBytes(json);

        PlanView plan = preview(broken, null);
        assertThrows(Exception.class, () -> commit(broken, plan, null));
        assertEquals(0, count("research_project"));
        assertEquals(0, count("site"));
        assertEquals(0, count("tax_code"));
    }

    @Test
    void conflictDecisionsTheMostSpecificWins() {
        Decisions d = new Decisions(null, null, new Decisions.Conflicts("TAKE", Map.of("SITE", "KEEP"),
                Map.of("SITE:remarks", "TAKE"), Map.of("SITE:a", "KEEP"), Map.of("SITE:a:label", "TAKE")));
        assertTrue(d.take("SITE:a", EntityType.SITE, "label"));      // byField
        assertFalse(d.take("SITE:a", EntityType.SITE, "remarks"));   // byRecord beats byTypeField
        assertTrue(d.take("SITE:b", EntityType.SITE, "remarks"));    // byTypeField
        assertFalse(d.take("SITE:b", EntityType.SITE, "siteNumber")); // byType
        assertTrue(d.take("FEATURE:c", EntityType.FEATURE, "label")); // default
        assertFalse(Decisions.none().take("SITE:a", EntityType.SITE, "label"));
    }

    // Helpers ----------------------------------------------------------------------------------

    private byte[] exportAll() {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        tx.executeWithoutResult(status -> {
            try {
                exportService.writeExport(out, ExportFilter.of(null, null, null, null));
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });
        return out.toByteArray();
    }

    private PlanView preview(byte[] file, Decisions decisions) throws Exception {
        return importService.preview(new ByteArrayInputStream(file), decisions);
    }

    private ImportService.CommitResult commit(byte[] file, PlanView plan, Decisions decisions) throws Exception {
        Decisions d = decisions == null ? Decisions.none() : decisions;
        return importService.commit(new ByteArrayInputStream(file), new Decisions(plan.planFingerprint(), d.matches(), d.conflicts()));
    }

    private JsonNode json(byte[] file) throws Exception {
        return mapper.readTree(file);
    }

    private JsonNode withoutExportTime(byte[] file) throws Exception {
        ObjectNode json = (ObjectNode) json(file);
        json.remove("exportedAt");
        return json;
    }

    /** The export as another install would have it: same content, every record with another id. */
    private byte[] otherInstall(byte[] file, Consumer<JsonNode> edit) throws Exception {
        JsonNode json = json(file);
        reassignIds(json, new HashMap<>());
        edit.accept(json);
        return mapper.writeValueAsBytes(json);
    }

    private static void reassignIds(JsonNode node, Map<String, String> ids) {
        if (node.isObject()) {
            ObjectNode object = (ObjectNode) node;
            Iterator<Map.Entry<String, JsonNode>> fields = object.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> field = fields.next();
                if ((field.getKey().equals("id") || field.getKey().equals("absoluteDatingIds")) && isUuid(field.getValue())) {
                    field.setValue(new TextNode(ids.computeIfAbsent(field.getValue().textValue(), k -> UUID.randomUUID().toString())));
                } else {
                    reassignIds(field.getValue(), ids);
                }
            }
        } else if (node.isArray()) {
            ArrayNode array = (ArrayNode) node;
            for (int i = 0; i < array.size(); i++) {
                if (isUuid(array.get(i))) {
                    array.set(i, new TextNode(ids.computeIfAbsent(array.get(i).textValue(), k -> UUID.randomUUID().toString())));
                } else {
                    reassignIds(array.get(i), ids);
                }
            }
        }
    }

    private static boolean isUuid(JsonNode node) {
        if (!node.isTextual()) return false;
        try {
            UUID.fromString(node.textValue());
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    private static JsonNode firstSample(JsonNode json) {
        return json.get("researchProjects").get(0).get("sites").get(0).get("features").get(0).get("samples").get(0);
    }

    private Map<String, Integer> counts() {
        Map<String, Integer> counts = new TreeMap<>();
        for (String table : DATA_TABLES) counts.put(table, count(table));
        return counts;
    }

    private String siteLabel(UUID id) {
        return jdbc.queryForObject("SELECT site_label FROM site WHERE id = ?", String.class, id);
    }

    private void clearVocabulary(String siteTypeUri) {
        jdbc.update("DELETE FROM site_type_relation WHERE site_type_id = ?", siteTypeUri);
        jdbc.update("DELETE FROM site_type WHERE id = ?", siteTypeUri);
    }

    private static PlanView.TypeSummary summary(PlanView plan, EntityType type) {
        return plan.summary().stream().filter(s -> s.type() == type).findFirst().orElseThrow();
    }

    private static <T> T single(List<T> list) {
        assertEquals(1, list.size(), list.toString());
        return list.get(0);
    }
}
