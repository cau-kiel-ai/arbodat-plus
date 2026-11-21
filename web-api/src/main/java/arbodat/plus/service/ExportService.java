package arbodat.plus.service;

import arbodat.plus.exchange.EntitySpec;
import arbodat.plus.exchange.EntityType;
import arbodat.plus.exchange.ExchangeSchema;
import arbodat.plus.exchange.Field;
import arbodat.plus.exchange.Field.*;
import arbodat.plus.exchange.ValueType;
import arbodat.plus.model.*;
import arbodat.plus.repository.*;
import com.fasterxml.jackson.core.*;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.info.BuildProperties;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.OutputStream;
import java.time.Instant;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Writes the JSON export (format: {@link ExchangeSchema}):
 * <pre>
 * { "formatVersion": 1, "appVersion": "…", "exportedAt": "…", "scope": { "level": "…", "ids": [] },
 *   "researchProjects": [ …sites → features → samples → absoluteDatings, results ],
 *   "unassignedSites": [ sites without a research project, same shape ],
 *   "users": [], "institutions": [], "literature": [], "authors": [], "laboratories": [] }
 * </pre>
 * The five lists at the end hold the shared records nothing exported references; they are only
 * filled when exporting everything, so that such an export is a complete copy of the data.
 */
@Service
public class ExportService {

    private final ResearchProjectRepository researchProjectRepository;
    private final SiteRepository siteRepository;
    private final FeatureRepository featureRepository;
    private final SampleRepository sampleRepository;
    private final AbsoluteDatingRepository absoluteDatingRepository;
    private final ResultRepository resultRepository;
    private final UserRepository userRepository;
    private final InstitutionRepository institutionRepository;
    private final LiteratureRepository literatureRepository;
    private final AuthorRepository authorRepository;
    private final LaboratoryRepository laboratoryRepository;
    private final String appVersion;

    public ExportService(
        ResearchProjectRepository researchProjectRepository,
        SiteRepository siteRepository,
        FeatureRepository featureRepository,
        SampleRepository sampleRepository,
        AbsoluteDatingRepository absoluteDatingRepository,
        ResultRepository resultRepository,
        UserRepository userRepository,
        InstitutionRepository institutionRepository,
        LiteratureRepository literatureRepository,
        AuthorRepository authorRepository,
        LaboratoryRepository laboratoryRepository,
        ObjectProvider<BuildProperties> buildProperties
    ) {
        this.researchProjectRepository = researchProjectRepository;
        this.siteRepository = siteRepository;
        this.featureRepository = featureRepository;
        this.sampleRepository = sampleRepository;
        this.absoluteDatingRepository = absoluteDatingRepository;
        this.resultRepository = resultRepository;
        this.userRepository = userRepository;
        this.institutionRepository = institutionRepository;
        this.literatureRepository = literatureRepository;
        this.authorRepository = authorRepository;
        this.laboratoryRepository = laboratoryRepository;
        BuildProperties build = buildProperties.getIfAvailable();
        this.appVersion = build != null ? build.getVersion() : "unknown";
    }

    private record ExportScope(
            List<ResearchProject> researchProjects,
            Map<UUID, Set<UUID>> rpToSiteIds,
            Map<UUID, Site> sitesById,
            List<Site> unassignedSites,
            Map<UUID, List<Feature>> siteToFeatures,
            Map<UUID, List<Sample>> featureToSamples
    ) {}

    private ExportScope resolveScope(ExportFilter filter) {
        Set<UUID> rpIds, siteIds, featureIds, sampleIds;

        switch (filter.level()) {
            case NONE -> {
                rpIds = ids(researchProjectRepository.findAll(), ResearchProject::getId);
                // All sites, not only those reached through a research project.
                siteIds = ids(siteRepository.findAll(), Site::getId);
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
        Set<UUID> sitesUnderAnRp = new HashSet<>();
        for (Object[] pair : siteRepository.findRpIdPairsBySiteIdIn(siteIds)) {
            UUID siteId = (UUID) pair[0];
            UUID pairRpId = (UUID) pair[1];
            if (rpIds.contains(pairRpId)) {
                rpToSiteIds.computeIfAbsent(pairRpId, k -> new HashSet<>()).add(siteId);
                sitesUnderAnRp.add(siteId);
            }
        }

        Map<UUID, Site> sitesById = siteEntities.stream()
                .collect(Collectors.toMap(Site::getId, s -> s));

        // Sites in scope that no exported research project lists: those without any research project.
        List<Site> unassignedSites = siteEntities.stream()
                .filter(s -> !sitesUnderAnRp.contains(s.getId()))
                .toList();

        Map<UUID, List<Feature>> siteToFeatures = featureEntities.stream()
                .collect(Collectors.groupingBy(f -> f.getSite().getId()));

        Map<UUID, List<Sample>> featureToSamples = sampleEntities.stream()
                .collect(Collectors.groupingBy(s -> s.getFeature().getId()));

        return new ExportScope(researchProjects, rpToSiteIds, sitesById, unassignedSites, siteToFeatures, featureToSamples);
    }

    private <T> Set<UUID> ids(Collection<T> items, Function<T, UUID> extractor) {
        return items.stream().map(extractor).collect(Collectors.toSet());
    }

    @Transactional(readOnly = true)
    public void writeExport(OutputStream out, ExportFilter filter) throws IOException {
        ExportScope scope = resolveScope(filter);
        boolean everything = filter.level() == ExportFilter.Level.NONE;

        JsonFactory factory = new JsonFactory();
        try (JsonGenerator gen = factory.createGenerator(out, JsonEncoding.UTF8)) {
            Writer writer = new Writer(gen, scope);

            gen.writeStartObject();
            gen.writeNumberField("formatVersion", ExchangeSchema.FORMAT_VERSION);
            gen.writeStringField("appVersion", appVersion);
            gen.writeStringField("exportedAt", Instant.now().toString());
            gen.writeObjectFieldStart("scope");
            gen.writeStringField("level", filter.level().name());
            gen.writeArrayFieldStart("ids");
            for (UUID id : filter.ids()) gen.writeString(id.toString());
            gen.writeEndArray();
            gen.writeEndObject();

            gen.writeArrayFieldStart("researchProjects");
            for (ResearchProject rp : scope.researchProjects()) {
                writer.entity(ExchangeSchema.spec(EntityType.RESEARCH_PROJECT), rp);
            }
            gen.writeEndArray();

            gen.writeArrayFieldStart("unassignedSites");
            for (Site site : scope.unassignedSites()) {
                writer.entity(ExchangeSchema.spec(EntityType.SITE), site);
            }
            gen.writeEndArray();

            // In this order: writing users marks their institutions as seen, literature its authors.
            writer.unreferenced("users", EntityType.USER, everything ? userRepository.findAll() : List.of());
            writer.unreferenced("institutions", EntityType.INSTITUTION, everything ? institutionRepository.findAll() : List.of());
            writer.unreferenced("literature", EntityType.LITERATURE, everything ? literatureRepository.findAll() : List.of());
            writer.unreferenced("authors", EntityType.AUTHOR, everything ? authorRepository.findAll() : List.of());
            writer.unreferenced("laboratories", EntityType.LABORATORY, everything ? laboratoryRepository.findAll() : List.of());

            gen.writeEndObject();
        }
    }

    /** Writes entities field by field as {@link ExchangeSchema} declares them. */
    private final class Writer {

        private final JsonGenerator gen;
        private final ExportScope scope;
        private final Map<EntityType, Set<Object>> seen = new EnumMap<>(EntityType.class);

        // Loaded per feature (batch), not per sample -> no N+1
        private Map<UUID, List<Result>> resultsBySample = Map.of();
        private Map<UUID, List<AbsoluteDating>> absoluteDatingsBySample = Map.of();
        private Map<UUID, List<UUID>> absoluteDatingIdsByResultId = Map.of();

        Writer(JsonGenerator gen, ExportScope scope) {
            this.gen = gen;
            this.scope = scope;
        }

        <E> void entity(EntitySpec<E> spec, E entity) throws IOException {
            Object id = spec.id().apply(entity);
            if (spec.type().kind() == EntityType.Kind.SHARED) {
                seen.computeIfAbsent(spec.type(), t -> new HashSet<>()).add(id);
            }
            gen.writeStartObject();
            gen.writeStringField("id", id.toString());
            fields(spec.fields(), entity);
            gen.writeEndObject();
        }

        /** The shared records of one type that nothing written so far referenced. */
        <E> void unreferenced(String name, EntityType type, List<E> all) throws IOException {
            EntitySpec<E> spec = ExchangeSchema.spec(type);
            Set<Object> written = seen.getOrDefault(type, Set.of());
            List<E> rest = all.stream().filter(e -> !written.contains(spec.id().apply(e))).toList();
            gen.writeArrayFieldStart(name);
            for (E entity : rest) entity(spec, entity);
            gen.writeEndArray();
        }

        @SuppressWarnings({"unchecked", "rawtypes"})
        private <E> void fields(List<Field<E>> fields, E entity) throws IOException {
            for (Field<E> field : fields) {
                if (field instanceof Scalar s) {
                    scalar(s.name(), s.type(), s.get().apply(entity));
                } else if (field instanceof LookupRef l) {
                    reference(l.name(), l.target(), l.get().apply(entity));
                } else if (field instanceof SharedRef r) {
                    reference(r.name(), r.target(), r.get().apply(entity));
                } else if (field instanceof OwnedRef o) {
                    reference(o.name(), o.target(), o.get().apply(entity));
                } else if (field instanceof LookupSet l) {
                    collection(l.name(), l.target(), (Collection<Object>) l.get().apply(entity));
                } else if (field instanceof SharedSet s) {
                    collection(s.name(), s.target(), (Collection<Object>) s.get().apply(entity));
                } else if (field instanceof ValueList v) {
                    gen.writeArrayFieldStart(v.name());
                    Collection<Object> values = (Collection<Object>) v.get().apply(entity);
                    if (values != null) {
                        for (Object value : values) v.type().write(gen, value);
                    }
                    gen.writeEndArray();
                } else if (field instanceof Embedded em) {
                    Object part = em.get().apply(entity);
                    if (part == null) {
                        gen.writeNullField(em.name());
                    } else {
                        gen.writeObjectFieldStart(em.name());
                        fields(em.fields(), part);
                        gen.writeEndObject();
                    }
                } else if (field instanceof IdSet ids) {
                    if (ids.written()) {
                        gen.writeArrayFieldStart(ids.name());
                        for (UUID id : linkedIds(ids, entity)) gen.writeString(id.toString());
                        gen.writeEndArray();
                    }
                } else if (field instanceof Children c) {
                    EntitySpec<Object> childSpec = ExchangeSchema.spec(c.target());
                    gen.writeArrayFieldStart(c.name());
                    for (Object child : children(c.target(), entity)) entity(childSpec, child);
                    gen.writeEndArray();
                }
                // Parent: implied by nesting, not written
            }
        }

        private <V> void scalar(String name, ValueType<V> type, V value) throws IOException {
            if (value == null) {
                gen.writeNullField(name);
            } else {
                gen.writeFieldName(name);
                type.write(gen, value);
            }
        }

        private void reference(String name, EntityType target, Object value) throws IOException {
            if (value == null) {
                gen.writeNullField(name);
            } else {
                gen.writeFieldName(name);
                entity(ExchangeSchema.spec(target), value);
            }
        }

        private void collection(String name, EntityType target, Collection<Object> values) throws IOException {
            EntitySpec<Object> spec = ExchangeSchema.spec(target);
            gen.writeArrayFieldStart(name);
            if (values != null) {
                for (Object value : values) entity(spec, value);
            }
            gen.writeEndArray();
        }

        private List<UUID> linkedIds(IdSet<?> ids, Object entity) {
            if (ids.target() == EntityType.ABSOLUTE_DATING && entity instanceof Result result) {
                return absoluteDatingIdsByResultId.getOrDefault(result.getId(), List.of());
            }
            throw new IllegalStateException("No export source for " + ids.name());
        }

        private Collection<?> children(EntityType type, Object parent) {
            switch (type) {
                case SITE -> {
                    UUID rpId = ((ResearchProject) parent).getId();
                    return scope.rpToSiteIds().getOrDefault(rpId, Set.of()).stream()
                            .map(scope.sitesById()::get)
                            .filter(Objects::nonNull)
                            .toList();
                }
                case FEATURE -> {
                    return scope.siteToFeatures().getOrDefault(((Site) parent).getId(), List.of());
                }
                case SAMPLE -> {
                    Feature feature = (Feature) parent;
                    List<Sample> samples = scope.featureToSamples().getOrDefault(feature.getId(), List.of());
                    loadFeatureBatch(feature, samples);
                    return samples;
                }
                case FRACTION_ANALYZED -> {
                    Set<FractionAnalyzed> fractions = ((Sample) parent).getFractionAnalyzedList();
                    return fractions == null ? List.of() : fractions;
                }
                case ABSOLUTE_DATING -> {
                    return absoluteDatingsBySample.getOrDefault(((Sample) parent).getId(), List.of());
                }
                case RESULT -> {
                    return resultsBySample.getOrDefault(((Sample) parent).getId(), List.of());
                }
                default -> throw new IllegalStateException("No export source for children of type " + type);
            }
        }

        private void loadFeatureBatch(Feature feature, List<Sample> samples) {
            resultsBySample = resultRepository.findBySampleFeatureId(feature.getId())
                    .stream().collect(Collectors.groupingBy(r -> r.getSample().getId()));

            absoluteDatingsBySample = absoluteDatingRepository.findBySampleFeatureId(feature.getId())
                    .stream().collect(Collectors.groupingBy(ad -> ad.getSample().getId()));

            Map<UUID, List<UUID>> idsByResult = new HashMap<>();
            for (Object[] pair : resultRepository.findAbsoluteDatingIdPairsBySampleIdIn(ids(samples, Sample::getId))) {
                UUID resultId = (UUID) pair[0];
                UUID absoluteDatingId = (UUID) pair[1];
                idsByResult.computeIfAbsent(resultId, k -> new ArrayList<>()).add(absoluteDatingId);
            }
            absoluteDatingIdsByResultId = idsByResult;
        }
    }
}
