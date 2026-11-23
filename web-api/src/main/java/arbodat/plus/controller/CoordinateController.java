package arbodat.plus.controller;

import arbodat.plus.dto_migration.BulkCoordinateItem;
import arbodat.plus.dto_migration.BulkItemStatus;
import arbodat.plus.model.Coordinate;
import arbodat.plus.repository.CoordinateRepository;
import arbodat.plus.service.CoordinateMigrationService;
import jakarta.persistence.EntityNotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/coordinates")
public class CoordinateController {

    private static final Logger log = LoggerFactory.getLogger(CoordinateController.class);

    @Autowired
    CoordinateRepository coordinateRepository;

    @Autowired
    CoordinateMigrationService coordinateMigrationService;

    @GetMapping
    public List<Coordinate> getAllCoordinates() {
        return coordinateRepository.findAll();
    }

    @PostMapping("/{type}/{id}")
    public String create(@RequestBody  Coordinate coordinate,
                         @PathVariable String type,
                         @PathVariable UUID id) {

        BulkCoordinateItem item = new BulkCoordinateItem();
        item.setType(type);
        item.setId(id);
        item.setCoordinate(coordinate);

        BulkItemStatus status = coordinateMigrationService.createAll(List.of(item)).get(0);
        if ("error".equals(status.getStatus())) {
            throw new EntityNotFoundException(status.getMessage());
        }
        return "coordinate is created";
    }

    /**
     * Creates the coordinates of many sites and samples (coordinates accordion of the migration).
     * Every item gets its own status ("created" or "error"), so one bad row doesn't stop the others.
     */
    @PostMapping("/bulk")
    public List<BulkItemStatus> createAll(@RequestBody List<BulkCoordinateItem> items) {
        try {
            return coordinateMigrationService.createAll(items);
        } catch (DataAccessException e) {
            // The transaction is rolled back -> none of the items is created
            log.error("Bulk creation of coordinates failed", e);
            String message = e.getMostSpecificCause().getMessage();
            return items.stream()
                    .map(item -> BulkItemStatus.error(item.getClientId(), message))
                    .toList();
        }
    }
}
