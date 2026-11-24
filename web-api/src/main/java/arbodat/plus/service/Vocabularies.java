package arbodat.plus.service;

import arbodat.plus.model.*;

import java.util.Map;
import java.util.function.Function;

/**
 * The local vocabulary tables cache the DANTE terms in use: a term the frontend loaded from DANTE is created on
 * its first use. Before a term is created, its URI must belong to the DANTE vocabulary of its table (e.g.
 * http://uri.gbv.de/terminology/arbodat_feature_type/...) or be a local ArboDat+ term of it
 * (e.g. ArboDat+_featureType_notChosen), checked by VocabularyTermListener on every way a term is created.
 * Licenses come from many namespaces and aren't checked.
 */
public final class Vocabularies {

    private static final String DANTE = "http://uri.gbv.de/terminology/";

    private record Namespace(String vocabulary, String dantePrefix, String localPrefix, Function<Object, String> id) {

        boolean contains(String uri) {
            return uri != null && (uri.startsWith(dantePrefix) || (localPrefix != null && uri.startsWith(localPrefix)));
        }
    }

    @SuppressWarnings("unchecked")
    private static <T> Namespace namespace(String vocabulary, String localPrefix, Function<T, String> id) {
        return new Namespace(vocabulary, DANTE + vocabulary + "/", localPrefix, value -> id.apply((T) value));
    }

    private static final Map<Class<?>, Namespace> NAMESPACES = Map.ofEntries(
            Map.entry(SiteType.class, namespace("arbodat_site_type", "ArboDat+_siteType_", SiteType::getId)),
            Map.entry(NaturalUnit.class, namespace("arbodat_natural_unit", "ArboDat+_naturalUnit_", NaturalUnit::getId)),
            Map.entry(FeatureType.class, namespace("arbodat_feature_type", "ArboDat+_featureType_", FeatureType::getId)),
            Map.entry(PreservationCondition.class, namespace("arbodat_preservation_condition", null, PreservationCondition::getId)),
            Map.entry(SampleType.class, namespace("arbodat_sample_type", "ArboDat+_sampleType_", SampleType::getId)),
            Map.entry(Chronozone.class, namespace("arbodat_chronozone", "ArboDat+_chronozone_", Chronozone::getId)),
            Map.entry(SampleInvestigated.class, namespace("arbodat_sample_investigated", "ArboDat+_sampleInvestigated_", SampleInvestigated::getId)),
            Map.entry(Material.class, namespace("arbodat_dated_material", null, Material::getId)),
            Map.entry(DatingMethod.class, namespace("arbodat_dating_method", "ArboDat+_datingMethod_", DatingMethod::getId)),
            Map.entry(C14Laboratory.class, namespace("nihk_c14_laboratory", null, C14Laboratory::getId)),
            Map.entry(StateOfPreservation.class, namespace("arbodat_result_condition", "ArboDat+_stateOfPreservation_", StateOfPreservation::getId)),
            Map.entry(RestType.class, namespace("arbodat_rest_type", "ArboDat+_restType_", RestType::getId)),
            Map.entry(ClassificationConfer.class, namespace("arbodat_classification_confer", null, ClassificationConfer::getId)),
            Map.entry(Taxonomy.class, namespace("arbodat_taxonomy", null, Taxonomy::getId)),
            Map.entry(TaxCode.class, namespace("arbodat_taxonomy", null, TaxCode::getId)),
            Map.entry(CoordinateSystem.class, namespace("arbodat_coordinate_reference_system", null, CoordinateSystem::getId)));

    private Vocabularies() {}

    // The URI may be created as a term of the given vocabulary table (always true for unchecked ones, e.g. licenses)
    public static boolean isAllowed(Class<?> vocabulary, String uri) {
        Namespace namespace = NAMESPACES.get(vocabulary);
        return namespace == null || namespace.contains(uri);
    }

    // The term, if it may be created; refused otherwise (called by VocabularyTermListener before a term is created)
    public static <T> T checked(T term) {
        if (term == null) return null;
        Namespace namespace = NAMESPACES.get(term.getClass());
        if (namespace != null && !namespace.contains(namespace.id().apply(term))) {
            throw new UnknownVocabularyTermException("'" + namespace.id().apply(term) + "' is not a term of the DANTE vocabulary "
                    + namespace.vocabulary() + ".");
        }
        return term;
    }

    public static class UnknownVocabularyTermException extends RuntimeException {
        public UnknownVocabularyTermException(String message) {
            super(message);
        }
    }
}
