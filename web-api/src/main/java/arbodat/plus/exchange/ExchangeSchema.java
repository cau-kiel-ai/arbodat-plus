package arbodat.plus.exchange;

import arbodat.plus.exchange.Field.*;
import arbodat.plus.model.*;

import java.util.*;
import java.util.function.BiConsumer;
import java.util.function.Function;

import static arbodat.plus.exchange.EntityType.*;

/**
 * The JSON exchange format, declared once: the export writes it, the import reads, compares and
 * applies it. Field order is the order of the JSON properties.
 *
 * <p>Format versions ({@link #FORMAT_VERSION}): 0 is the bare array of research projects older
 * exports are; 1 wraps it in an envelope (see {@code ExportService}). Raise the version
 * when a change would make an older ArboDat+ misread a file, e.g. a field changing meaning; plain
 * new fields don't need it (an older importer warns about unknown fields and skips them).
 */
public final class ExchangeSchema {

    public static final int FORMAT_VERSION = 1;

    private ExchangeSchema() {}

    // Lookups -----------------------------------------------------------------------------------

    private static final EntitySpec<License> LICENSE_SPEC = lookup(LICENSE, License.class, License::getId, List.of(
            str("label", License::getLabel, License::setLabel)));

    private static final EntitySpec<Taxonomy> TAXONOMY_SPEC = lookup(TAXONOMY, Taxonomy.class, Taxonomy::getId, List.of(
            str("label", Taxonomy::getLabel, Taxonomy::setLabel)));

    private static final EntitySpec<SiteType> SITE_TYPE_SPEC = lookup(SITE_TYPE, SiteType.class, SiteType::getId, List.of(
            str("label", SiteType::getLabel, SiteType::setLabel),
            str("labelDe", SiteType::getLabelDe, SiteType::setLabelDe),
            str("labelFr", SiteType::getLabelFr, SiteType::setLabelFr),
            str("structuralConcept", SiteType::getStructuralConcept, SiteType::setStructuralConcept)));

    private static final EntitySpec<NaturalUnit> NATURAL_UNIT_SPEC = lookup(NATURAL_UNIT, NaturalUnit.class, NaturalUnit::getId, List.of(
            str("label", NaturalUnit::getLabel, NaturalUnit::setLabel),
            str("labelDe", NaturalUnit::getLabelDe, NaturalUnit::setLabelDe),
            str("labelFr", NaturalUnit::getLabelFr, NaturalUnit::setLabelFr),
            str("naturalMainGroup", NaturalUnit::getNaturalMainGroup, NaturalUnit::setNaturalMainGroup)));

    private static final EntitySpec<FeatureType> FEATURE_TYPE_SPEC = lookup(FEATURE_TYPE, FeatureType.class, FeatureType::getId, List.of(
            str("label", FeatureType::getLabel, FeatureType::setLabel),
            str("labelDe", FeatureType::getLabelDe, FeatureType::setLabelDe),
            str("labelFr", FeatureType::getLabelFr, FeatureType::setLabelFr)));

    private static final EntitySpec<PreservationCondition> PRESERVATION_CONDITION_SPEC = lookup(PRESERVATION_CONDITION, PreservationCondition.class, PreservationCondition::getId, List.of(
            str("label", PreservationCondition::getLabel, PreservationCondition::setLabel),
            str("labelDe", PreservationCondition::getLabelDe, PreservationCondition::setLabelDe),
            str("labelFr", PreservationCondition::getLabelFr, PreservationCondition::setLabelFr)));

    private static final EntitySpec<SampleType> SAMPLE_TYPE_SPEC = lookup(SAMPLE_TYPE, SampleType.class, SampleType::getId, List.of(
            str("label", SampleType::getLabel, SampleType::setLabel),
            str("labelDe", SampleType::getLabelDe, SampleType::setLabelDe),
            str("labelFr", SampleType::getLabelFr, SampleType::setLabelFr)));

    private static final EntitySpec<SampleInvestigated> SAMPLE_INVESTIGATED_SPEC = lookup(SAMPLE_INVESTIGATED, SampleInvestigated.class, SampleInvestigated::getId, List.of(
            str("label", SampleInvestigated::getLabel, SampleInvestigated::setLabel),
            str("labelDe", SampleInvestigated::getLabelDe, SampleInvestigated::setLabelDe),
            str("labelFr", SampleInvestigated::getLabelFr, SampleInvestigated::setLabelFr)));

    private static final EntitySpec<Chronozone> CHRONOZONE_SPEC = lookup(CHRONOZONE, Chronozone.class, Chronozone::getId, List.of(
            str("label", Chronozone::getLabel, Chronozone::setLabel)));

    private static final EntitySpec<Material> MATERIAL_SPEC = lookup(MATERIAL, Material.class, Material::getId, List.of(
            str("label", Material::getLabel, Material::setLabel)));

    private static final EntitySpec<DatingMethod> DATING_METHOD_SPEC = lookup(DATING_METHOD, DatingMethod.class, DatingMethod::getId, List.of(
            str("label", DatingMethod::getLabel, DatingMethod::setLabel),
            str("labelDe", DatingMethod::getLabelDe, DatingMethod::setLabelDe),
            str("labelFr", DatingMethod::getLabelFr, DatingMethod::setLabelFr)));

    private static final EntitySpec<C14Laboratory> C14_LABORATORY_SPEC = lookup(C14_LABORATORY, C14Laboratory.class, C14Laboratory::getId, List.of(
            str("label", C14Laboratory::getLabel, C14Laboratory::setLabel),
            str("notation", C14Laboratory::getNotation, C14Laboratory::setNotation)));

    private static final EntitySpec<CoordinateSystem> COORDINATE_SYSTEM_SPEC = lookup(COORDINATE_SYSTEM, CoordinateSystem.class, CoordinateSystem::getId, List.of(
            str("label", CoordinateSystem::getLabel, CoordinateSystem::setLabel),
            str("epsg", CoordinateSystem::getEpsg, CoordinateSystem::setEpsg)));

    private static final EntitySpec<StateOfPreservation> STATE_OF_PRESERVATION_SPEC = lookup(STATE_OF_PRESERVATION, StateOfPreservation.class, StateOfPreservation::getId, List.of(
            str("label", StateOfPreservation::getLabel, StateOfPreservation::setLabel),
            str("labelDe", StateOfPreservation::getLabelDe, StateOfPreservation::setLabelDe),
            str("labelFr", StateOfPreservation::getLabelFr, StateOfPreservation::setLabelFr)));

    private static final EntitySpec<ClassificationConfer> CLASSIFICATION_CONFER_SPEC = lookup(CLASSIFICATION_CONFER, ClassificationConfer.class, ClassificationConfer::getId, List.of(
            str("label", ClassificationConfer::getLabel, ClassificationConfer::setLabel),
            str("labelDe", ClassificationConfer::getLabelDe, ClassificationConfer::setLabelDe),
            str("labelFr", ClassificationConfer::getLabelFr, ClassificationConfer::setLabelFr)));

    private static final EntitySpec<TaxCode> TAX_CODE_SPEC = lookup(TAX_CODE, TaxCode.class, TaxCode::getId, List.of(
            str("label", TaxCode::getLabel, TaxCode::setLabel),
            str("labelDe", TaxCode::getLabelDe, TaxCode::setLabelDe),
            str("labelEn", TaxCode::getLabelEn, TaxCode::setLabelEn),
            str("labelFr", TaxCode::getLabelFr, TaxCode::setLabelFr),
            str("labelIt", TaxCode::getLabelIt, TaxCode::setLabelIt),
            str("taxonomy", TaxCode::getTaxonomy, TaxCode::setTaxonomy)));

    private static final EntitySpec<RestType> REST_TYPE_SPEC = lookup(REST_TYPE, RestType.class, RestType::getId, List.of(
            str("label", RestType::getLabel, RestType::setLabel),
            str("labelDe", RestType::getLabelDe, RestType::setLabelDe),
            str("labelFr", RestType::getLabelFr, RestType::setLabelFr),
            str("structuralConcept", RestType::getStructuralConcept, RestType::setStructuralConcept)));

    // Shared records ----------------------------------------------------------------------------

    private static final EntitySpec<Institution> INSTITUTION_SPEC = new EntitySpec<>(INSTITUTION, Institution.class, Institution::getId, List.of(
            str("label", Institution::getLabel, Institution::setLabel),
            str("rorId", Institution::getRorId, Institution::setRorId)));

    private static final EntitySpec<User> USER_SPEC = new EntitySpec<>(USER, User.class, User::getId, List.of(
            str("lastName", User::getLastName, User::setLastName),
            str("firstName", User::getFirstName, User::setFirstName),
            str("middleName", User::getMiddleName, User::setMiddleName),
            str("mailAddress", User::getMailAddress, User::setMailAddress),
            str("orcid", User::getOrcid, User::setOrcid),
            new SharedSet<>("institutions", INSTITUTION, User::getInstitutionList,
                    new Link("user_institution_relation", "user_id", "institution_id"))));

    private static final EntitySpec<Author> AUTHOR_SPEC = new EntitySpec<>(AUTHOR, Author.class, Author::getId, List.of(
            str("lastName", Author::getLastName, Author::setLastName),
            str("firstName", Author::getFirstName, Author::setFirstName),
            str("middleName", Author::getMiddleName, Author::setMiddleName)));

    private static final EntitySpec<Literature> LITERATURE_SPEC = new EntitySpec<>(LITERATURE, Literature.class, Literature::getId, List.of(
            str("title", Literature::getTitle, Literature::setTitle),
            integer("publicationYear", Literature::getPublicationYear, Literature::setPublicationYear),
            new SharedSet<>("authors", AUTHOR, Literature::getAuthorList,
                    new Link("literature_author_relation", "literature_id", "author_id")),
            str("doi", Literature::getDoi, Literature::setDoi),
            str("shortCitation", Literature::getShortCitation, Literature::setShortCitation),
            str("longCitation", Literature::getLongCitation, Literature::setLongCitation),
            str("abstract", Literature::getLitAbstract, Literature::setLitAbstract)));

    private static final EntitySpec<Laboratory> LABORATORY_SPEC = new EntitySpec<>(LABORATORY, Laboratory.class, Laboratory::getId, List.of(
            str("label", Laboratory::getLabel, Laboratory::setLabel)));

    // Value objects (no id in the export) -------------------------------------------------------

    private static final List<Field<Coordinate>> COORDINATE_FIELDS = List.of(
            new LookupRef<>("coordinateSystem", COORDINATE_SYSTEM, Coordinate::getCoordinateSystem, Coordinate::setCoordinateSystem),
            dbl("longitude", Coordinate::getLongitude, Coordinate::setLongitude),
            dbl("latitude", Coordinate::getLatitude, Coordinate::setLatitude),
            dbl("altitude", Coordinate::getAltitude, Coordinate::setAltitude),
            dbl("longitudeWgs84", Coordinate::getLongitudeWgs84, Coordinate::setLongitudeWgs84),
            dbl("latitudeWgs84", Coordinate::getLatitudeWgs84, Coordinate::setLatitudeWgs84),
            str("remarks", Coordinate::getRemarksCoordinate, Coordinate::setRemarksCoordinate));

    private static final List<Field<Address>> ADDRESS_FIELDS = List.of(
            str("country", Address::getCountry, Address::setCountry),
            str("county", Address::getCounty, Address::setCounty),
            str("district", Address::getDistrict, Address::setDistrict),
            str("parish", Address::getParish, Address::setParish),
            str("streetOrPlace", Address::getStreet_or_place, Address::setStreet_or_place),
            str("town", Address::getTown, Address::setTown));

    // Research data -----------------------------------------------------------------------------

    private static final EntitySpec<ResearchProject> RESEARCH_PROJECT_SPEC = new EntitySpec<>(RESEARCH_PROJECT, ResearchProject.class, ResearchProject::getId, List.of(
            str("projectName", ResearchProject::getProjectName, ResearchProject::setProjectName),
            str("funder", ResearchProject::getFunder, ResearchProject::setFunder),
            str("authorisationNumber", ResearchProject::getAuthorisationNumber, ResearchProject::setAuthorisationNumber),
            new LookupRef<>("license", LICENSE, ResearchProject::getLicense, ResearchProject::setLicense),
            new Children<>("sites", SITE, true)));

    private static final EntitySpec<Site> SITE_SPEC = new EntitySpec<>(SITE, Site.class, Site::getId, List.of(
            str("label", Site::getLabel, Site::setLabel),
            new ValueList<>("activityNumbers", ValueType.STRING, Site::getActivityNumbers,
                    new Link("activity_numbers", "site_id", "activity_number")),
            str("labelAbbreviation", Site::getLabelAbbreviation, Site::setLabelAbbreviation),
            str("siteNumber", Site::getSiteNumber, Site::setSiteNumber),
            new LookupRef<>("taxonomy", TAXONOMY, Site::getTaxonomy, Site::setTaxonomy),
            new LookupSet<>("siteTypes", SITE_TYPE, Site::getSiteTypeList,
                    new Link("site_type_relation", "site_id", "site_type_id")),
            bool("siteTypeUncertain", Site::getSiteTypeUncertain, Site::setSiteTypeUncertain),
            new LookupRef<>("naturalUnit", NATURAL_UNIT, Site::getNaturalUnit, Site::setNaturalUnit),
            bool("undisturbed", Site::getUndisturbed, Site::setUndisturbed),
            new SharedSet<>("institutions", INSTITUTION, Site::getInstitutionList,
                    new Link("institutions", "site_id", "institution_id")),
            new SharedSet<>("siteDirectors", USER, Site::getSiteDirectors,
                    new Link("site_directors", "site_id", "user_id")),
            new SharedSet<>("archaeologists", USER, Site::getArchaeologists,
                    new Link("archaeologists", "site_id", "user_id")),
            new SharedSet<>("botanists", USER, Site::getBotanists,
                    new Link("botanists", "site_id", "user_id")),
            new Embedded<>("coordinate", Site::getCoordinate, Site::setCoordinate, Coordinate::new, COORDINATE_FIELDS),
            new Embedded<>("address", Site::getAddress, Site::setAddress, Address::new, ADDRESS_FIELDS),
            str("remarks", Site::getRemarksSite, Site::setRemarksSite),
            new SharedSet<>("literature", LITERATURE, Site::getLiteratureList,
                    new Link("literature_site_relation", "site_id", "literature_id")),
            new Children<>("features", FEATURE, false),
            new IdSet<>("researchProjects", RESEARCH_PROJECT,
                    new Link("site_research_project_relation", "site_id", "research_project_id"), false)));

    private static final EntitySpec<Feature> FEATURE_SPEC = new EntitySpec<>(FEATURE, Feature.class, Feature::getId, List.of(
            new Parent<>("site", SITE, Feature::getSite, Feature::setSite),
            str("label", Feature::getLabel, Feature::setLabel),
            str("excavationArea", Feature::getExcavationArea, Feature::setExcavationArea),
            bool("featureCondition", Feature::getFeatureCondition, Feature::setFeatureCondition),
            new LookupRef<>("preservationCondition", PRESERVATION_CONDITION, Feature::getPreservationCondition, Feature::setPreservationCondition),
            new LookupRef<>("featureType", FEATURE_TYPE, Feature::getFeatureType, Feature::setFeatureType),
            new ValueList<>("excavationYears", ValueType.INTEGER, Feature::getExcavationYears,
                    new Link("excavation_years", "feature_id", "excavation_year")),
            bool("buildingContext", Feature::getBuildingContext, Feature::setBuildingContext),
            str("buildingContextDescription", Feature::getBuildingContextDescription, Feature::setBuildingContextDescription),
            str("remarks", Feature::getRemarksFeature, Feature::setRemarksFeature),
            new Children<>("samples", SAMPLE, false)));

    private static final EntitySpec<Sample> SAMPLE_SPEC = new EntitySpec<>(SAMPLE, Sample.class, Sample::getId, List.of(
            new Parent<>("feature", FEATURE, Sample::getFeature, Sample::setFeature),
            str("label", Sample::getLabel, Sample::setLabel),
            str("stratum", Sample::getStratum, Sample::setStratum),
            str("layer", Sample::getLayer, Sample::setLayer),
            str("sector", Sample::getSector, Sample::setSector),
            str("planum", Sample::getPlanum, Sample::setPlanum),
            dbl("depthFrom", Sample::getDepthFrom, Sample::setDepthFrom),
            dbl("depthTo", Sample::getDepthTo, Sample::setDepthTo),
            new Embedded<>("coordinate", Sample::getCoordinate, Sample::setCoordinate, Coordinate::new, COORDINATE_FIELDS),
            new SharedSet<>("botanicalDeterminationBy", USER, Sample::getBotanicalDeterminationBy,
                    new Link("botanical_determination_by", "sample_id", "user_id")),
            str("botanicalDeterminationYear", Sample::getBotanicalDeterminationYear, Sample::setBotanicalDeterminationYear),
            new Children<>("fractionAnalyzed", FRACTION_ANALYZED, false),
            new LookupRef<>("sampleType", SAMPLE_TYPE, Sample::getSampleType, Sample::setSampleType),
            bool("sampleStorage", Sample::getSampleStorage, Sample::setSampleStorage),
            bool("microRemain", Sample::getMicroRemain, Sample::setMicroRemain),
            new LookupRef<>("seedsAndFruits", SAMPLE_INVESTIGATED, Sample::getSeedsAndFruits, Sample::setSeedsAndFruits),
            new LookupRef<>("woodSubfossile", SAMPLE_INVESTIGATED, Sample::getWoodSubfossile, Sample::setWoodSubfossile),
            new LookupRef<>("charcoalInvestigated", SAMPLE_INVESTIGATED, Sample::getCharcoalInvestigated, Sample::setCharcoalInvestigated),
            dbl("totalWeight", Sample::getTotalWeight, Sample::setTotalWeight),
            dbl("weightUndetermined", Sample::getWeightUndetermined, Sample::setWeightUndetermined),
            dbl("sampleVolume", Sample::getSampleVolume, Sample::setSampleVolume),
            str("volumeDetermination", Sample::getVolumeDetermination, Sample::setVolumeDetermination),
            new LookupRef<>("chronozone", CHRONOZONE, Sample::getChronozone, Sample::setChronozone),
            str("archaeologicalDating", Sample::getArchaeologicalDating, Sample::setArchaeologicalDating),
            str("culturalGroup", Sample::getCulturalGroup, Sample::setCulturalGroup),
            integer("absoluteDatingFrom", Sample::getAbsoluteDatingFrom, Sample::setAbsoluteDatingFrom),
            integer("absoluteDatingTo", Sample::getAbsoluteDatingTo, Sample::setAbsoluteDatingTo),
            str("remarksSample", Sample::getRemarksSample, Sample::setRemarksSample),
            new Children<>("absoluteDatings", ABSOLUTE_DATING, false),
            new Children<>("results", RESULT, false)));

    private static final EntitySpec<FractionAnalyzed> FRACTION_ANALYZED_SPEC = new EntitySpec<>(FRACTION_ANALYZED, FractionAnalyzed.class, FractionAnalyzed::getId, List.of(
            new Parent<>("sample", SAMPLE, FractionAnalyzed::getSample, FractionAnalyzed::setSample),
            str("fractionAnalyzed", FractionAnalyzed::getFractionAnalyzed, FractionAnalyzed::setFractionAnalyzed),
            str("orgOrMin", FractionAnalyzed::getOrgOrMin, FractionAnalyzed::setOrgOrMin),
            dbl("sieveSize", FractionAnalyzed::getSieveSize, FractionAnalyzed::setSieveSize),
            dbl("standardMultiplier", FractionAnalyzed::getStandardMultiplier, FractionAnalyzed::setStandardMultiplier)));

    private static final EntitySpec<AbsoluteDating> ABSOLUTE_DATING_SPEC = new EntitySpec<>(ABSOLUTE_DATING, AbsoluteDating.class, AbsoluteDating::getId, List.of(
            new Parent<>("sample", SAMPLE, AbsoluteDating::getSample, AbsoluteDating::setSample),
            str("subSample", AbsoluteDating::getSubSample, AbsoluteDating::setSubSample),
            new LookupRef<>("material", MATERIAL, AbsoluteDating::getMaterial, AbsoluteDating::setMaterial),
            str("remarks", AbsoluteDating::getRemarks, AbsoluteDating::setRemarks),
            new LookupRef<>("datingMethod", DATING_METHOD, AbsoluteDating::getDatingMethod, AbsoluteDating::setDatingMethod),
            new OwnedRef<>("dendrochronologicalDating", DENDROCHRONOLOGICAL_DATING,
                    AbsoluteDating::getDendrochronologicalDating, AbsoluteDating::setDendrochronologicalDating),
            new OwnedRef<>("c14Dating", C14_DATING, AbsoluteDating::getC14Dating, AbsoluteDating::setC14Dating),
            new OwnedRef<>("otherDating", OTHER_DATING, AbsoluteDating::getOtherDating, AbsoluteDating::setOtherDating),
            new SharedSet<>("literature", LITERATURE, AbsoluteDating::getLiteratureList,
                    new Link("literature_absolute_dating_relation", "absolute_dating_id", "literature_id"))));

    private static final EntitySpec<DendrochronologicalDating> DENDROCHRONOLOGICAL_DATING_SPEC = new EntitySpec<>(DENDROCHRONOLOGICAL_DATING, DendrochronologicalDating.class, DendrochronologicalDating::getId, List.of(
            new SharedRef<>("laboratory", LABORATORY, DendrochronologicalDating::getLaboratory, DendrochronologicalDating::setLaboratory),
            str("number", DendrochronologicalDating::getNumber, DendrochronologicalDating::setNumber),
            str("dendrochronologicalAge", DendrochronologicalDating::getDendrochronologicalAge, DendrochronologicalDating::setDendrochronologicalAge),
            bool("waneyEdge", DendrochronologicalDating::getWaneyEdge, DendrochronologicalDating::setWaneyEdge)));

    private static final EntitySpec<C14Dating> C14_DATING_SPEC = new EntitySpec<>(C14_DATING, C14Dating.class, C14Dating::getId, List.of(
            new LookupRef<>("c14Laboratory", C14_LABORATORY, C14Dating::getC14Laboratory, C14Dating::setC14Laboratory),
            str("number", C14Dating::getNumber, C14Dating::setNumber),
            integer("c14AgeBp", C14Dating::getC14AgeBp, C14Dating::setC14AgeBp),
            integer("c14StdDev", C14Dating::getC14StdDev, C14Dating::setC14StdDev),
            str("c14CalibrationBcAd2s", C14Dating::getC14CalibrationBcAd2s, C14Dating::setC14CalibrationBcAd2s),
            dbl("deltaC13", C14Dating::getDeltaC13, C14Dating::setDeltaC13),
            dbl("deltaC13Uncertainty", C14Dating::getDeltaC13Uncertainty, C14Dating::setDeltaC13Uncertainty),
            dbl("pmc", C14Dating::getPmc, C14Dating::setPmc),
            dbl("pmcUncertainty", C14Dating::getPmcUncertainty, C14Dating::setPmcUncertainty)));

    private static final EntitySpec<OtherDating> OTHER_DATING_SPEC = new EntitySpec<>(OTHER_DATING, OtherDating.class, OtherDating::getId, List.of(
            new SharedRef<>("laboratory", LABORATORY, OtherDating::getLaboratory, OtherDating::setLaboratory),
            str("number", OtherDating::getNumber, OtherDating::setNumber),
            str("ageDivers", OtherDating::getAgeDivers, OtherDating::setAgeDivers)));

    private static final EntitySpec<Result> RESULT_SPEC = new EntitySpec<>(RESULT, Result.class, Result::getId, List.of(
            new Parent<>("sample", SAMPLE, Result::getSample, Result::setSample),
            // Flat columns of the result, grouped like the fraction analyzed they were taken from.
            new Embedded<Result, Result>("fraction", r -> r, null, null, List.of(
                    str("fractionAnalyzed", Result::getFractionAnalyzed, Result::setFractionAnalyzed),
                    str("orgOrMin", Result::getOrgOrMin, Result::setOrgOrMin),
                    dbl("sieveSize", Result::getSieveSize, Result::setSieveSize),
                    dbl("multiplier", Result::getMultiplier, Result::setMultiplier))),
            new Scalar<>("entryDate", ValueType.INSTANT, Result::getEntryDate, Result::setEntryDate),
            new LookupRef<>("stateOfPreservation", STATE_OF_PRESERVATION, Result::getStateOfPreservation, Result::setStateOfPreservation),
            new LookupRef<>("classificationConfer", CLASSIFICATION_CONFER, Result::getClassificationConfer, Result::setClassificationConfer),
            new LookupRef<>("taxCode", TAX_CODE, Result::getTaxCode, Result::setTaxCode),
            str("remarksTaxonomy", Result::getRemarksTaxonomy, Result::setRemarksTaxonomy),
            new LookupRef<>("restType", REST_TYPE, Result::getRestType, Result::setRestType),
            integer("restCount", Result::getRestCount, Result::setRestCount),
            integer("restFragment", Result::getRestFragment, Result::setRestFragment),
            dbl("restWeight", Result::getRestWeight, Result::setRestWeight),
            bool("estimation", Result::getEstimation, Result::setEstimation),
            new IdSet<>("absoluteDatingIds", ABSOLUTE_DATING,
                    new Link("result_absolute_dating_relation", "result_id", "absolute_dating_id"), true)));

    private static final Map<EntityType, EntitySpec<?>> SPECS = new EnumMap<>(EntityType.class);

    static {
        for (EntitySpec<?> spec : List.of(
                LICENSE_SPEC, TAXONOMY_SPEC, SITE_TYPE_SPEC, NATURAL_UNIT_SPEC, FEATURE_TYPE_SPEC,
                PRESERVATION_CONDITION_SPEC, SAMPLE_TYPE_SPEC, SAMPLE_INVESTIGATED_SPEC, CHRONOZONE_SPEC,
                MATERIAL_SPEC, DATING_METHOD_SPEC, C14_LABORATORY_SPEC, COORDINATE_SYSTEM_SPEC,
                STATE_OF_PRESERVATION_SPEC, CLASSIFICATION_CONFER_SPEC, TAX_CODE_SPEC, REST_TYPE_SPEC,
                INSTITUTION_SPEC, USER_SPEC, AUTHOR_SPEC, LITERATURE_SPEC, LABORATORY_SPEC,
                RESEARCH_PROJECT_SPEC, SITE_SPEC, FEATURE_SPEC, SAMPLE_SPEC, FRACTION_ANALYZED_SPEC,
                DENDROCHRONOLOGICAL_DATING_SPEC, C14_DATING_SPEC, OTHER_DATING_SPEC, ABSOLUTE_DATING_SPEC,
                RESULT_SPEC)) {
            SPECS.put(spec.type(), spec);
        }
        if (SPECS.size() != EntityType.values().length) {
            throw new IllegalStateException("ExchangeSchema: an EntityType has no spec");
        }
    }

    @SuppressWarnings("unchecked")
    public static <E> EntitySpec<E> spec(EntityType type) {
        return (EntitySpec<E>) SPECS.get(type);
    }

    // Builders ----------------------------------------------------------------------------------

    private static <L> EntitySpec<L> lookup(EntityType type, Class<L> entityClass, Function<L, String> id, List<Field<L>> fields) {
        return new EntitySpec<>(type, entityClass, id::apply, fields);
    }

    private static <E> Field<E> str(String name, Function<E, String> get, BiConsumer<E, String> set) {
        return new Scalar<>(name, ValueType.STRING, get, set);
    }

    private static <E> Field<E> bool(String name, Function<E, Boolean> get, BiConsumer<E, Boolean> set) {
        return new Scalar<>(name, ValueType.BOOLEAN, get, set);
    }

    private static <E> Field<E> integer(String name, Function<E, Integer> get, BiConsumer<E, Integer> set) {
        return new Scalar<>(name, ValueType.INTEGER, get, set);
    }

    private static <E> Field<E> dbl(String name, Function<E, Double> get, BiConsumer<E, Double> set) {
        return new Scalar<>(name, ValueType.DOUBLE, get, set);
    }
}
