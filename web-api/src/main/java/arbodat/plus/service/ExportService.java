package arbodat.plus.service;

import arbodat.plus.model.*;
import arbodat.plus.repository.*;
import com.fasterxml.jackson.core.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.OutputStream;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class ExportService {

    private final ResearchProjectRepository researchProjectRepository;
    private final SiteRepository siteRepository;
    private final FeatureRepository featureRepository;
    private final SampleRepository sampleRepository;
    private final AbsoluteDatingRepository absoluteDatingRepository;
    private final ResultRepository resultRepository;

    public ExportService(
        ResearchProjectRepository researchProjectRepository,
        SiteRepository siteRepository,
        FeatureRepository featureRepository,
        SampleRepository sampleRepository,
        AbsoluteDatingRepository absoluteDatingRepository,
        ResultRepository resultRepository
    ) {
        this.researchProjectRepository = researchProjectRepository;
        this.siteRepository = siteRepository;
        this.featureRepository = featureRepository;
        this.sampleRepository = sampleRepository;
        this.absoluteDatingRepository = absoluteDatingRepository;
        this.resultRepository = resultRepository;
    }

    private record ExportScope(
            List<ResearchProject> researchProjects,
            Map<UUID, Set<UUID>> rpToSiteIds,
            Map<UUID, Site> sitesById,
            Map<UUID, List<Feature>> siteToFeatures,
            Map<UUID, List<Sample>> featureToSamples
    ) {}

    private ExportScope resolveScope(ExportFilter filter) {
        Set<UUID> rpIds, siteIds, featureIds, sampleIds;

        switch (filter.level()) {
            case NONE -> {
                rpIds = ids(researchProjectRepository.findAll(), ResearchProject::getId);
                siteIds = ids(siteRepository.findByResearchProjectIdIn(rpIds), Site::getId);
                featureIds = ids(featureRepository.findBySiteIdIn(siteIds), Feature::getId);
                sampleIds = ids(sampleRepository.findByFeatureIdIn(featureIds), Sample::getId);
            }
            case RESEARCH_PROJECT -> {
                rpIds = new HashSet<>(filter.ids());
                siteIds = ids(siteRepository.findByResearchProjectIdIn(rpIds), Site::getId);
                featureIds = ids(featureRepository.findBySiteIdIn(siteIds), Feature::getId);
                sampleIds = ids(sampleRepository.findByFeatureIdIn(featureIds), Sample::getId);
            }
            case SITE -> {
                siteIds = new HashSet<>(filter.ids());
                rpIds = ids(researchProjectRepository.findBySiteIdIn(siteIds), ResearchProject::getId);
                featureIds = ids(featureRepository.findBySiteIdIn(siteIds), Feature::getId);
                sampleIds = ids(sampleRepository.findByFeatureIdIn(featureIds), Sample::getId);
            }
            case FEATURE -> {
                featureIds = new HashSet<>(filter.ids());
                List<Feature> featureEntities = featureRepository.findAllById(featureIds);
                siteIds = ids(featureEntities, f -> f.getSite().getId());
                rpIds = ids(researchProjectRepository.findBySiteIdIn(siteIds), ResearchProject::getId);
                sampleIds = ids(sampleRepository.findByFeatureIdIn(featureIds), Sample::getId);
            }
            case SAMPLE -> {
                sampleIds = new HashSet<>(filter.ids());
                List<Sample> sampleEntities = sampleRepository.findAllById(sampleIds);
                featureIds = ids(sampleEntities, s -> s.getFeature().getId());
                List<Feature> featureEntities = featureRepository.findAllById(featureIds);
                siteIds = ids(featureEntities, f -> f.getSite().getId());
                rpIds = ids(researchProjectRepository.findBySiteIdIn(siteIds), ResearchProject::getId);
            }
            default -> throw new IllegalStateException("Unknown filter level");
        }

        List<ResearchProject> researchProjects = researchProjectRepository.findAllById(rpIds);
        List<Site> siteEntities = siteRepository.findAllById(siteIds);
        List<Feature> featureEntities = featureRepository.findAllById(featureIds);
        List<Sample> sampleEntities = sampleRepository.findAllById(sampleIds);

        // Site -> RP mapping (many-to-many), limited to RPs that are actually relevant
        Map<UUID, Set<UUID>> rpToSiteIds = new HashMap<>();
        for (Object[] pair : siteRepository.findRpIdPairsBySiteIdIn(siteIds)) {
            UUID siteId = (UUID) pair[0];
            UUID pairRpId = (UUID) pair[1];
            if (rpIds.contains(pairRpId)) {
                rpToSiteIds.computeIfAbsent(pairRpId, k -> new HashSet<>()).add(siteId);
            }
        }

        Map<UUID, Site> sitesById = siteEntities.stream()
                .collect(Collectors.toMap(Site::getId, s -> s));

        Map<UUID, List<Feature>> siteToFeatures = featureEntities.stream()
                .collect(Collectors.groupingBy(f -> f.getSite().getId()));

        Map<UUID, List<Sample>> featureToSamples = sampleEntities.stream()
                .collect(Collectors.groupingBy(s -> s.getFeature().getId()));

        return new ExportScope(researchProjects, rpToSiteIds, sitesById, siteToFeatures, featureToSamples);
    }

    private <T> Set<UUID> ids(Collection<T> items, Function<T, UUID> extractor) {
        return items.stream().map(extractor).collect(Collectors.toSet());
    }

    @Transactional(readOnly = true)
    public void writeExport(OutputStream out, ExportFilter filter) throws IOException {
        ExportScope scope = resolveScope(filter);

        JsonFactory factory = new JsonFactory();
        try (JsonGenerator gen = factory.createGenerator(out, JsonEncoding.UTF8)) {
            gen.writeStartArray();
            for (ResearchProject rp : scope.researchProjects()) {
                writeResearchProject(gen, rp, scope);
            }
            gen.writeEndArray();
        }
    }

    private void writeResearchProject(JsonGenerator gen, ResearchProject rp, ExportScope scope) throws IOException {
        gen.writeStartObject();
        // Research project fields -------------------------------------------------
        gen.writeStringField("id", rp.getId().toString());
        gen.writeStringField("projectName", rp.getProjectName());
        gen.writeStringField("funder", rp.getFunder());
        gen.writeStringField("authorisationNumber", rp.getAuthorisationNumber());
        // License
        if (rp.getLicense() != null) {
            gen.writeObjectFieldStart("license");
            gen.writeStringField("id", rp.getLicense().getId());
            gen.writeStringField("label", rp.getLicense().getLabel());
            gen.writeEndObject();
        } else {
            gen.writeNullField("license");
        }
        gen.writeStringField("exportFileName", rp.getExportFileName());

        // Sites -------------------------------------------------------------------
        gen.writeArrayFieldStart("sites");
        for (UUID siteId : scope.rpToSiteIds().getOrDefault(rp.getId(), Set.of())) {
            Site site = scope.sitesById().get(siteId);
            if (site != null) writeSite(gen, site, scope);
        }
        gen.writeEndArray();
        // -------------------------------------------------------------------------
        gen.writeEndObject();
    }

    private void writeSite(JsonGenerator gen, Site site, ExportScope scope) throws IOException {
        gen.writeStartObject();
        // Site fields -------------------------------------------------------------
        gen.writeStringField("id", site.getId().toString());
        gen.writeStringField("label", site.getLabel());
        gen.writeStringField("activityNumber", site.getActivityNumber());
        gen.writeStringField("labelAbbreviation", site.getLabelAbbreviation());
        gen.writeStringField("siteNumber", site.getSiteNumber());
        // Taxonomy
        if (site.getTaxonomy() != null) {
            gen.writeObjectFieldStart("taxonomy");
            gen.writeStringField("id", site.getTaxonomy().getId());
            gen.writeStringField("label", site.getTaxonomy().getLabel());
            gen.writeEndObject();
        } else {
            gen.writeNullField("taxonomy");
        }
        // Site types
        gen.writeArrayFieldStart("siteTypes");
        for (SiteType siteType : site.getSiteTypeList()) {
            gen.writeStartObject();
            gen.writeStringField("id", siteType.getId());
            gen.writeStringField("label", siteType.getLabel());
            gen.writeStringField("labelDe", siteType.getLabelDe());
            gen.writeStringField("labelFr", siteType.getLabelFr());
            gen.writeStringField("structuralConcept", siteType.getStructuralConcept());
            gen.writeEndObject();
        }
        gen.writeEndArray();
        // Site type uncertain
        if (site.getSiteTypeUncertain() != null) {
            gen.writeBooleanField("siteTypeUncertain", site.getSiteTypeUncertain());
        } else {
            gen.writeNullField("siteTypeUncertain");
        }
        // Natural unit
        if (site.getNaturalUnit() != null) {
            NaturalUnit naturalUnit = site.getNaturalUnit();
            gen.writeObjectFieldStart("naturalUnit");
            gen.writeStringField("id", naturalUnit.getId());
            gen.writeStringField("label", naturalUnit.getLabel());
            gen.writeStringField("labelDe", naturalUnit.getLabelDe());
            gen.writeStringField("labelFr", naturalUnit.getLabelFr());
            gen.writeStringField("naturalMainGroup", naturalUnit.getNaturalMainGroup());
            gen.writeEndObject();
        } else {
            gen.writeNullField("naturalUnit");
        }
        // Site condition undisturbed
        if (site.getUndisturbed() != null) {
            gen.writeBooleanField("undisturbed", site.getUndisturbed());
        } else {
            gen.writeNullField("undisturbed");
        }
        // Institutions
        writeInstitutions(gen, site.getInstitutionList());
        // Site directors
        gen.writeArrayFieldStart("siteDirectors");
        for (User user : site.getSiteDirectors()) {
            writeUser(gen, user);
        }
        gen.writeEndArray();
        // Archaeologists
        gen.writeArrayFieldStart("archaeologists");
        for (User user : site.getArchaeologists()) {
            writeUser(gen, user);
        }
        gen.writeEndArray();
        // Botanists
        gen.writeArrayFieldStart("botanists");
        for (User user : site.getBotanists()) {
            writeUser(gen, user);
        }
        gen.writeEndArray();
        // Coordinate
        if (site.getCoordinate() != null) {
            writeCoordinate(gen, site.getCoordinate());
        } else {
            gen.writeNullField("coordinate");
        }
        // Address
        if (site.getAddress() != null) {
            Address address = site.getAddress();
            gen.writeObjectFieldStart("address");
            gen.writeStringField("country", address.getCountry());
            gen.writeStringField("county", address.getCounty());
            gen.writeStringField("district", address.getDistrict());
            gen.writeStringField("parish", address.getParish());
            gen.writeStringField("streetOrPlace", address.getStreet_or_place());
            gen.writeStringField("town", address.getTown());
            gen.writeEndObject();
        } else {
            gen.writeNullField("address");
        }
        // Remarks
        gen.writeStringField("remarks", site.getRemarksSite());
        // Literature
        writeLiterature(gen, site.getLiteratureList());

        // Features ----------------------------------------------------------------
        gen.writeArrayFieldStart("features");
        for (Feature feature : scope.siteToFeatures().getOrDefault(site.getId(), List.of())) {
            writeFeature(gen, feature, scope);
        }
        gen.writeEndArray();
        // -------------------------------------------------------------------------
        gen.writeEndObject();
    }

    // Including samples and absolute dating + results
    private void writeFeature(JsonGenerator gen, Feature feature, ExportScope scope) throws IOException {
        gen.writeStartObject();
        // Feature fields ----------------------------------------------------------
        gen.writeStringField("id", feature.getId().toString());
        gen.writeStringField("label", feature.getLabel());
        gen.writeStringField("excavationArea", feature.getExcavationArea());
        // Feature condition
        if (feature.getFeatureCondition() != null) {
            gen.writeBooleanField("featureCondition", feature.getFeatureCondition());
        } else
            gen.writeNullField("featureCondition");
        // PreservationCondition
        if (feature.getPreservationCondition() != null) {
            PreservationCondition preservationCondition = feature.getPreservationCondition();
            gen.writeObjectFieldStart("preservationCondition");
            gen.writeStringField("id", preservationCondition.getId());
            gen.writeStringField("label", preservationCondition.getLabel());
            gen.writeStringField("labelDe", preservationCondition.getLabelDe());
            gen.writeStringField("labelFr", preservationCondition.getLabelFr());
            gen.writeEndObject();
        } else
            gen.writeNullField("preservationCondition");
        // FeatureType
        if (feature.getFeatureType() != null) {
            FeatureType featureType = feature.getFeatureType();
            gen.writeObjectFieldStart("featureType");
            gen.writeStringField("id", featureType.getId());
            gen.writeStringField("label", featureType.getLabel());
            gen.writeStringField("labelDe", featureType.getLabelDe());
            gen.writeStringField("labelFr", featureType.getLabelFr());
            gen.writeEndObject();
        } else
            gen.writeNullField("featureType"); 
        // Excavation years
        gen.writeArrayFieldStart("excavationYears");
        if (feature.getExcavationYears() != null) {
            for (Integer year : feature.getExcavationYears()) {
                gen.writeNumber(year);
            }
        }
        gen.writeEndArray();
        // Building context
        if (feature.getBuildingContext() != null) {
            gen.writeBooleanField("buildingContext", feature.getBuildingContext());
        } else
            gen.writeNullField("buildingContext");
        gen.writeStringField("remarks", feature.getRemarksFeature());

        // Samples -----------------------------------------------------------------
        List<Sample> samplesOfFeature = scope.featureToSamples().getOrDefault(feature.getId(), List.of());
        Set<UUID> sampleIdsOfFeature = ids(samplesOfFeature, Sample::getId);

        // Called per feature (batch), not per sample -> no N+1
        Map<UUID, List<Result>> resultsBySample = resultRepository.findBySampleFeatureId(feature.getId())
                .stream().collect(Collectors.groupingBy(r -> r.getSample().getId()));

        Map<UUID, List<AbsoluteDating>> absoluteDatingsBySample = absoluteDatingRepository.findBySampleFeatureId(feature.getId())
                .stream().collect(Collectors.groupingBy(ad -> ad.getSample().getId()));

        Map<UUID, List<UUID>> absoluteDatingIdsByResultId = new HashMap<>();
        for (Object[] pair : resultRepository.findAbsoluteDatingIdPairsBySampleIdIn(sampleIdsOfFeature)) {
            UUID resultId = (UUID) pair[0];
            UUID absoluteDatingId = (UUID) pair[1];
            absoluteDatingIdsByResultId.computeIfAbsent(resultId, k -> new ArrayList<>()).add(absoluteDatingId);
        }

        gen.writeArrayFieldStart("samples");
        for (Sample sample : samplesOfFeature) {
            gen.writeStartObject();
            // Sample fields -------------------------------------------------------
            gen.writeStringField("id", sample.getId().toString());
            gen.writeStringField("label", sample.getLabel());
            // Location
            gen.writeStringField("stratum", sample.getStratum());
            gen.writeStringField("layer", sample.getLayer());
            gen.writeStringField("sector", sample.getSector());
            gen.writeStringField("planum", sample.getPlanum());
            if (sample.getDepthFrom() != null) {
                gen.writeNumberField("depthFrom", sample.getDepthFrom());
            } else
                gen.writeNullField("depthFrom");
            if (sample.getDepthTo() != null) {
                gen.writeNumberField("depthTo", sample.getDepthTo());
            } else
                gen.writeNullField("depthTo");
            // Coordinate
            if (sample.getCoordinate() != null) {
                writeCoordinate(gen, sample.getCoordinate());
            } else
                gen.writeNullField("coordinate");
            // Measurement details
            // Botanical determination by
            gen.writeArrayFieldStart("botanicalDeterminationBy");
            if (sample.getBotanicalDeterminationBy() != null) {
                for (User user : sample.getBotanicalDeterminationBy()) {
                    writeUser(gen, user);
                }
            }
            gen.writeEndArray();

            gen.writeStringField("botanicalDeterminationYear", sample.getBotanicalDeterminationYear());
            // Fractions analyzed
            gen.writeArrayFieldStart("fractionAnalyzed");
            if (sample.getFractionAnalyzedList() != null) {
                for (FractionAnalyzed fraction : sample.getFractionAnalyzedList()) {
                    gen.writeStartObject();
                    gen.writeStringField("id", fraction.getId().toString());
                    gen.writeStringField("fractionAnalyzed", fraction.getFractionAnalyzed());
                    gen.writeStringField("orgOrMin", fraction.getOrgOrMin());
                    if (fraction.getSieveSize() != null) {
                        gen.writeNumberField("sieveSize", fraction.getSieveSize());
                    } else
                        gen.writeNullField("sieveSize");
                    if (fraction.getStandardMultiplier() != null) {
                        gen.writeNumberField("standardMultiplier", fraction.getStandardMultiplier());
                    } else
                        gen.writeNullField("standardMultiplier");
                    gen.writeEndObject();
                }
            }
            gen.writeEndArray();

            // Sample type
            if (sample.getSampleType() != null) {
                SampleType sampleType = sample.getSampleType();
                gen.writeObjectFieldStart("sampleType");
                gen.writeStringField("id", sampleType.getId());
                gen.writeStringField("label", sampleType.getLabel());
                gen.writeStringField("labelDe", sampleType.getLabelDe());
                gen.writeStringField("labelFr", sampleType.getLabelFr());
                gen.writeEndObject();
            } else
                gen.writeNullField("sampleType");
            // Mass / storage find
            if (sample.getSampleStorage() != null) {
                gen.writeBooleanField("sampleStorage", sample.getSampleStorage());
            } else
                gen.writeNullField("sampleStorage");
            // Microremain
            if (sample.getMicroRemain() != null) {
                gen.writeBooleanField("microRemain", sample.getMicroRemain());
            } else
                gen.writeNullField("microRemain");

            // Inventory
            // Seeds and fruits
            writeSampleInvestigated(gen, "seedsAndFruits", sample.getSeedsAndFruits());
            // Wood subfossile
            writeSampleInvestigated(gen, "woodSubfossile", sample.getWoodSubfossile());
            // Charcoal investigated
            writeSampleInvestigated(gen, "charcoalInvestigated", sample.getCharcoalInvestigated());
            // Charcoal total weight
            if (sample.getTotalWeight() != null) {
                gen.writeNumberField("totalWeight", sample.getTotalWeight());
            } else
                gen.writeNullField("totalWeight");
            // Charcoal undetermined weight
            if (sample.getWeightUndetermined() != null) {
                gen.writeNumberField("weightUndetermined", sample.getWeightUndetermined());
            } else
                gen.writeNullField("weightUndetermined");
            // Sample volume
            if (sample.getSampleVolume() != null) {
                gen.writeNumberField("sampleVolume", sample.getSampleVolume());
            } else
                gen.writeNullField("sampleVolume");
            gen.writeStringField("volumeDetermination", sample.getVolumeDetermination());

            // Sample dating
            // Chronozone
            if (sample.getChronozone() != null) {
                Chronozone chronozone = sample.getChronozone();
                gen.writeObjectFieldStart("chronozone");
                gen.writeStringField("id", chronozone.getId());
                gen.writeStringField("label", chronozone.getLabel());
                gen.writeEndObject();
            } else
                gen.writeNullField("chronozone");

            gen.writeStringField("archaeologicalDating", sample.getArchaeologicalDating());
            gen.writeStringField("culturalGroup", sample.getCulturalGroup());
            if (sample.getAbsoluteDatingFrom() != null)
                gen.writeNumberField("absoluteDatingFrom", sample.getAbsoluteDatingFrom());
            else
                gen.writeNullField("absoluteDatingFrom");
            if (sample.getAbsoluteDatingTo() != null)
                gen.writeNumberField("absoluteDatingTo", sample.getAbsoluteDatingTo());
            else
                gen.writeNullField("absoluteDatingTo");

            // Remarks
            gen.writeStringField("remarksSample", sample.getRemarksSample());

            // Absolute Datings ----------------------------------------------------
            gen.writeArrayFieldStart("absoluteDatings");
            for (AbsoluteDating absoluteDating : absoluteDatingsBySample.getOrDefault(sample.getId(), List.of())) {
                gen.writeStartObject();
                // Absolute datings fields
                gen.writeStringField("id", absoluteDating.getId().toString());
                gen.writeStringField("subSample", absoluteDating.getSubSample());
                // Material
                if (absoluteDating.getMaterial() != null) {
                    Material material = absoluteDating.getMaterial();
                    gen.writeObjectFieldStart("material");
                    gen.writeStringField("id", material.getId());
                    gen.writeStringField("label", material.getLabel());
                    gen.writeEndObject();
                } else
                    gen.writeNullField("material");
                // Remarks
                gen.writeStringField("remarks", absoluteDating.getRemarks());
                // DatingMethod
                if (absoluteDating.getDatingMethod() != null) {
                    DatingMethod datingMethod = absoluteDating.getDatingMethod();
                    gen.writeObjectFieldStart("datingMethod");
                    gen.writeStringField("id", datingMethod.getId());
                    gen.writeStringField("label", datingMethod.getLabel());
                    gen.writeStringField("labelDe", datingMethod.getLabelDe());
                    gen.writeStringField("labelFr", datingMethod.getLabelFr());
                    gen.writeEndObject();
                } else
                    gen.writeNullField("datingMethod");

                // Dendrochronological Dating
                if (absoluteDating.getDendrochronologicalDating() != null) {
                    DendrochronologicalDating dendrochronologicalDating = absoluteDating.getDendrochronologicalDating();
                    gen.writeObjectFieldStart("dendrochronologicalDating");
                    gen.writeStringField("id", dendrochronologicalDating.getId().toString());
                    // Laboratory
                    if (dendrochronologicalDating.getLaboratory() != null) {
                        Laboratory laboratory = dendrochronologicalDating.getLaboratory();
                        gen.writeObjectFieldStart("laboratory");
                        gen.writeStringField("id", laboratory.getId().toString());
                        gen.writeStringField("label", laboratory.getLabel());
                        gen.writeEndObject();
                    } else
                        gen.writeNullField("laboratory");
                    // Number
                    gen.writeStringField("number", dendrochronologicalDating.getNumber());
                    // Dendrochronological age
                    gen.writeStringField(
                            "dendrochronologicalAge",
                            dendrochronologicalDating.getDendrochronologicalAge()
                    );
                    // Waney edge
                    if (dendrochronologicalDating.getWaneyEdge() != null) {
                        gen.writeBooleanField("waneyEdge", dendrochronologicalDating.getWaneyEdge());
                    } else
                        gen.writeNullField("waneyEdge");
                    gen.writeEndObject();
                } else
                    gen.writeNullField("dendrochronologicalDating");

                // C14 dating
                if (absoluteDating.getC14Dating() != null) {
                    C14Dating c14Dating = absoluteDating.getC14Dating();
                    gen.writeObjectFieldStart("c14Dating");
                    gen.writeStringField("id", c14Dating.getId().toString());
                    // C14 Laboratory
                    if (c14Dating.getC14Laboratory() != null) {
                        C14Laboratory c14Lab = c14Dating.getC14Laboratory();
                        gen.writeObjectFieldStart("c14Laboratory");
                        gen.writeStringField("id", c14Lab.getId());
                        gen.writeStringField("label", c14Lab.getLabel());
                        gen.writeStringField("notation", c14Lab.getNotation());
                        gen.writeEndObject();
                    } else
                        gen.writeNullField("c14Laboratory");
                    // Number
                    gen.writeStringField("number", c14Dating.getNumber());
                    // C14-age BP
                    if (c14Dating.getC14AgeBp() != null) {
                        gen.writeNumberField("c14AgeBp", c14Dating.getC14AgeBp());
                    } else
                        gen.writeNullField("c14AgeBp");
                    //  C14 std dev
                    if (c14Dating.getC14StdDev() != null) {
                        gen.writeNumberField("c14StdDev", c14Dating.getC14StdDev());
                    } else
                        gen.writeNullField("c14StdDev");
                    // C14 cal BC/AD (2s)
                    gen.writeStringField("c14CalibrationBcAd2s", c14Dating.getC14CalibrationBcAd2s());
                    // Delta C13
                    if (c14Dating.getDeltaC13() != null) {
                        gen.writeNumberField("deltaC13", c14Dating.getDeltaC13());
                    } else
                        gen.writeNullField("deltaC13");
                    // Delta C13 uncertainty
                    if (c14Dating.getDeltaC13Uncertainty() != null) {
                        gen.writeNumberField("deltaC13Uncertainty", c14Dating.getDeltaC13Uncertainty());
                    } else
                        gen.writeNullField("deltaC13Uncertainty");
                    // pMC
                    if (c14Dating.getPmc() != null) {
                        gen.writeNumberField("pmc", c14Dating.getPmc());
                    } else
                        gen.writeNullField("pmc");
                    // pMC uncertainty
                    if (c14Dating.getPmcUncertainty() != null) {
                        gen.writeNumberField("pmcUncertainty", c14Dating.getPmcUncertainty());
                    } else
                        gen.writeNullField("pmcUncertainty");

                    gen.writeEndObject();
                } else
                    gen.writeNullField("c14Dating");

                // Other dating
                if (absoluteDating.getOtherDating() != null) {
                    OtherDating otherDating = absoluteDating.getOtherDating();
                    gen.writeObjectFieldStart("otherDating");
                    gen.writeStringField("id", otherDating.getId().toString());
                    // Laboratory
                    if (otherDating.getLaboratory() != null) {
                        Laboratory laboratory = otherDating.getLaboratory();
                        gen.writeObjectFieldStart("laboratory");
                        gen.writeStringField("id", laboratory.getId().toString());
                        gen.writeStringField("label", laboratory.getLabel());
                        gen.writeEndObject();
                    } else
                        gen.writeNullField("laboratory");
                    // Number
                    gen.writeStringField("number", otherDating.getNumber());
                    // Age
                    gen.writeStringField("ageDivers", otherDating.getAgeDivers());

                    gen.writeEndObject();
                } else
                    gen.writeNullField("otherDating");

                // Literature
                writeLiterature(gen, absoluteDating.getLiteratureList());

                gen.writeEndObject();
            }
            gen.writeEndArray();

            // Results -------------------------------------------------------------
            gen.writeArrayFieldStart("results");
            for (Result result : resultsBySample.getOrDefault(sample.getId(), List.of())) {
                gen.writeStartObject();
                // Result fields
                gen.writeStringField("id", result.getId().toString());
                // Fraction
                gen.writeObjectFieldStart("fraction");
                gen.writeStringField("fractionAnalyzed", result.getFractionAnalyzed());
                gen.writeStringField("orgOrMin", result.getOrgOrMin());
                if (result.getSieveSize() != null) {
                    gen.writeNumberField("sieveSize", result.getSieveSize());
                } else
                    gen.writeNullField("sieveSize");
                if (result.getMultiplier() != null) {
                    gen.writeNumberField("multiplier", result.getMultiplier());
                } else
                    gen.writeNullField("multiplier");

                gen.writeEndObject();

                // Entry date
                if (result.getEntryDate() != null) {
                    gen.writeStringField("entryDate", result.getEntryDate().toInstant().toString());
                } else
                    gen.writeNullField("entryDate");

                // StateOfPreservation
                if (result.getStateOfPreservation() != null) {
                    StateOfPreservation stateOfPreservation = result.getStateOfPreservation();
                    gen.writeObjectFieldStart("stateOfPreservation");
                    gen.writeStringField("id",  stateOfPreservation.getId());
                    gen.writeStringField("label", stateOfPreservation.getLabel());
                    gen.writeStringField("labelDe", stateOfPreservation.getLabelDe());
                    gen.writeStringField("labelFr",stateOfPreservation.getLabelFr());
                    gen.writeEndObject();
                } else
                    gen.writeNullField("stateOfPreservation");

                // ClassificationConfer
                if (result.getClassificationConfer() != null) {
                    ClassificationConfer classificationConfer = result.getClassificationConfer();
                    gen.writeObjectFieldStart("classificationConfer");
                    gen.writeStringField("id", classificationConfer.getId());
                    gen.writeStringField("label", classificationConfer.getLabel());
                    gen.writeStringField("labelDe", classificationConfer.getLabelDe());
                    gen.writeStringField("labelFr", classificationConfer.getLabelFr());
                    gen.writeEndObject();
                } else
                    gen.writeNullField("classificationConfer");

                // TaxCode
                if (result.getTaxCode() != null) {
                    TaxCode taxCode = result.getTaxCode();
                    gen.writeObjectFieldStart("taxCode");
                    gen.writeStringField("id", taxCode.getId());
                    gen.writeStringField("label", taxCode.getLabel());
                    gen.writeStringField("labelDe", taxCode.getLabelDe());
                    gen.writeStringField("labelEn", taxCode.getLabelEn());
                    gen.writeStringField("labelFr", taxCode.getLabelFr());
                    gen.writeStringField("labelIt", taxCode.getLabelIt());
                    gen.writeStringField("taxonomy", taxCode.getTaxonomy());
                    gen.writeEndObject();
                } else
                    gen.writeNullField("taxCode");

                // Remarks taxonomy
                gen.writeStringField("remarksTaxonomy", result.getRemarksTaxonomy());

                // RestType
                if (result.getRestType() != null) {
                    RestType restType = result.getRestType();
                    gen.writeObjectFieldStart("restType");
                    gen.writeStringField("id", restType.getId());
                    gen.writeStringField("label", restType.getLabel());
                    gen.writeStringField("labelDe", restType.getLabelDe());
                    gen.writeStringField("labelFr", restType.getLabelFr());
                    gen.writeStringField("structuralConcept", restType.getStructuralConcept());
                    gen.writeEndObject();
                } else
                    gen.writeNullField("restType");

                // Rest count
                if (result.getRestCount() != null) {
                    gen.writeNumberField("restCount", result.getRestCount());
                } else
                    gen.writeNullField("restCount");

                // Rest fragment
                if (result.getRestFragment() != null) {
                    gen.writeNumberField("restFragment", result.getRestFragment());
                } else
                    gen.writeNullField("restFragment");

                // Rest weight
                if (result.getRestWeight() != null) {
                    gen.writeNumberField("restWeight", result.getRestWeight());
                } else
                    gen.writeNullField("restWeight");

                // Estimation
                if (result.getEstimation() != null) {
                    gen.writeBooleanField("estimation", result.getEstimation());
                } else
                    gen.writeNullField("estimation");

                // Absolute datings
                gen.writeArrayFieldStart("absoluteDatingIds");
                for (UUID adId : absoluteDatingIdsByResultId.getOrDefault(result.getId(), List.of())) {
                    gen.writeString(adId.toString());
                }
                gen.writeEndArray();

                gen.writeEndObject();
            }
            gen.writeEndArray();
            gen.writeEndObject();
        }
        gen.writeEndArray();
        gen.writeEndObject();
    }

    private void writeInstitutions(JsonGenerator gen, Set<Institution> institutions) throws IOException {
        gen.writeArrayFieldStart("institutions");

        for (Institution institution : institutions) {
            gen.writeStartObject();
            gen.writeStringField("id", institution.getId().toString());
            gen.writeStringField("label", institution.getLabel());
            gen.writeStringField("rorId", institution.getRorId());
            gen.writeEndObject();
        }
        gen.writeEndArray();
    }

    private void writeUser(JsonGenerator gen, User user) throws IOException {
        gen.writeStartObject();

        gen.writeStringField("id", user.getId().toString());
        gen.writeStringField("lastName", user.getLastName());
        gen.writeStringField("firstName", user.getFirstName());
        gen.writeStringField("middleName", user.getMiddleName());
        gen.writeStringField("mailAddress", user.getMailAddress());
        gen.writeStringField("orcid", user.getOrcid());
        // Institutions
        writeInstitutions(gen, user.getInstitutionList());

        gen.writeEndObject();
    }

    private void writeCoordinate(JsonGenerator gen, Coordinate coordinate) throws IOException {
        gen.writeObjectFieldStart("coordinate");

        // Coordinate system
        if (coordinate.getCoordinateSystem() != null) {
            CoordinateSystem coordinateSystem = coordinate.getCoordinateSystem();
            gen.writeObjectFieldStart("coordinateSystem");
            gen.writeStringField("id", coordinateSystem.getId());
            gen.writeStringField("label", coordinateSystem.getLabel());
            gen.writeStringField("epsg", coordinateSystem.getEpsg());
            gen.writeEndObject();
        } else
            gen.writeNullField("coordinateSystem");
        // Longitude
        if (coordinate.getLongitude() != null)
            gen.writeNumberField("longitude", coordinate.getLongitude());
        else
            gen.writeNullField("longitude");
        // Latitude
        if (coordinate.getLatitude() != null)
            gen.writeNumberField("latitude", coordinate.getLatitude());
        else
            gen.writeNullField("latitude");
        // Altitude
        if (coordinate.getAltitude() != null)
            gen.writeNumberField("altitude", coordinate.getAltitude());
        else
            gen.writeNullField("altitude");
        // Longitude WGS84
        if (coordinate.getLongitudeWgs84() != null)
            gen.writeNumberField("longitudeWgs84", coordinate.getLongitudeWgs84());
        else
            gen.writeNullField("longitudeWgs84");
        // Latitude WGS84
        if (coordinate.getLatitudeWgs84() != null)
            gen.writeNumberField("latitudeWgs84", coordinate.getLatitudeWgs84());
        else
            gen.writeNullField("latitudeWgs84");
        // Remarks
        gen.writeStringField("remarks", coordinate.getRemarksCoordinate());

        gen.writeEndObject();
    }

    private void writeLiterature(JsonGenerator gen, Set<Literature> literatureList) throws IOException {
        gen.writeArrayFieldStart("literature");
        for (Literature literature : literatureList) {
            gen.writeStartObject();

            gen.writeStringField("id", literature.getId().toString());
            gen.writeStringField("title", literature.getTitle());
            // Publication year
            if (literature.getPublicationYear() != null)
                gen.writeNumberField("publicationYear", literature.getPublicationYear());
            else
                gen.writeNullField("publicationYear");
            // Authors
            gen.writeArrayFieldStart("authors");
            for (Author author : literature.getAuthorList()) {
                gen.writeStartObject();
                gen.writeStringField("id", author.getId().toString());
                gen.writeStringField("lastName", author.getLastName());
                gen.writeStringField("firstName", author.getFirstName());
                gen.writeStringField("middleName", author.getMiddleName());
                gen.writeEndObject();
            }
            gen.writeEndArray();

            gen.writeStringField("doi", literature.getDoi());
            gen.writeStringField("shortCitation", literature.getShortCitation());
            gen.writeStringField("longCitation", literature.getLongCitation());
            gen.writeStringField("abstract", literature.getLitAbstract());

            gen.writeEndObject();
        }
        gen.writeEndArray();
    }

    private void writeSampleInvestigated(JsonGenerator gen, String fieldName, SampleInvestigated investigated) throws IOException {
        if (investigated != null) {
            gen.writeObjectFieldStart(fieldName);

            gen.writeStringField("id", investigated.getId());
            gen.writeStringField("label", investigated.getLabel());
            gen.writeStringField("labelDe", investigated.getLabelDe());
            gen.writeStringField("labelFr", investigated.getLabelFr());

            gen.writeEndObject();
        } else
            gen.writeNullField(fieldName);
    }
}
