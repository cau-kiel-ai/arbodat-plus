package arbodat.plus.controller;

import arbodat.plus.model.*;
import arbodat.plus.repository.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/dante_attributes")
public class DanteAttributeController {

    @Autowired
    LicenseRepository licenseRepository;

    @Autowired
    TaxonomyRepository taxonomyRepository;

    @Autowired
    SiteTypeRepository siteTypeRepository;

    @Autowired
    NaturalUnitRepository naturalUnitRepository;

    @Autowired
    TaxCodeRepository taxCodeRepository;

    @Autowired
    CoordinateSystemRepository coordinateSystemRepository;

    @Autowired
    FeatureTypeRepository featureTypeRepository;

    @Autowired
    PreservationConditionRepository preservationConditionRepository;

    @Autowired
    ChronozoneRepository chronozoneRepository;

    @Autowired
    SampleTypeRepository sampleTypeRepository;

    @Autowired
    SampleInvestigatedRepository sampleInvestigatedRepository;

    @Autowired
    MaterialRepository materialRepository;

    @Autowired
    C14LaboratoryRepository c14LaboratoryRepository;

    @Autowired
    DatingMethodRepository datingMethodRepository;

    @Autowired
    ClassificationConferRepository classificationConferRepository;

    @Autowired
    RestTypeRepository restTypeRepository;

    @Autowired
    StateOfPreservationRepository stateOfPreservationRepository;


    @GetMapping("license")
    public List<License> getAllLicense() { return licenseRepository.findAll(); }

    @GetMapping("taxonomy")
    public List<Taxonomy> getAllTaxonomy()  { return taxonomyRepository.findAll(); }

    @GetMapping("site_type")
    public List<SiteType> getAllSiteType() { return siteTypeRepository.findAll(); }

    @GetMapping("natural_unit")
    public List<NaturalUnit> getAllNaturalUnit() { return naturalUnitRepository.findAll(); }

    @GetMapping("/tax_code")
    public List<TaxCode> getAllTaxCode() { return taxCodeRepository.findAll(); }

    @GetMapping("/coordinate_system")
    public List<CoordinateSystem> getAllCoordinateSystem() { return coordinateSystemRepository.findAll(); }

    @GetMapping("/feature_type")
    public List<FeatureType> getAllFeatureType() { return featureTypeRepository.findAll(); }

    @GetMapping("/preservation_condition")
    public List<PreservationCondition> getAllPreservationCondition() { return preservationConditionRepository.findAll(); }

    @GetMapping("/chronozone")
    public List<Chronozone> getAllChronozone() { return chronozoneRepository.findAll(); }

    @GetMapping("/sample_type")
    public List<SampleType> getAllSampleType() { return sampleTypeRepository.findAll(); }

    @GetMapping("/sample_investigated")
    public List<SampleInvestigated> getAllSampleInvestigated() { return sampleInvestigatedRepository.findAll(); }

    @GetMapping("/material")
    public List<Material> getAllMaterial() { return materialRepository.findAll();}

    @GetMapping("/c14_laboratory")
    public List<C14Laboratory> getAllC14Laboratory() { return c14LaboratoryRepository.findAll();}

    @GetMapping("/dating_method")
    public List<DatingMethod> getAllDatingMethod() { return datingMethodRepository.findAll();}

    @GetMapping("/classification_confer")
    public List<ClassificationConfer> getAllCf() {
        return classificationConferRepository.findAll();
    }

    @GetMapping("rest_type")
    public List<RestType> getAllRestType() { return restTypeRepository.findAll(); }

    @GetMapping("state_of_preservation")
    public List<StateOfPreservation> getAllStateOfPreservation() { return stateOfPreservationRepository.findAll(); }

    @PostMapping
    public void updateDanteAttribute(@RequestBody Map<String, Object> danteAttributes) {

        danteAttributes.forEach((attribute, values) -> {
            if (values instanceof List<?> list) {

                if (!list.isEmpty() && list.get(0) instanceof Map<?, ?>) {
                    // Jackson ObjectMapper to deserialise the list
                    ObjectMapper objectMapper = new ObjectMapper();

                    switch (attribute) {

                        // research project -------------------------------------------------------
                        case "license" -> {
                            try {
                                // Convert map to list of ‘license’
                                List<License> licenseList = objectMapper.convertValue(list, new TypeReference<List<License>>() {
                                });

                                licenseRepository.saveAll(licenseList);
                            } catch (Exception e) {
                                throw new IllegalArgumentException("Error converting to List<License>", e);
                            }
                        }

                        // site -------------------------------------------------------------------
                        case "taxonomy" -> {
                            try {
                                // Convert map to list of ‘taxonomy’
                                List<Taxonomy> taxonomyList = objectMapper.convertValue(list, new TypeReference<List<Taxonomy>>() {
                                });

                                taxonomyRepository.saveAll(taxonomyList);
                            } catch (Exception e) {
                                throw new IllegalArgumentException("Error converting to List<Taxonomy>", e);
                            }
                        }

                        case "siteType" -> {
                            try {
                                // Convert map to list of ‘siteType’
                                List<SiteType> siteTypeList = objectMapper.convertValue(list, new TypeReference<List<SiteType>>() {
                                });

                                siteTypeRepository.saveAll(siteTypeList);
                            } catch (Exception e) {
                                throw new IllegalArgumentException("Error converting to List<SiteType>", e);
                            }
                        }

                        case "naturalUnit" -> {
                            try {
                                // Convert map to list of ‘naturalUnit’
                                List<NaturalUnit> naturalUnitList = objectMapper.convertValue(list, new TypeReference<List<NaturalUnit>>() {
                                });

                                naturalUnitRepository.saveAll(naturalUnitList);
                            } catch (Exception e) {
                                throw new IllegalArgumentException("Error converting to List<NaturalUnit>", e);
                            }
                        }

                        // coordinate -------------------------------------------------------------
                        case "coordinateSystem" -> {
                            try {
                                // Convert map to list of ‘coordinateSystem’
                                List<CoordinateSystem> coordinateSystemList = objectMapper.convertValue(list, new TypeReference<List<CoordinateSystem>>() {
                                });

                                coordinateSystemRepository.saveAll(coordinateSystemList);
                            } catch (Exception e) {
                                throw new IllegalArgumentException("Error converting to List<CoordinateSystem>", e);
                            }
                        }

                        // feature -------------------------------------------------------------------
                        case "featureType" -> {
                            try {
                                // Convert map to list of ‘featureType’
                                List<FeatureType> featureTypeList = objectMapper.convertValue(list, new TypeReference<List<FeatureType>>() {
                                });

                                featureTypeRepository.saveAll(featureTypeList);
                            } catch (Exception e) {
                                throw new IllegalArgumentException("Error converting to List<FeatureType>", e);
                            }
                        }

                        case "preservationCondition" -> {
                            try {
                                // Convert map to list of ‘featureType’
                                List<PreservationCondition> preservationConditionList = objectMapper.convertValue(list, new TypeReference<List<PreservationCondition>>() {
                                });

                                preservationConditionRepository.saveAll(preservationConditionList);
                            } catch (Exception e) {
                                throw new IllegalArgumentException("Error converting to List<PreservationCondition>", e);
                            }
                        }

                        // sample -------------------------------------------------------------------
                        case "chronozone" -> {
                            try {
                                // Convert map to list of ‘chronozone’
                                List<Chronozone> chronozoneList = objectMapper.convertValue(list, new TypeReference<List<Chronozone>>() {
                                });

                                chronozoneRepository.saveAll(chronozoneList);
                            } catch (Exception e) {
                                throw new IllegalArgumentException("Error converting to List<Chronozone>", e);
                            }
                        }

                        case "sampleType" -> {
                            try {
                                // Convert map to list of ‘sampleType’
                                List<SampleType> sampleTypeList = objectMapper.convertValue(list, new TypeReference<List<SampleType>>() {
                                });

                                sampleTypeRepository.saveAll(sampleTypeList);
                            } catch (Exception e) {
                                throw new IllegalArgumentException("Error converting to List<SampleType>", e);
                            }
                        }

                        case "sampleInvestigated" -> {
                            try {
                                // Convert map to list of ‘sampleInvestigated’
                                List<SampleInvestigated> sampleInvestigatedList = objectMapper.convertValue(list, new TypeReference<List<SampleInvestigated>>() {
                                });

                                sampleInvestigatedRepository.saveAll(sampleInvestigatedList);
                            } catch (Exception e) {
                                throw new IllegalArgumentException("Error converting to List<SampleInvestigated>", e);
                            }
                        }

                        // absolute dating --------------------------------------------------------
                        case "material" -> {
                            try {
                                // Convert map to list of ‘material’
                                List<Material> materialList = objectMapper.convertValue(list, new TypeReference<List<Material>>() {
                                });

                                materialRepository.saveAll(materialList);
                            } catch (Exception e) {
                                throw new IllegalArgumentException("Error converting to List<Material>", e);
                            }
                        }

                        case "datingMethod" -> {
                            try {
                                // Convert map to list of ‘datingMethod’
                                List<DatingMethod> datingMethodList = objectMapper.convertValue(list, new TypeReference<List<DatingMethod>>() {
                                });

                                datingMethodRepository.saveAll(datingMethodList);
                            } catch (Exception e) {
                                throw new IllegalArgumentException("Error converting to List<DatingMethod>", e);
                            }
                        }

                        case "c14Laboratory" -> {
                            try {
                                // Convert map to list of ‘c14Laboratory’
                                List<C14Laboratory> c14LaboratoryList = objectMapper.convertValue(list, new TypeReference<List<C14Laboratory>>() {
                                });

                                c14LaboratoryRepository.saveAll(c14LaboratoryList);
                            } catch (Exception e) {
                                throw new IllegalArgumentException("Error converting to List<C14Laboratory>", e);
                            }
                        }

                        // result -----------------------------------------------------------------
                        case "ArboDat_PCODE" -> {
                            try {
                                // Convert map to list of ‘TaxCode’
                                List<TaxCode> taxCodeList = objectMapper.convertValue(list, new TypeReference<List<TaxCode>>() {
                                });

                                taxCodeRepository.saveAll(taxCodeList);
                            } catch (Exception e) {
                                throw new IllegalArgumentException("Error converting to List<TaxCode>", e);
                            }
                        }

                        case "classificationConfer" -> {
                                try {
                                    // Convert map to list of ‘ClassificationConfer’
                                    List<ClassificationConfer> classificationConferList = objectMapper.convertValue(list, new TypeReference<List<ClassificationConfer>>() {
                                    });

                                    classificationConferRepository.saveAll(classificationConferList);
                                } catch (Exception e) {
                                    throw new IllegalArgumentException("Error converting to List<ClassificationConfer>", e);
                                }
                        }

                        case "restType" -> {
                            try {
                                // Convert map to list of ‘restType’
                                List<RestType> restTypeList = objectMapper.convertValue(list, new TypeReference<List<RestType>>() {
                                });

                                restTypeRepository.saveAll(restTypeList);
                            } catch (Exception e) {
                                throw new IllegalArgumentException("Error converting to List<RestType>", e);
                            }
                        }

                        case "stateOfPreservation" -> {
                            try {
                                // Convert map to list of ‘stateOfPreservation’
                                List<StateOfPreservation> stateOfPreservationList = objectMapper.convertValue(list, new TypeReference<List<StateOfPreservation>>() {
                                });

                                stateOfPreservationRepository.saveAll(stateOfPreservationList);
                            } catch (Exception e) {
                                throw new IllegalArgumentException("Error converting to List<StateOfPreservation>", e);
                            }
                        }

                    }
                } else {
                    throw new IllegalArgumentException("The list does not contain any valid objects.");
                }
            } else {
                throw new IllegalArgumentException(attribute + "-attribute has no list of objects");
            }
        });
    }
}
