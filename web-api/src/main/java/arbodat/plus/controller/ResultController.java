package arbodat.plus.controller;

import arbodat.plus.dto_migration.BulkItemStatus;
import arbodat.plus.dto_migration.BulkResultItem;
import arbodat.plus.model.*;
import arbodat.plus.repository.*;
import arbodat.plus.service.ResultMigrationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
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

        // Check if such a result with these values already exists
        Optional<Result> existingResult = resultRepository.findAlreadyExisting(
                transferredResult.getSample(),
                taxCode,
                transferredResult.getOrgOrMin(),
                transferredResult.getSieveSize(),
                classificationConfer,
                restType,
                stateOfPreservation);

        if (existingResult.isEmpty()) {
            resultRepository.save(transferredResult);
            return "result is created";
        } else {
            return "result already exists";
        }
    }

    @PutMapping("/{resultId}")
    public String update(@RequestBody Result transferredResult,
                         @PathVariable UUID resultId) {

        // Get result
        Result result = resultRepository.findById(resultId)
                .orElseThrow(() -> new IllegalArgumentException("invalid result id: " + resultId));

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

        // Check if such a result with these values already exists
        Optional<Result> existingResult = resultRepository.findAlreadyExisting(
                result.getSample(),
                result.getTaxCode(),
                result.getOrgOrMin(),
                result.getSieveSize(),
                result.getClassificationConfer(),
                result.getRestType(),
                result.getStateOfPreservation()
        );

        if (existingResult.isEmpty() ||
                existingResult.map(Result::getId).orElse(null).equals(resultId)) {
            resultRepository.save(result);
            return "result is updated";
        } else {
            return "result already exists";
        }
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
