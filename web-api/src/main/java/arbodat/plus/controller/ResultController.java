package arbodat.plus.controller;

import arbodat.plus.dto_migration.BulkItemStatus;
import arbodat.plus.dto_migration.BulkResultItem;
import arbodat.plus.model.*;
import arbodat.plus.repository.*;
import arbodat.plus.service.ResultKey;
import arbodat.plus.service.ResultMigrationService;
import arbodat.plus.service.ResultRules;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/results")
public class ResultController {

    private static final Logger log = LoggerFactory.getLogger(ResultController.class);

    @Autowired
    ResultMigrationService resultMigrationService;

    @Autowired
    ResultRepository resultRepository;

    @Autowired
    StateOfPreservationRepository stateOfPreservationRepository;

    @Autowired
    RestTypeRepository restTypeRepository;

    @Autowired
    ClassificationConferRepository classificationConferRepository;

    @Autowired
    TaxCodeRepository taxCodeRepository;

    @GetMapping
    public Page<Result> getResults(@RequestParam(required = false) UUID sampleId, Pageable pageable) {
        if (sampleId != null) {
            return resultRepository.findBySampleId(sampleId, pageable);
        }
        return resultRepository.findAll(pageable);
    }

    @PostMapping
    public String create(@RequestBody Result transferredResult) {

        // Quantity and entry date (before anything is saved)
        ResultRules.check(transferredResult);

        // Check if such a result already exists in the sample (before anything is saved)
        if (ResultKey.of(transferredResult).isTaken(resultRepository, null)) {
            return "result already exists";
        }

        // Handle taxCode
        TaxCode taxCode = taxCodeRepository.findById(transferredResult.getTaxCode().getId())
                .orElseGet(() -> taxCodeRepository.save(transferredResult.getTaxCode()));
        transferredResult.setTaxCode(taxCode);

        // Handle classificationConfer
        ClassificationConfer classificationConfer = classificationConferRepository.findById(transferredResult.getClassificationConfer().getId())
                .orElseGet(() -> classificationConferRepository.save(transferredResult.getClassificationConfer()));
        transferredResult.setClassificationConfer(classificationConfer);


        // Handle stateOfPreservation
        StateOfPreservation stateOfPreservation = stateOfPreservationRepository.findById(transferredResult.getStateOfPreservation().getId())
                .orElseGet(() -> stateOfPreservationRepository.save(transferredResult.getStateOfPreservation()));
        transferredResult.setStateOfPreservation(stateOfPreservation);


        // Handle restType
        RestType restType = restTypeRepository.findById(transferredResult.getRestType().getId())
                .orElseGet(() -> restTypeRepository.save(transferredResult.getRestType()));
        transferredResult.setRestType(restType);

        resultRepository.save(transferredResult);
        return "result is created";
    }

    @PutMapping("/{resultId}")
    public String update(@RequestBody Result transferredResult,
                         @PathVariable UUID resultId) {

        // Get result
        Result result = resultRepository.findById(resultId)
                .orElseThrow(() -> new IllegalArgumentException("invalid result id: " + resultId));

        // Quantity and entry date of the new values
        ResultRules.check(transferredResult);

        // Check if another result of the sample has the new values (before the result is changed:
        // the query would flush the change). Values which aren't transferred stay as they are.
        ResultKey key = new ResultKey(
                transferredResult.getSample() != null ? transferredResult.getSample().getId() : null,
                idOrCurrent(transferredResult.getTaxCode(), result.getTaxCode()),
                transferredResult.getOrgOrMin(),
                transferredResult.getSieveSize(),
                transferredResult.getFractionAnalyzed(),
                idOrCurrent(transferredResult.getClassificationConfer(), result.getClassificationConfer()),
                idOrCurrent(transferredResult.getRestType(), result.getRestType()),
                idOrCurrent(transferredResult.getStateOfPreservation(), result.getStateOfPreservation()));
        if (key.isTaken(resultRepository, resultId)) {
            return "result already exists";
        }

        // Update attributes
        result.setEntryDate(transferredResult.getEntryDate());
        // Fraction analyzed ----------------------------------------------
        result.setFractionAnalyzed(transferredResult.getFractionAnalyzed());
        result.setOrgOrMin(transferredResult.getOrgOrMin());
        result.setSieveSize(transferredResult.getSieveSize());
        result.setMultiplier(transferredResult.getMultiplier());
        // ----------------------------------------------------------------
        result.setRestCount(transferredResult.getRestCount());
        result.setRestFragment(transferredResult.getRestFragment());
        result.setRestWeight(transferredResult.getRestWeight());
        result.setEstimation(transferredResult.getEstimation());
        result.setRemarksTaxonomy(transferredResult.getRemarksTaxonomy());
        // References -----------------------------------------------------
        result.setSample(transferredResult.getSample());
        result.setAbsoluteDatingList(transferredResult.getAbsoluteDatingList());
        // ----------------------------------------------------------------

        // Handle taxCode
        if (transferredResult.getTaxCode() != null && transferredResult.getTaxCode().getId() != null) {
            TaxCode taxCode = taxCodeRepository.findById(transferredResult.getTaxCode().getId())
                    .orElseGet(() -> taxCodeRepository.save(transferredResult.getTaxCode()));

            result.setTaxCode(taxCode);
        }
        // Handle classificationConfer
        if (transferredResult.getClassificationConfer() != null && transferredResult.getClassificationConfer().getId() != null) {
            ClassificationConfer classificationConfer = classificationConferRepository.findById(transferredResult.getClassificationConfer().getId())
                    .orElseGet(() -> classificationConferRepository.save(transferredResult.getClassificationConfer()));

            result.setClassificationConfer(classificationConfer);
        }
        // Handle restType
        if (transferredResult.getRestType() != null && transferredResult.getRestType().getId() != null) {
            RestType restType = restTypeRepository.findById(transferredResult.getRestType().getId())
                    .orElseGet(() -> restTypeRepository.save(transferredResult.getRestType()));

            result.setRestType(restType);
        }
        // Handle stateOfPreservation
        if (transferredResult.getStateOfPreservation() != null && transferredResult.getStateOfPreservation().getId() != null) {
        StateOfPreservation stateOfPreservation = stateOfPreservationRepository.findById(transferredResult.getStateOfPreservation().getId())
                .orElseGet(() -> stateOfPreservationRepository.save(transferredResult.getStateOfPreservation()));
            result.setStateOfPreservation(stateOfPreservation);
        }

        resultRepository.save(result);
        return "result is updated";
    }

    @ExceptionHandler(ResultRules.ResultRuleException.class)
    public ResponseEntity<String> handleResultRule(ResultRules.ResultRuleException e) {
        return ResponseEntity.badRequest().body(e.getMessage());
    }

    // Another request saved the same result between the check and the save
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<String> handleDataIntegrityViolation(DataIntegrityViolationException e) {
        String cause = String.valueOf(e.getMostSpecificCause().getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(cause.contains(Result.UNIQUE_KEY)
                        ? "The result could not be saved: the sample already has such a result."
                        : "The result could not be saved: " + cause);
    }

    // Id of the transferred value, or of the current one if none is transferred
    private static String idOrCurrent(Object transferred, Object current) {
        String id = vocabularyId(transferred);
        return id != null ? id : vocabularyId(current);
    }

    private static String vocabularyId(Object value) {
        if (value instanceof TaxCode v) return v.getId();
        if (value instanceof ClassificationConfer v) return v.getId();
        if (value instanceof RestType v) return v.getId();
        if (value instanceof StateOfPreservation v) return v.getId();
        return null;
    }

    @DeleteMapping("/{resultId}")
    public String delete(@PathVariable UUID resultId) {

        // Get result
        Result result = resultRepository.findById(resultId)
                .orElseThrow(() -> new IllegalArgumentException("invalid result id: " + resultId));

        resultRepository.delete(result);
        return "result is deleted";
    }

    /**
     * Creates the results of the migration (result accordion). Every item gets its own status
     * ("created", "exists" or "error"), so one bad row doesn't stop the others.
     */
    @PostMapping("/createViaMigration/bulk/{taxonomyLabel}")
    public List<BulkItemStatus> createResultsViaMigration(@RequestBody List<BulkResultItem> items,
                                                          @PathVariable String taxonomyLabel) {
        try {
            return resultMigrationService.createAll(taxonomyLabel, items);
        } catch (DataAccessException e) {
            // The transaction is rolled back -> none of the items is created
            log.error("Bulk create of results failed", e);
            String message = e.getMostSpecificCause().getMessage();
            return items.stream()
                    .map(item -> BulkItemStatus.error(item.getClientId(), message))
                    .toList();
        }
    }
}
