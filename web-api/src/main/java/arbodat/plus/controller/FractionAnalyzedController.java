package arbodat.plus.controller;

import arbodat.plus.dto_migration.BulkFractionAnalyzedItem;
import arbodat.plus.dto_migration.BulkItemStatus;
import arbodat.plus.model.FractionAnalyzed;
import arbodat.plus.repository.FractionAnalyzedRepository;

import arbodat.plus.service.FractionAnalyzedMigrationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/fractions_analyzed")
public class FractionAnalyzedController {

    private static final Logger log = LoggerFactory.getLogger(FractionAnalyzedController.class);

    @Autowired
    FractionAnalyzedRepository fractionAnalyzedRepository;

    @Autowired
    FractionAnalyzedMigrationService fractionAnalyzedMigrationService;

    @GetMapping
    public List<FractionAnalyzed> getAllFractionAnalyzed() {
        return fractionAnalyzedRepository.findAll();
    }

    @PostMapping
    public String create(@RequestBody FractionAnalyzed fractionAnalyzed) {

        // Check whether fraction already exists
        Optional<FractionAnalyzed> existingFractionAnalyzed = fractionAnalyzedRepository.
                findAlreadyExisting(fractionAnalyzed.getSample(),
                                    fractionAnalyzed.getFractionAnalyzed(),
                                    fractionAnalyzed.getOrgOrMin(),
                                    fractionAnalyzed.getSieveSize());
        if (existingFractionAnalyzed.isPresent()) {
            return "fraction analyzed already exists";
        } else {
            fractionAnalyzedRepository.save(fractionAnalyzed);
            return "fraction analyzed is created";
        }
    }

    /**
     * Creates the fractions analyzed of the migration (fractions analyzed accordion). Every item gets its own
     * status ("created", "exists" or "error"), so one bad row doesn't stop the others.
     */
    @PostMapping("/bulk")
    public List<BulkItemStatus> createAll(@RequestBody List<BulkFractionAnalyzedItem> items) {
        try {
            return fractionAnalyzedMigrationService.createAll(items);
        } catch (DataAccessException e) {
            // The transaction is rolled back -> none of the items is created
            log.error("Bulk create of fractions analyzed failed", e);
            String message = e.getMostSpecificCause().getMessage();
            return items.stream()
                    .map(item -> BulkItemStatus.error(item.getClientId(), message))
                    .toList();
        }
    }
}
