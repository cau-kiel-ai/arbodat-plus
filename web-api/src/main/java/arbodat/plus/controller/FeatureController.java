package arbodat.plus.controller;

import arbodat.plus.model.*;
import arbodat.plus.repository.*;
import arbodat.plus.service.ExcavationYears;
import arbodat.plus.service.LabelTakenException;
import arbodat.plus.service.LabelUniqueness;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/features")
public class FeatureController {

    @Autowired
    FeatureRepository featureRepository;

    @Autowired
    FeatureTypeRepository featureTypeRepository;

    @Autowired
    PreservationConditionRepository preservationConditionRepository;

    @Autowired
    SampleRepository sampleRepository;

    @Autowired
    LabelUniqueness labelUniqueness;

//    @Autowired
//    ArchaeologicalDatingRepository archaeologicalDatingRepository;
//
//    @Autowired
//    CulturalGroupRepository culturalGroupRepository;

    @GetMapping
    public List<Feature> getAllFeatures() {
        return featureRepository.findAll();
    }

    @PostMapping
    public String create(@RequestBody Feature transferredFeature) {

        // Label must be unique within the site, excavation years valid (before anything is saved)
        if (transferredFeature.getId() == null) {
            labelUniqueness.checkFeature(transferredFeature.getLabel(), idOf(transferredFeature.getSite()), null);
            transferredFeature.setExcavationYears(ExcavationYears.checked(transferredFeature.getExcavationYears()));
        }

        // Handle feature type
        if (transferredFeature.getFeatureType() != null) {
            FeatureType featureType = featureTypeRepository.findById(transferredFeature.getFeatureType().getId())
                    .orElseGet(() -> featureTypeRepository.save(transferredFeature.getFeatureType()));

            transferredFeature.setFeatureType(featureType);
        }

        // Handle preservation condition
        if (transferredFeature.getPreservationCondition() != null) {
            PreservationCondition preservationCondition = preservationConditionRepository.findById(transferredFeature.getPreservationCondition().getId())
                    .orElseGet(() -> preservationConditionRepository.save(transferredFeature.getPreservationCondition()));

            transferredFeature.setPreservationCondition(preservationCondition);
        }

//        // Handle archaeological dating -------------------------------
//        Set<ArchaeologicalDating> archaeologicalDatingList = transferredFeature.getArchaeologicalDatingList();
//
//        for (ArchaeologicalDating transferredArchaeologicalDating : archaeologicalDatingList) {
//            ArchaeologicalDating archaeologicalDating = archaeologicalDatingRepository.findById(transferredArchaeologicalDating.getId())
//                    .orElseGet(() -> archaeologicalDatingRepository.save(transferredArchaeologicalDating));
//
//            archaeologicalDatingList.add(archaeologicalDating);
//        }
//
//        transferredFeature.setArchaeologicalDatingList(archaeologicalDatingList);
//
//        // Handle cultural group --------------------------------------
//        Set<CulturalGroup> culturalGroupList = transferredFeature.getCulturalGroupList();
//
//        for (CulturalGroup transferredCulturalGroup : culturalGroupList) {
//            CulturalGroup culturalGroup = culturalGroupRepository.findById(transferredCulturalGroup.getId())
//                    .orElseGet(() -> culturalGroupRepository.save(transferredCulturalGroup));
//
//            culturalGroupList.add(culturalGroup);
//        }
//
//        transferredFeature.setCulturalGroupList(culturalGroupList);

        // Create new feature if it doesn't exist,
        if (transferredFeature.getId() == null) {
            featureRepository.save(transferredFeature);
            return "feature is created";

        // else update existing one
        } else {
            Feature feature = featureRepository.findById(transferredFeature.getId())
                    .orElseThrow(() -> new IllegalArgumentException("invalid feature id: " + transferredFeature.getId()));

            featureRepository.save(feature);

            return "feature is updated";
        }
    }

    @PutMapping("/{featureId}")
    public String update(@RequestBody Feature transferredFeature, @PathVariable UUID featureId) {

        Feature feature = featureRepository.findById(featureId)
                .orElseThrow(() -> new IllegalArgumentException("invalid feature id: " + featureId));

        // Label must be unique within the (new) site, excavation years valid
        labelUniqueness.checkFeature(transferredFeature.getLabel(), idOf(transferredFeature.getSite()), featureId);
        List<Integer> excavationYears = ExcavationYears.checked(transferredFeature.getExcavationYears());

        // update attributes
        feature.setLabel(transferredFeature.getLabel());
        feature.setExcavationYears(excavationYears);
        feature.setExcavationArea(transferredFeature.getExcavationArea());
        feature.setBuildingContext(transferredFeature.getBuildingContext());
        // description only applies to features in a building context
        feature.setBuildingContextDescription(Boolean.TRUE.equals(transferredFeature.getBuildingContext())
                ? transferredFeature.getBuildingContextDescription()
                : null);
        feature.setFeatureCondition(transferredFeature.getFeatureCondition());
        feature.setRemarksFeature(transferredFeature.getRemarksFeature());

        feature.setSite(transferredFeature.getSite());

        // Handle feature type
        if (transferredFeature.getFeatureType() != null && transferredFeature.getFeatureType().getId() != null) {
            FeatureType featureType = featureTypeRepository.findById(transferredFeature.getFeatureType().getId())
                    .orElseGet(() -> featureTypeRepository.save(transferredFeature.getFeatureType()));

            feature.setFeatureType(featureType);
        } else {
            feature.setFeatureType(null);
        }

        // Handle preservation condition
        if (transferredFeature.getPreservationCondition() != null && transferredFeature.getPreservationCondition().getId() != null) {
            PreservationCondition preservationCondition = preservationConditionRepository.findById(transferredFeature.getPreservationCondition().getId())
                    .orElseGet(() -> preservationConditionRepository.save(transferredFeature.getPreservationCondition()));

            feature.setPreservationCondition(preservationCondition);
        } else {
            feature.setPreservationCondition(null);
        }

        featureRepository.save(feature);
        return "feature is updated";
    }

    @DeleteMapping("/{featureId}")
    public String delete(@PathVariable UUID featureId) {

        // Get feature
        Feature feature = featureRepository.findById(featureId)
                .orElseThrow(() -> new IllegalArgumentException("invalid feature id: " + featureId));

        // Delete references
        for (Sample referencedSample : feature.getSampleList()) {
            referencedSample.setFeature(null);
            sampleRepository.save(referencedSample);
        }

        featureRepository.delete(feature);
        return "feature is deleted";
    }

    @PutMapping("/{featureId}/updateFeatureType")
    public String updateFeatureType(@RequestBody FeatureType transferredFeatureType,
                                    @PathVariable UUID featureId) {

        Feature feature = featureRepository.findById(featureId)
                .orElseThrow(() -> new IllegalArgumentException("invalid feature id: " + featureId));

        FeatureType featureType = featureTypeRepository.findById(transferredFeatureType.getId())
                .orElseGet(() -> featureTypeRepository.save(transferredFeatureType));

        feature.setFeatureType(featureType);

        featureRepository.save(feature);

        return "feature is updated with new featureType";
    }

    @PutMapping("/{featureId}/updatePreservationCondition")
    public String updatePreservationCondition(@RequestBody PreservationCondition transferredPreservationCondition,
                                              @PathVariable UUID featureId) {

        Feature feature = featureRepository.findById(featureId)
                .orElseThrow(() -> new IllegalArgumentException("invalid feature id: " + featureId));

        PreservationCondition preservationCondition = preservationConditionRepository.findById(transferredPreservationCondition.getId())
                .orElseGet(() -> preservationConditionRepository.save(transferredPreservationCondition));

        feature.setPreservationCondition(preservationCondition);

        featureRepository.save(feature);

        return "feature is updated with new preservationCondition";
    }

    private static UUID idOf(Site site) {
        return site == null ? null : site.getId();
    }

    @ExceptionHandler(ExcavationYears.InvalidExcavationYearException.class)
    public ResponseEntity<String> handleInvalidExcavationYear(ExcavationYears.InvalidExcavationYearException e) {
        return ResponseEntity.badRequest().body(e.getMessage());
    }

    @ExceptionHandler(LabelTakenException.class)
    public ResponseEntity<String> handleLabelTaken(LabelTakenException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(e.getMessage());
    }

    // E.g. another request saved the same label between the check and the save
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<String> handleDataIntegrityViolation(DataIntegrityViolationException e) {
        String cause = String.valueOf(e.getMostSpecificCause().getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(cause.contains(Feature.UNIQUE_LABEL)
                        ? "The feature could not be saved: its label is already used in this site."
                        : "The feature could not be saved: " + cause);
    }
}
