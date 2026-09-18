package arbodat.plus.controller;

import arbodat.plus.model.*;
import arbodat.plus.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/results")
public class ResultController {

    @Autowired
    ResultRepository resultRepository;

    @Autowired
    SampleRepository sampleRepository;

    @Autowired
    SiteRepository siteRepository;

    @Autowired
    TaxonomyRepository taxonomyRepository;

    @Autowired
    StateOfPreservationRepository stateOfPreservationRepository;

    @Autowired
    RestTypeRepository restTypeRepository;

    @Autowired
    ClassificationConferRepository classificationConferRepository;

    @Autowired
    TaxCodeRepository taxCodeRepository;

    @GetMapping public Page<Result> getResults(Pageable pageable) { return resultRepository.findAll(pageable); }

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

    @PostMapping("/createViaMigration/{taxonomyLabel}")
    public String createResultViaMigration(@RequestBody  Result result,
                                           @PathVariable String taxonomyLabel) {

        // Handle taxCode
        TaxCode taxCode = taxCodeRepository.findById(result.getTaxCode().getId())
                .orElseGet(() -> taxCodeRepository.save(result.getTaxCode()));

        // Handle cf (save if not already in database)
        ClassificationConfer cf = result.getClassificationConfer();
//        if (classificationConferRepository.findById(cf.getId()).isEmpty()) {
//            cf = classificationConferRepository.save(cf);
//        }

        // Handle restType (save if not already in database)
        RestType restType = result.getRestType();
        if (restTypeRepository.findById(restType.getId()).isEmpty()) {
            restType = restTypeRepository.save(restType);
        }

        // Handle stateOfPreservation (save if not already in database)
        StateOfPreservation stateOfPreservation = result.getStateOfPreservation();
        if (stateOfPreservationRepository.findById(stateOfPreservation.getId()).isEmpty()) {
            stateOfPreservation = stateOfPreservationRepository.save(stateOfPreservation);
        }

        // fraction
        String orgOrMin  = result.getOrgOrMin();
        Double sieveSize = result.getSieveSize();

        // Check if taxCode+fraction already exists
        Optional<Result> existingResult = resultRepository.findAlreadyExisting(
                result.getSample(),
                taxCode,
                orgOrMin,
                sieveSize,
                cf,
                restType,
                stateOfPreservation);

        if (existingResult.isEmpty()) {
            // Set Taxonomy in site ---------------------------------------------------------------
            // Get taxonomy
            Taxonomy taxonomy = taxonomyRepository.findByLabel(taxonomyLabel)
                    .orElseThrow(() -> new IllegalArgumentException("invalid taxonomy label: " + taxonomyLabel));
            // Get site
            UUID sampleId = result.getSample().getId();
            Sample sample = sampleRepository.findById(sampleId)
                    .orElseThrow(() -> new IllegalArgumentException("invalid sample id: " + sampleId));
            UUID siteId = sample.getFeature().getSite().getId();
            Site site = siteRepository.findById(siteId)
                    .orElseThrow(() -> new IllegalArgumentException("invalid site id: " + siteId));

            site.setTaxonomy(taxonomy);
            siteRepository.save(site);
            // ------------------------------------------------------------------------------------

            Result savedResult = resultRepository.save(result);
            // Return Id
            return savedResult.getId().toString();
        } else {
            return "result already exists";
        }
    }
}
