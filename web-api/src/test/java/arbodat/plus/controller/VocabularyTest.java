package arbodat.plus.controller;

import arbodat.plus.Fixtures;
import arbodat.plus.PostgresTest;
import arbodat.plus.model.*;
import arbodat.plus.repository.CoordinateRepository;
import arbodat.plus.service.Vocabularies;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A vocabulary term is created on its first use, but only as a term of the DANTE vocabulary of its table or as a
 * local ArboDat+ term of it - on every way (controllers, cascades, import).
 */
@AutoConfigureMockMvc
class VocabularyTest extends PostgresTest {

    private static final String FEATURE_TYPES = "http://uri.gbv.de/terminology/arbodat_feature_type/";

    @Autowired FeatureController featureController;
    @Autowired CoordinateRepository coordinateRepository;
    @Autowired MockMvc mvc;
    @Autowired TransactionTemplate tx;
    @PersistenceContext EntityManager em;

    private Fixtures.Full data;

    @BeforeEach
    void setUp() {
        clearDatabase();
        data = tx.execute(status -> Fixtures.full(em));
    }

    @Test
    void aNewTermOfTheRightVocabularyIsCreatedOnItsFirstUse() {
        tx.executeWithoutResult(status -> featureController.create(feature("Pit 8", FEATURE_TYPES + "new")));
        tx.executeWithoutResult(status -> featureController.create(feature("Pit 9", "ArboDat+_featureType_notChosen")));
        assertEquals(1, count("feature_type WHERE id = '" + FEATURE_TYPES + "new'"));
        assertEquals(1, count("feature_type WHERE id = 'ArboDat+_featureType_notChosen'"));
    }

    @Test
    void aTermOfAnotherVocabularyOrAnInventedUriIsRefusedWith400() throws Exception {
        for (String uri : new String[]{"http://uri.gbv.de/terminology/arbodat_site_type/x", "http://example.org/x",
                                       "ArboDat+_siteType_notChosen"}) {
            mvc.perform(post("/features").contentType(MediaType.APPLICATION_JSON)
                            .content("{\"site\":{\"id\":\"" + data.site1() + "\"},\"label\":\"Pit 8\","
                                     + "\"featureType\":{\"id\":\"" + uri + "\",\"label\":\"x\"}}"))
                    .andExpect(status().isBadRequest())
                    .andExpect(content().string("'" + uri + "' is not a term of the DANTE vocabulary arbodat_feature_type."));
        }
        assertEquals(0, count("feature WHERE feature_label = 'Pit 8'"));
        assertEquals(0, count("feature_type WHERE id NOT LIKE '" + FEATURE_TYPES + "%'"));
    }

    @Test
    void aTermCreatedByCascadeIsCheckedToo() {
        // An existing coordinate gets a new coordinate system (cascade merge, e.g. when a site is changed)
        Coordinate coordinate = coordinateRepository.save(new Coordinate());
        CoordinateSystem system = new CoordinateSystem();
        system.setId("http://example.org/crs/x");
        coordinate.setCoordinateSystem(system);

        RuntimeException e = assertThrows(RuntimeException.class, () -> coordinateRepository.save(coordinate));
        assertInstanceOf(Vocabularies.UnknownVocabularyTermException.class, e, e.toString());
        assertEquals(0, count("coordinate_system WHERE id = 'http://example.org/crs/x'"));
    }

    @Test
    void licensesAreNotChecked() {
        assertTrue(Vocabularies.isAllowed(License.class, "http://creativecommons.org/licenses/by/4.0/"));
    }

    private Feature feature(String label, String featureTypeUri) {
        Feature feature = new Feature();
        Site site = new Site();
        site.setId(data.site1());
        feature.setSite(site);
        feature.setLabel(label);
        FeatureType featureType = new FeatureType();
        featureType.setId(featureTypeUri);
        featureType.setLabel("x");
        feature.setFeatureType(featureType);
        return feature;
    }
}
