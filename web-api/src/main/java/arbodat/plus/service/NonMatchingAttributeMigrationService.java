package arbodat.plus.service;

import arbodat.plus.dto_migration.BulkDanteAttributeItem;
import arbodat.plus.dto_migration.BulkItemStatus;
import arbodat.plus.model.*;
import arbodat.plus.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.function.BiConsumer;
import java.util.function.Function;
import java.util.function.Supplier;
import java.util.stream.Collectors;

// Sets the DANTE values of non-matching attributes of the migration (non-matching attributes accordion) in bulk:
// the sites, features, samples, absolute datings and DANTE entries are loaded once per request instead of once per row,
// and a DANTE entry which is not stored yet is created once (parallel single requests could create it twice).
@Service
public class NonMatchingAttributeMigrationService {

    @Autowired SiteRepository siteRepository;
    @Autowired FeatureRepository featureRepository;
    @Autowired SampleRepository sampleRepository;
    @Autowired AbsoluteDatingRepository absoluteDatingRepository;

    @Autowired SiteTypeRepository siteTypeRepository;
    @Autowired NaturalUnitRepository naturalUnitRepository;
    @Autowired FeatureTypeRepository featureTypeRepository;
    @Autowired PreservationConditionRepository preservationConditionRepository;
    @Autowired SampleTypeRepository sampleTypeRepository;
    @Autowired ChronozoneRepository chronozoneRepository;
    @Autowired SampleInvestigatedRepository sampleInvestigatedRepository;
    @Autowired MaterialRepository materialRepository;
    @Autowired DatingMethodRepository datingMethodRepository;

    private static final Set<String> SITE_ATTRIBUTES    = Set.of("siteType", "naturalUnit");
    private static final Set<String> FEATURE_ATTRIBUTES = Set.of("featureType", "preservationCondition");
    private static final Set<String> SAMPLE_ATTRIBUTES  = Set.of("sampleType", "chronozone", "seedsAndFruits", "charcoalInvestigated", "woodSubfossile");
    private static final Set<String> DATING_ATTRIBUTES  = Set.of("material", "datingMethod");

    /**
     * Sets the DANTE value(s) of the given rows: site types are added to the site's site types,
     * the other attributes are replaced. Each item gets its own status: "updated", or "error"
     * (unknown attribute, unknown site / feature / sample / dating, no value).
     */
    @Transactional
    public List<BulkItemStatus> updateAll(List<BulkDanteAttributeItem> items) {

        Map<UUID, Site> sites = owners(items, SITE_ATTRIBUTES, siteRepository::findAllById, Site::getId);
        Map<UUID, Feature> features = owners(items, FEATURE_ATTRIBUTES, featureRepository::findAllById, Feature::getId);
        Map<UUID, Sample> samples = owners(items, SAMPLE_ATTRIBUTES, sampleRepository::findAllById, Sample::getId);
        Map<UUID, AbsoluteDating> datings = owners(items, DATING_ATTRIBUTES, absoluteDatingRepository::findAllById, AbsoluteDating::getId);

        // The DANTE entries of each vocabulary (seeds and fruits, charcoal investigated and wood subfossile share one)
        Map<String, Vocabulary<?>> vocabularies = vocabularies();
        Map<Vocabulary<?>, Map<String, Object>> entries = new IdentityHashMap<>();
        new HashSet<>(vocabularies.values()).forEach(vocabulary -> {
            List<BulkDanteAttributeItem.Value> values = items.stream()
                    .filter(item -> vocabularies.get(item.getAttribute()) == vocabulary && item.getValues() != null)
                    .flatMap(item -> item.getValues().stream())
                    .filter(value -> value != null && value.getId() != null && !value.getId().isBlank())
                    .toList();
            if (!values.isEmpty()) entries.put(vocabulary, vocabulary.resolve(values));
        });

        List<BulkItemStatus> statuses = new ArrayList<>();
        for (BulkDanteAttributeItem item : items) {
            String clientId = item.getClientId();
            String attribute = String.valueOf(item.getAttribute());
            Vocabulary<?> vocabulary = vocabularies.get(attribute);
            if (vocabulary == null) {
                statuses.add(BulkItemStatus.error(clientId, "invalid attribute: " + attribute));
                continue;
            }
            Map<String, Object> known = entries.getOrDefault(vocabulary, Map.of());
            Optional<String> unknown = (item.getValues() != null ? item.getValues() : List.<BulkDanteAttributeItem.Value>of()).stream()
                    .filter(value -> value != null && value.getId() != null && !value.getId().isBlank() && !known.containsKey(value.getId()))
                    .map(BulkDanteAttributeItem.Value::getId)
                    .findFirst();
            if (unknown.isPresent()) {
                statuses.add(BulkItemStatus.error(clientId, "'" + unknown.get() + "' is not a term of the " + attribute + " vocabulary"));
                continue;
            }
            List<Object> chosen = (item.getValues() != null ? item.getValues() : List.<BulkDanteAttributeItem.Value>of()).stream()
                    .filter(value -> value != null && value.getId() != null)
                    .map(value -> known.get(value.getId()))
                    .filter(Objects::nonNull)
                    .distinct()
                    .toList();
            if (chosen.isEmpty()) {
                statuses.add(BulkItemStatus.error(clientId, "no " + attribute + " selected"));
                continue;
            }
            Object value = chosen.get(0);
            UUID id = item.getId();

            String error = null;
            if (SITE_ATTRIBUTES.contains(attribute)) {
                Site site = id != null ? sites.get(id) : null;
                if (site == null) error = "invalid site id";
                else if (attribute.equals("siteType")) {
                    if (site.getSiteTypeList() == null) site.setSiteTypeList(new HashSet<>());
                    chosen.forEach(siteType -> site.getSiteTypeList().add((SiteType) siteType));
                } else site.setNaturalUnit((NaturalUnit) value);
            } else if (FEATURE_ATTRIBUTES.contains(attribute)) {
                Feature feature = id != null ? features.get(id) : null;
                if (feature == null) error = "invalid feature id";
                else if (attribute.equals("featureType")) feature.setFeatureType((FeatureType) value);
                else feature.setPreservationCondition((PreservationCondition) value);
            } else if (SAMPLE_ATTRIBUTES.contains(attribute)) {
                Sample sample = id != null ? samples.get(id) : null;
                if (sample == null) error = "invalid sample id";
                else switch (attribute) {
                    case "sampleType"           -> sample.setSampleType((SampleType) value);
                    case "chronozone"           -> sample.setChronozone((Chronozone) value);
                    case "seedsAndFruits"       -> sample.setSeedsAndFruits((SampleInvestigated) value);
                    case "charcoalInvestigated" -> sample.setCharcoalInvestigated((SampleInvestigated) value);
                    default                     -> sample.setWoodSubfossile((SampleInvestigated) value);
                }
            } else {
                AbsoluteDating dating = id != null ? datings.get(id) : null;
                if (dating == null) error = "invalid absoluteDating id";
                else if (attribute.equals("material")) dating.setMaterial((Material) value);
                else dating.setDatingMethod((DatingMethod) value);
            }
            statuses.add(error == null ? BulkItemStatus.updated(clientId) : BulkItemStatus.error(clientId, error));
        }
        // The sites, features, samples and datings are saved with the transaction (managed entities)
        return statuses;
    }

    // Attribute -> its vocabulary
    private Map<String, Vocabulary<?>> vocabularies() {
        Vocabulary<SampleInvestigated> sampleInvestigated = new Vocabulary<>(SampleInvestigated.class, sampleInvestigatedRepository,
                SampleInvestigated::new, SampleInvestigated::getId, SampleInvestigated::setId, SampleInvestigated::setLabel);
        Map<String, Vocabulary<?>> vocabularies = new HashMap<>();
        vocabularies.put("siteType", new Vocabulary<>(SiteType.class, siteTypeRepository,
                SiteType::new, SiteType::getId, SiteType::setId, SiteType::setLabel));
        vocabularies.put("naturalUnit", new Vocabulary<>(NaturalUnit.class, naturalUnitRepository,
                NaturalUnit::new, NaturalUnit::getId, NaturalUnit::setId, NaturalUnit::setLabel));
        vocabularies.put("featureType", new Vocabulary<>(FeatureType.class, featureTypeRepository,
                FeatureType::new, FeatureType::getId, FeatureType::setId, FeatureType::setLabel));
        vocabularies.put("preservationCondition", new Vocabulary<>(PreservationCondition.class, preservationConditionRepository,
                PreservationCondition::new, PreservationCondition::getId, PreservationCondition::setId, PreservationCondition::setLabel));
        vocabularies.put("sampleType", new Vocabulary<>(SampleType.class, sampleTypeRepository,
                SampleType::new, SampleType::getId, SampleType::setId, SampleType::setLabel));
        vocabularies.put("chronozone", new Vocabulary<>(Chronozone.class, chronozoneRepository,
                Chronozone::new, Chronozone::getId, Chronozone::setId, Chronozone::setLabel));
        vocabularies.put("seedsAndFruits", sampleInvestigated);
        vocabularies.put("charcoalInvestigated", sampleInvestigated);
        vocabularies.put("woodSubfossile", sampleInvestigated);
        vocabularies.put("material", new Vocabulary<>(Material.class, materialRepository,
                Material::new, Material::getId, Material::setId, Material::setLabel));
        vocabularies.put("datingMethod", new Vocabulary<>(DatingMethod.class, datingMethodRepository,
                DatingMethod::new, DatingMethod::getId, DatingMethod::setId, DatingMethod::setLabel));
        return vocabularies;
    }

    // A vocabulary of DANTE entries (id = uri)
    private record Vocabulary<V>(Class<V> type, JpaRepository<V, String> repository, Supplier<V> constructor, Function<V, String> getId,
                                 BiConsumer<V, String> setId, BiConsumer<V, String> setLabel) {

        // uri -> entry: the stored ones; the missing ones are created (with the label of the first value),
        // if they are terms of their DANTE vocabulary (Vocabularies; the others stay unknown, their rows fail)
        Map<String, Object> resolve(List<BulkDanteAttributeItem.Value> values) {
            Map<String, String> labels = new LinkedHashMap<>();
            values.forEach(value -> labels.putIfAbsent(value.getId(), value.getLabel()));

            Map<String, Object> entries = new HashMap<>();
            repository.findAllById(labels.keySet()).forEach(entry -> entries.put(getId.apply(entry), entry));

            List<V> missing = labels.entrySet().stream()
                    .filter(entry -> !entries.containsKey(entry.getKey()) && Vocabularies.isAllowed(type, entry.getKey()))
                    .map(entry -> {
                        V created = constructor.get();
                        setId.accept(created, entry.getKey());
                        setLabel.accept(created, entry.getValue());
                        return created;
                    })
                    .toList();
            repository.saveAll(missing).forEach(entry -> entries.put(getId.apply(entry), entry));
            return entries;
        }
    }

    private static <T> Map<UUID, T> owners(List<BulkDanteAttributeItem> items, Set<String> attributes,
                                           Function<Set<UUID>, List<T>> findAllById, Function<T, UUID> getId) {
        Set<UUID> ids = items.stream()
                .filter(item -> attributes.contains(item.getAttribute()) && item.getId() != null)
                .map(BulkDanteAttributeItem::getId)
                .collect(Collectors.toSet());
        return findAllById.apply(ids).stream().collect(Collectors.toMap(getId, Function.identity()));
    }
}
