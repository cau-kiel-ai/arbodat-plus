package arbodat.plus.controller;

import arbodat.plus.model.*;
import arbodat.plus.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/samples")
public class SampleController {

    @Autowired
    SampleRepository sampleRepository;

    @Autowired
    SampleTypeRepository sampleTypeRepository;

    @Autowired
    ChronozoneRepository chronozoneRepository;

    @Autowired
    AbsoluteDatingRepository absoluteDatingRepository;

    @Autowired
    ResultRepository resultRepository;

    @Autowired
    SampleInvestigatedRepository sampleInvestigatedRepository;

    @Autowired
    CoordinateSystemRepository coordinateSystemRepository;

    @Autowired
    UserRepository userRepository;

    @GetMapping
    public List<Sample> getAllSamples() {
        return sampleRepository.findAll();
    }

    @PostMapping
    public String create(@RequestBody Sample transferredSample) {

        // Handle fractions
        for (FractionAnalyzed fraction : transferredSample.getFractionAnalyzedList()) {
            fraction.setSample(transferredSample);
        }

        // Handle coordinate
        if (transferredSample.getCoordinate() != null && transferredSample.getCoordinate().getCoordinateSystem() != null) {
            CoordinateSystem coordinateSystem = coordinateSystemRepository.findById(transferredSample.getCoordinate().getCoordinateSystem().getId())
                    .orElseGet(() -> coordinateSystemRepository.save(transferredSample.getCoordinate().getCoordinateSystem()));

            transferredSample.getCoordinate().setCoordinateSystem(coordinateSystem);
        }

        // Handle sample type
        if (transferredSample.getSampleType() != null) {
            SampleType sampleType = sampleTypeRepository.findById(transferredSample.getSampleType().getId())
                    .orElseGet(() -> sampleTypeRepository.save(transferredSample.getSampleType()));

            transferredSample.setSampleType(sampleType);
        }

        // Handle chronozone
        if (transferredSample.getChronozone() != null) {
            Chronozone chronozone = chronozoneRepository.findById(transferredSample.getChronozone().getId())
                    .orElseGet(() -> chronozoneRepository.save(transferredSample.getChronozone()));

            transferredSample.setChronozone(chronozone);
        }

        // Handle seedsAndFruits
        if (transferredSample.getSeedsAndFruits() != null) {
            SampleInvestigated seedsAndFruits = sampleInvestigatedRepository.findById(transferredSample.getSeedsAndFruits().getId())
                    .orElseGet(() -> sampleInvestigatedRepository.save(transferredSample.getSeedsAndFruits()));

            transferredSample.setSeedsAndFruits(seedsAndFruits);
        }

        // Handle charcoalInvestigated
        if (transferredSample.getCharcoalInvestigated() != null) {
            SampleInvestigated charcoalInvestigated = sampleInvestigatedRepository.findById(transferredSample.getCharcoalInvestigated().getId())
                    .orElseGet(() -> sampleInvestigatedRepository.save(transferredSample.getCharcoalInvestigated()));

            transferredSample.setCharcoalInvestigated(charcoalInvestigated);
        }

        // Handle woodSubfossile
        if (transferredSample.getWoodSubfossile() != null) {
            SampleInvestigated woodSubfossile = sampleInvestigatedRepository.findById(transferredSample.getWoodSubfossile().getId())
                    .orElseGet(() -> sampleInvestigatedRepository.save(transferredSample.getWoodSubfossile()));

            transferredSample.setWoodSubfossile(woodSubfossile);
        }

        sampleRepository.save(transferredSample);
        return "sample is created";
    }

    @PutMapping("/{sampleId}")
    public String update(@RequestBody  Sample transferredSample,
                         @PathVariable UUID sampleId) {

        // Handle coordinateSystem
        if (transferredSample.getCoordinate() != null) {
            if (transferredSample.getCoordinate().getCoordinateSystem() != null &&
                    transferredSample.getCoordinate().getCoordinateSystem().getId() != null) {
                CoordinateSystem coordinateSystem = coordinateSystemRepository.findById(transferredSample.getCoordinate().getCoordinateSystem().getId())
                        .orElseGet(() -> coordinateSystemRepository.save(transferredSample.getCoordinate().getCoordinateSystem()));

                transferredSample.getCoordinate().setCoordinateSystem(coordinateSystem);
            } else {
                transferredSample.getCoordinate().setCoordinateSystem(null);
            }
        }

        Sample sample = sampleRepository.findById(sampleId)
                .orElseThrow(() -> new IllegalArgumentException("invalid sample id: " + sampleId));

        // Update attributes
        sample.setLabel(transferredSample.getLabel());
        sample.setBotanicalDeterminationYear(transferredSample.getBotanicalDeterminationYear());
        sample.setBotanicalDeterminationBy(transferredSample.getBotanicalDeterminationBy());
        sample.setSampleStorage(transferredSample.getSampleStorage());
        sample.setMicroRemain(transferredSample.getMicroRemain());
        sample.setVolumeDetermination(transferredSample.getVolumeDetermination());
        sample.setSampleVolume(transferredSample.getSampleVolume());
        sample.setRemarksSample(transferredSample.getRemarksSample());
        sample.setStratum(transferredSample.getStratum());
        sample.setLayer(transferredSample.getLayer());
        sample.setSector(transferredSample.getSector());
        sample.setPlanum(transferredSample.getPlanum());
        sample.setDepthFrom(transferredSample.getDepthFrom());
        sample.setDepthTo(transferredSample.getDepthTo());
        sample.setTotalWeight(transferredSample.getTotalWeight());
        sample.setWeightUndetermined(transferredSample.getWeightUndetermined());
        sample.setArchaeologicalDating(transferredSample.getArchaeologicalDating());
        sample.setCulturalGroup(transferredSample.getCulturalGroup());
        sample.setCoordinate(transferredSample.getCoordinate());

        sample.setFeature(transferredSample.getFeature());

        // Handle seedAndFruits
        if (transferredSample.getSeedsAndFruits() != null && transferredSample.getSeedsAndFruits().getId() != null) {
            SampleInvestigated seedsAndFruits = sampleInvestigatedRepository.findById(transferredSample.getSeedsAndFruits().getId())
                    .orElseGet(() -> sampleInvestigatedRepository.save(transferredSample.getSeedsAndFruits()));

            sample.setSeedsAndFruits(seedsAndFruits);
        } else {
            sample.setSeedsAndFruits(null);
        }
        // Handle charcoalInvestigated
        if (transferredSample.getCharcoalInvestigated() != null && transferredSample.getCharcoalInvestigated().getId() != null) {
            SampleInvestigated charcoalInvestigated = sampleInvestigatedRepository.findById(transferredSample.getCharcoalInvestigated().getId())
                    .orElseGet(() -> sampleInvestigatedRepository.save(transferredSample.getCharcoalInvestigated()));

            sample.setCharcoalInvestigated(charcoalInvestigated);
        } else {
            sample.setCharcoalInvestigated(null);
        }
        // Handle woodSubfossile
        if (transferredSample.getWoodSubfossile() != null && transferredSample.getWoodSubfossile().getId() != null) {
            SampleInvestigated woodSubfossile = sampleInvestigatedRepository.findById(transferredSample.getWoodSubfossile().getId())
                    .orElseGet(() -> sampleInvestigatedRepository.save(transferredSample.getWoodSubfossile()));

            sample.setWoodSubfossile(woodSubfossile);
        } else  {
            sample.setWoodSubfossile(null);
        }
        // Handle chronozone
        if (transferredSample.getChronozone() != null && transferredSample.getChronozone().getId() != null) {
            Chronozone chronozone = chronozoneRepository.findById(transferredSample.getChronozone().getId())
                    .orElseGet(() -> chronozoneRepository.save(transferredSample.getChronozone()));

            sample.setChronozone(chronozone);
        } else {
            sample.setChronozone(null);
        }
        // Handle sampleType
        if (transferredSample.getSampleType() != null && transferredSample.getSampleType().getId() != null) {
            SampleType sampleType = sampleTypeRepository.findById(transferredSample.getSampleType().getId())
                    .orElseGet(() -> sampleTypeRepository.save(transferredSample.getSampleType()));

            sample.setSampleType(sampleType);
        } else {
            sample.setSampleType(null);
        }

        sample.getFractionAnalyzedList().clear();
        for (FractionAnalyzed fraction : transferredSample.getFractionAnalyzedList()) {
            sample.getFractionAnalyzedList().add(fraction);
            fraction.setSample(sample);
        }

        sampleRepository.save(sample);
        return "sample is updated";
    }

    @DeleteMapping("/{sampleId}")
    public String delete(@PathVariable UUID sampleId) {

        // Get sample
        Sample sample = sampleRepository.findById(sampleId)
                .orElseThrow(() -> new IllegalArgumentException("invalid sample id: " + sampleId));

        // Delete references
        for (AbsoluteDating referencedAbsoluteDating : sample.getAbsoluteDatingList()) {
            referencedAbsoluteDating.setSample(null);
            absoluteDatingRepository.save(referencedAbsoluteDating);
        }
        for (Result referencedResult : sample.getResultList()) {
            referencedResult.setSample(null);
            resultRepository.save(referencedResult);
        }

        sampleRepository.delete(sample);
        return "sample is deleted";
    }

    @PutMapping("/{sampleId}/updateSampleType")
    public String updateSampleType(@RequestBody  SampleType transferredSampleType,
                                   @PathVariable UUID sampleId) {

        Sample sample = sampleRepository.findById(sampleId)
                .orElseThrow(() -> new IllegalArgumentException("invalid sample id: " + sampleId));


        SampleType sampleType = sampleTypeRepository.findById(transferredSampleType.getId())
                .orElseGet(() -> sampleTypeRepository.save(transferredSampleType));

        sample.setSampleType(sampleType);

        sampleRepository.save(sample);

        return "sample is updated with new sampleType";
    }

    @PutMapping("/{sampleId}/updateChronozone")
    public String updateChronozone(@RequestBody  Chronozone transferredChronozone,
                                   @PathVariable UUID sampleId) {

        Sample sample = sampleRepository.findById(sampleId)
                .orElseThrow(() -> new IllegalArgumentException("invalid sample id: " + sampleId));


        Chronozone chronozone = chronozoneRepository.findById(transferredChronozone.getId())
                .orElseGet(() -> chronozoneRepository.save(transferredChronozone));

        sample.setChronozone(chronozone);

        sampleRepository.save(sample);

        return "sample is updated with new chronozone";
    }

//    @PutMapping("/{sampleId}/updateArchaeologicalDating")
//    public String updateArchaeologicalDating(@RequestBody  ArchaeologicalDating transferredArchaeologicalDating,
//                                             @PathVariable UUID sampleId) {
//
//        Sample sample = sampleRepository.findById(sampleId)
//                .orElseThrow(() -> new IllegalArgumentException("invalid sample id: " + sampleId));
//
//
//        ArchaeologicalDating archaeologicalDating = archaeologicalDatingRepository.findById(transferredArchaeologicalDating.getId())
//                .orElseGet(() -> archaeologicalDatingRepository.save(transferredArchaeologicalDating));
//
//        sample.setArchaeologicalDating(archaeologicalDating);
//
//        sampleRepository.save(sample);
//
//        return "sample is updated with new sampleType";
//    }
//
//    @PutMapping("/{sampleId}/updateCulturalGroup")
//    public String updateCulturalGroup(@RequestBody  CulturalGroup transferredCulturalGroup,
//                                      @PathVariable UUID sampleId) {
//
//        Sample sample = sampleRepository.findById(sampleId)
//                .orElseThrow(() -> new IllegalArgumentException("invalid sample id: " + sampleId));
//
//
//        CulturalGroup culturalGroup = culturalGroupRepository.findById(transferredCulturalGroup.getId())
//                .orElseGet(() -> culturalGroupRepository.save(transferredCulturalGroup));
//
//        sample.setCulturalGroup(culturalGroup);
//
//        sampleRepository.save(sample);
//
//        return "sample is updated with new culturalGroup";
//    }

    @PutMapping("/{sampleId}/updateSeedsAndFruits")
    public String updateSeedsAndFruits(@RequestBody  SampleInvestigated transferredSeedsAndFruits,
                                       @PathVariable UUID sampleId) {

        Sample sample = sampleRepository.findById(sampleId)
                .orElseThrow(() -> new IllegalArgumentException("invalid sample id: " + sampleId));


        SampleInvestigated seedsAndFruits = sampleInvestigatedRepository.findById(transferredSeedsAndFruits.getId())
                .orElseGet(() -> sampleInvestigatedRepository.save(transferredSeedsAndFruits));

        sample.setSeedsAndFruits(seedsAndFruits);

        sampleRepository.save(sample);

        return "sample is updated with new seedsAndFruits";
    }

    @PutMapping("/{sampleId}/updateCharcoalInvestigated")
    public String updateCharcoalInvestigated(@RequestBody  SampleInvestigated transferredCharcoalInvestigated,
                                             @PathVariable UUID sampleId) {

        Sample sample = sampleRepository.findById(sampleId)
                .orElseThrow(() -> new IllegalArgumentException("invalid sample id: " + sampleId));


        SampleInvestigated charcoalInvestigated = sampleInvestigatedRepository.findById(transferredCharcoalInvestigated.getId())
                .orElseGet(() -> sampleInvestigatedRepository.save(transferredCharcoalInvestigated));

        sample.setCharcoalInvestigated(charcoalInvestigated);

        sampleRepository.save(sample);

        return "sample is updated with new charcoalInvestigated";
    }

    @PutMapping("/{sampleId}/updateWoodSubfossile")
    public String updateWoodSubfossile(@RequestBody  SampleInvestigated transferredWoodSubfossile,
                                       @PathVariable UUID sampleId) {

        Sample sample = sampleRepository.findById(sampleId)
                .orElseThrow(() -> new IllegalArgumentException("invalid sample id: " + sampleId));


        SampleInvestigated woodSubfossile = sampleInvestigatedRepository.findById(transferredWoodSubfossile.getId())
                .orElseGet(() -> sampleInvestigatedRepository.save(transferredWoodSubfossile));

        sample.setWoodSubfossile(woodSubfossile);

        sampleRepository.save(sample);

        return "sample is updated with new woodSubfossile";
    }

    @PutMapping("/{sampleId}/updateBotanicalDeterminationBy")
    public String updateBotanicalDeterminationBy(@RequestBody  List<UUID> employeeIds,
                                                 @PathVariable UUID       sampleId) {

        // Get sample
        Sample sample = sampleRepository.findById(sampleId)
                .orElseThrow(() -> new IllegalArgumentException("invalid sample id: " + sampleId));

        // Handle employeeIds -> get users and create user set
        Set<User> employeeList = new HashSet<>();
        for (UUID employeeId : employeeIds) {
            User employee = userRepository.findById(employeeId)
                    .orElseThrow(() -> new IllegalArgumentException("invalid employee id: " + employeeId));
            employeeList.add(employee);
        }

        sample.setBotanicalDeterminationBy(employeeList);
        sampleRepository.save(sample);
        return "sample is updated with new botanicalDeterminationBy";
    }
}
