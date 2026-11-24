package arbodat.plus.service;

import arbodat.plus.dto_migration.BulkCoordinateItem;
import arbodat.plus.dto_migration.BulkItemStatus;
import arbodat.plus.model.Coordinate;
import arbodat.plus.model.CoordinateSystem;
import arbodat.plus.model.Sample;
import arbodat.plus.model.Site;
import arbodat.plus.repository.CoordinateRepository;
import arbodat.plus.repository.CoordinateSystemRepository;
import arbodat.plus.repository.SampleRepository;
import arbodat.plus.repository.SiteRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

// Creates the coordinates of sites and samples of the migration (coordinates accordion) in bulk:
// sites, samples and coordinate systems are loaded once per request instead of once per row.
@Service
public class CoordinateMigrationService {

    @Autowired
    SiteRepository siteRepository;

    @Autowired
    SampleRepository sampleRepository;

    @Autowired
    CoordinateRepository coordinateRepository;

    @Autowired
    CoordinateSystemRepository coordinateSystemRepository;

    /**
     * Sets the coordinates of the given sites / samples (they replace the coordinates set so far).
     * Each item gets its own status: "created" (with the id of the coordinate), or "error"
     * (unknown site / sample, invalid type, no longitude / latitude / coordinate system).
     * An existing coordinate system is only referenced (its label and EPSG code from DANTE stay as they are);
     * a coordinate system which is not stored yet is created once from the item.
     */
    @Transactional
    public List<BulkItemStatus> createAll(List<BulkCoordinateItem> items) {

        Map<UUID, Site> sites = byId(items, "site", siteRepository::findAllById, Site::getId);
        Map<UUID, Sample> samples = byId(items, "sample", sampleRepository::findAllById, Sample::getId);
        Set<String> systemIds = items.stream()
                .map(BulkCoordinateItem::getCoordinate)
                .filter(Objects::nonNull)
                .map(Coordinate::getCoordinateSystem)
                .filter(Objects::nonNull)
                .map(CoordinateSystem::getId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<String, CoordinateSystem> systems = coordinateSystemRepository.findAllById(systemIds).stream()
                .collect(Collectors.toMap(CoordinateSystem::getId, Function.identity()));

        List<BulkItemStatus> statuses = new ArrayList<>();
        for (BulkCoordinateItem item : items) {
            String clientId = item.getClientId();
            Coordinate given = item.getCoordinate();

            if (given == null || given.getLongitude() == null) {
                statuses.add(BulkItemStatus.error(clientId, "no longitude"));
                continue;
            }
            if (given.getLatitude() == null) {
                statuses.add(BulkItemStatus.error(clientId, "no latitude"));
                continue;
            }
            CoordinateSystem givenSystem = given.getCoordinateSystem();
            if (givenSystem == null || givenSystem.getId() == null || givenSystem.getId().isBlank()) {
                statuses.add(BulkItemStatus.error(clientId, "no coordinate system"));
                continue;
            }

            Site site = null;
            Sample sample = null;
            if ("site".equals(item.getType())) {
                site = item.getId() != null ? sites.get(item.getId()) : null;
                if (site == null) {
                    statuses.add(BulkItemStatus.error(clientId, "invalid site id"));
                    continue;
                }
            } else if ("sample".equals(item.getType())) {
                sample = item.getId() != null ? samples.get(item.getId()) : null;
                if (sample == null) {
                    statuses.add(BulkItemStatus.error(clientId, "invalid sample id"));
                    continue;
                }
            } else {
                statuses.add(BulkItemStatus.error(clientId, "invalid type: " + item.getType()));
                continue;
            }

            // A coordinate system which is not stored yet must be a term of its DANTE vocabulary (Vocabularies)
            if (!systems.containsKey(givenSystem.getId()) && !Vocabularies.isAllowed(CoordinateSystem.class, givenSystem.getId())) {
                statuses.add(BulkItemStatus.error(clientId, "'" + givenSystem.getId() + "' is not a term of the coordinate system vocabulary"));
                continue;
            }
            CoordinateSystem system = systems.computeIfAbsent(givenSystem.getId(), id -> {
                CoordinateSystem created = new CoordinateSystem();
                created.setId(id);
                created.setLabel(givenSystem.getLabel());
                created.setEpsg(givenSystem.getEpsg());
                return coordinateSystemRepository.save(created);
            });

            // A new coordinate with the given values (the id and the links come from here, not from the request)
            Coordinate coordinate = new Coordinate();
            coordinate.setLongitude(given.getLongitude());
            coordinate.setLatitude(given.getLatitude());
            coordinate.setAltitude(given.getAltitude());
            coordinate.setLongitudeWgs84(given.getLongitudeWgs84());
            coordinate.setLatitudeWgs84(given.getLatitudeWgs84());
            coordinate.setRemarksCoordinate(given.getRemarksCoordinate());
            coordinate.setCoordinateSystem(system);
            coordinate = coordinateRepository.save(coordinate);

            // The coordinate set so far is removed (orphanRemoval)
            if (site != null) site.setCoordinate(coordinate);
            else sample.setCoordinate(coordinate);

            statuses.add(BulkItemStatus.created(clientId, coordinate.getId()));
        }
        // The sites and samples are saved with the transaction (managed entities)
        return statuses;
    }

    private static <T> Map<UUID, T> byId(List<BulkCoordinateItem> items, String type,
                                         Function<Set<UUID>, List<T>> findAllById, Function<T, UUID> getId) {
        Set<UUID> ids = items.stream()
                .filter(item -> type.equals(item.getType()) && item.getId() != null)
                .map(BulkCoordinateItem::getId)
                .collect(Collectors.toSet());
        return findAllById.apply(ids).stream().collect(Collectors.toMap(getId, Function.identity()));
    }
}
