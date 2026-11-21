package arbodat.plus.exchange;

import arbodat.plus.Fixtures;
import arbodat.plus.PostgresTest;
import arbodat.plus.repository.*;
import arbodat.plus.service.ExportFilter;
import arbodat.plus.service.ExportService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.ByteArrayOutputStream;
import java.util.*;

import static arbodat.plus.CanonicalJson.canonical;
import static org.junit.jupiter.api.Assertions.*;

class ExportGoldenTest extends PostgresTest {

    @Autowired ExportService exportService;
    @Autowired TransactionTemplate tx;
    @PersistenceContext EntityManager em;
    @Autowired ResearchProjectRepository researchProjectRepository;
    @Autowired SiteRepository siteRepository;
    @Autowired FeatureRepository featureRepository;
    @Autowired SampleRepository sampleRepository;
    @Autowired AbsoluteDatingRepository absoluteDatingRepository;
    @Autowired ResultRepository resultRepository;

    private final ObjectMapper mapper = new ObjectMapper();
    private Fixtures.Full data;

    @BeforeEach
    void setUp() {
        clearDatabase();
        data = tx.execute(status -> Fixtures.full(em));
    }

    @Test
    void writesTheSameResearchProjectsAsTheExportBeforeTheRefactoring() throws Exception {
        LegacyExportService legacy = new LegacyExportService(researchProjectRepository, siteRepository,
                featureRepository, sampleRepository, absoluteDatingRepository, resultRepository);

        for (ExportFilter filter : List.of(
                ExportFilter.of(null, null, null, null),
                ExportFilter.of(List.of(data.rpA()), null, null, null),
                ExportFilter.of(null, List.of(data.site1()), null, null),
                ExportFilter.of(null, null, List.of(data.feature1()), null),
                ExportFilter.of(null, null, null, List.of(data.sample1())))) {
            JsonNode before = export(out -> legacy.writeExport(out, filter));
            JsonNode after = export(out -> exportService.writeExport(out, filter)).get("researchProjects");
            assertFalse(before.isEmpty(), "filter " + filter.level());
            assertEquals(canonical(before), canonical(after), "filter " + filter.level());
        }
    }

    @Test
    void exportOfEverythingIsACompleteCopy() throws Exception {
        JsonNode export = export(out -> exportService.writeExport(out, ExportFilter.of(null, null, null, null)));

        assertEquals(ExchangeSchema.FORMAT_VERSION, export.get("formatVersion").intValue());
        assertTrue(export.get("appVersion").isTextual());
        assertTrue(export.get("exportedAt").isTextual());
        assertEquals("NONE", export.get("scope").get("level").textValue());

        // The site under both research projects appears under each of them.
        for (JsonNode rp : export.get("researchProjects")) {
            assertTrue(ids(rp.get("sites")).contains(data.site1().toString()), rp.get("projectName").textValue());
        }

        // The site without a research project, with its subtree.
        JsonNode unassigned = export.get("unassignedSites");
        assertEquals(List.of(data.orphanSite().toString()), ids(unassigned));
        assertEquals("Orphan sample", unassigned.get(0).get("features").get(0).get("samples").get(0).get("label").textValue());

        // Shared records nothing references; referenced ones are not repeated here.
        assertEquals(List.of(data.unreferencedUser().toString()), ids(export.get("users")));
        assertEquals(List.of("Unused Institute"), labels(export.get("institutions"), "label"));
        assertEquals(List.of("Unused book"), labels(export.get("literature"), "title"));
        assertEquals(List.of(), labels(export.get("authors"), "lastName")); // the unused book's author is written with it
        assertEquals(List.of("Unused Lab"), labels(export.get("laboratories"), "label"));
    }

    @Test
    void filteredExportPutsASelectedSiteWithoutResearchProjectUnderUnassignedSites() throws Exception {
        JsonNode export = export(out -> exportService.writeExport(out, ExportFilter.of(null, List.of(data.orphanSite()), null, null)));

        assertEquals(0, export.get("researchProjects").size());
        assertEquals(List.of(data.orphanSite().toString()), ids(export.get("unassignedSites")));
        assertEquals(List.of(data.orphanSite().toString()), labels(export.get("scope").get("ids"), null));
        assertEquals(0, export.get("users").size());
        assertEquals(0, export.get("laboratories").size());
    }

    interface Export {
        void writeTo(ByteArrayOutputStream out) throws Exception;
    }

    private JsonNode export(Export export) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        tx.execute(status -> {
            try {
                export.writeTo(out);
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
            return null;
        });
        return mapper.readTree(out.toByteArray());
    }

    private static List<String> ids(JsonNode array) {
        return labels(array, "id");
    }

    private static List<String> labels(JsonNode array, String field) {
        List<String> values = new ArrayList<>();
        for (JsonNode node : array) values.add(field == null ? node.textValue() : node.get(field).textValue());
        return values;
    }
}
