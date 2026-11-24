package arbodat.plus.service;

import arbodat.plus.Fixtures;
import arbodat.plus.PostgresTest;
import arbodat.plus.dto_migration.BulkCoordinateItem;
import arbodat.plus.dto_migration.BulkItemStatus;
import arbodat.plus.model.Coordinate;
import arbodat.plus.model.CoordinateSystem;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/** Coordinates of the migration in bulk: one status per row, coordinate systems are only referenced. */
class CoordinateMigrationServiceTest extends PostgresTest {

    private static final String WGS84 = "http://uri.gbv.de/terminology/arbodat_coordinate_reference_system/4326"; // in the fixtures: "WGS 84", EPSG 4326

    @Autowired CoordinateMigrationService service;
    @Autowired TransactionTemplate tx;
    @PersistenceContext EntityManager em;

    private Fixtures.Full data;

    @BeforeEach
    void setUp() {
        clearDatabase();
        data = tx.execute(status -> Fixtures.full(em));
    }

    @Test
    void eachRowGetsItsStatusAndTheCoordinateSystemStaysAsItIs() {
        List<BulkItemStatus> statuses = service.createAll(List.of(
                // the frontend sends the label of its dropdown ("name - EPSG"), which must not replace the stored one
                item("1", "site", data.site1(), 10.5, 53.5, system(WGS84, "WGS 84 - 4326", null)),
                item("2", "sample", data.sample1(), 10.6, 53.6, system(WGS84, null, null)),
                item("3", "site", UUID.randomUUID(), 1.0, 2.0, system(WGS84, null, null)),
                item("4", "sample", data.sample1(), 1.0, null, system(WGS84, null, null)),
                item("5", "site", data.site1(), 1.0, 2.0, null),
                item("6", "feature", data.feature1(), 1.0, 2.0, system(WGS84, null, null))
        ));

        assertEquals(List.of("created", "created", "error", "error", "error", "error"),
                statuses.stream().map(BulkItemStatus::getStatus).toList());
        assertEquals("invalid site id", statuses.get(2).getMessage());
        assertEquals("no latitude", statuses.get(3).getMessage());
        assertEquals("no coordinate system", statuses.get(4).getMessage());
        assertTrue(statuses.get(5).getMessage().startsWith("invalid type"), statuses.get(5).getMessage());

        assertEquals(10.5, coordinateValue("site", data.site1(), "longitude"));
        assertEquals(53.6, coordinateValue("sample", data.sample1(), "latitude"));
        assertEquals(statuses.get(0).getId(), jdbc.queryForObject("SELECT coordinate FROM site WHERE id = ?", UUID.class, data.site1()));

        assertEquals("WGS 84", jdbc.queryForObject("SELECT label FROM coordinate_system WHERE id = ?", String.class, WGS84));
        assertEquals("4326", jdbc.queryForObject("SELECT epsg FROM coordinate_system WHERE id = ?", String.class, WGS84));
        // the coordinates of the fixtures were replaced (orphanRemoval), only the two new ones are left
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM coordinate", Integer.class));
    }

    @Test
    void aCoordinateSystemWhichIsNotStoredYetIsCreatedOnce() {
        String utm = "http://uri.gbv.de/terminology/arbodat_coordinate_reference_system/25832";
        List<BulkItemStatus> statuses = service.createAll(List.of(
                item("1", "site", data.site1(), 500000.0, 6000000.0, system(utm, "ETRS89 / UTM zone 32N", "25832")),
                item("2", "sample", data.sample1(), 500001.0, 6000001.0, system(utm, "ETRS89 / UTM zone 32N", "25832"))
        ));

        assertEquals(List.of("created", "created"), statuses.stream().map(BulkItemStatus::getStatus).toList());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM coordinate_system WHERE id = ?", Integer.class, utm));
        assertEquals("25832", jdbc.queryForObject("SELECT epsg FROM coordinate_system WHERE id = ?", String.class, utm));
    }

    @Test
    void aCoordinateSystemOutsideItsVocabularyFailsOnlyItsRow() {
        List<BulkItemStatus> statuses = service.createAll(List.of(
                item("1", "site", data.site1(), 10.5, 53.5, system("https://example.org/crs/1", "foreign", "1")),
                item("2", "sample", data.sample1(), 10.6, 53.6, system(WGS84, null, null))
        ));

        assertEquals(List.of("error", "created"), statuses.stream().map(BulkItemStatus::getStatus).toList());
        assertTrue(statuses.get(0).getMessage().contains("not a term"), statuses.get(0).getMessage());
    }

    // Helpers ---------------------------------------------------------------------------------------

    private BulkCoordinateItem item(String clientId, String type, UUID id, Double lon, Double lat, CoordinateSystem system) {
        Coordinate coordinate = new Coordinate();
        coordinate.setLongitude(lon);
        coordinate.setLatitude(lat);
        coordinate.setAltitude(12.0);
        coordinate.setRemarksCoordinate("from the migration");
        coordinate.setCoordinateSystem(system);

        BulkCoordinateItem item = new BulkCoordinateItem();
        item.setClientId(clientId);
        item.setType(type);
        item.setId(id);
        item.setCoordinate(coordinate);
        return item;
    }

    private CoordinateSystem system(String id, String label, String epsg) {
        CoordinateSystem system = new CoordinateSystem();
        system.setId(id);
        system.setLabel(label);
        system.setEpsg(epsg);
        return system;
    }

    private Double coordinateValue(String table, UUID id, String column) {
        return jdbc.queryForObject("SELECT c." + column + " FROM " + table + " t JOIN coordinate c ON c.id = t.coordinate WHERE t.id = ?",
                Double.class, id);
    }
}
