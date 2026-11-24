package arbodat.plus.dataimport;

import arbodat.plus.dataimport.Resolution.Action;
import arbodat.plus.dataimport.Resolution.MatchedBy;
import arbodat.plus.exchange.EntitySpec;
import arbodat.plus.exchange.EntityType;
import arbodat.plus.exchange.ExchangeSchema;
import arbodat.plus.exchange.Field;
import arbodat.plus.exchange.Field.*;
import arbodat.plus.exchange.ValueType;
import arbodat.plus.model.*;
import arbodat.plus.service.ExcavationYears;
import arbodat.plus.service.Vocabularies;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.Normalizer;
import java.util.*;
import java.util.function.Function;

import static arbodat.plus.exchange.EntityType.*;

/**
 * Works out what an import would do, without writing anything.
 *
 * <p>Matching, type by type, parents before children:
 * <ol>
 *   <li>Same id: always the same record (also when its label or parent changed).</li>
 *   <li>Otherwise a natural key, as the legacy Access migration matches: a research project by
 *       name (ignoring case), a site by label among the sites of its (matched) research projects, a feature by label
 *       within its site, a sample by label within its feature, an absolute dating by sub-sample (labels
 *       and sub-samples ignoring case, as the keys of ArboDat 2018), a
 *       result by taxon + fraction + cf + rest type + state of preservation. People, institutions,
 *       literature and labs: ORCID / ROR / DOI first, then the exact name (ignoring case and spacing).</li>
 *   <li>Several candidates, or two imported records wanting the same one: the user chooses.</li>
 *   <li>Nothing found: created, keeping the imported id.</li>
 * </ol>
 * Records created by the import are never candidates: two imported sites with the same label were
 * two sites where they came from, and stay two. (People, institutions, literature and labs are the
 * exception: imported duplicates of one of them all merge into it.)
 *
 * <p>Then every matched record is compared field by field: an empty field is filled, a different
 * value is a conflict for the user; links and value lists only ever grow.
 */
@Component
class ImportPlanner {

    private static final int CHUNK = 1000;
    private static final String SEP = "\u001f";
    private static final String NONE = "∅";

    @PersistenceContext
    private EntityManager em;
    private final NamedParameterJdbcTemplate jdbc;

    ImportPlanner(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    ImportPlan plan(ImportGraph graph, Decisions decisions) {
        Run run = new Run(new ImportPlan(graph), decisions == null ? Decisions.none() : decisions);
        run.match();
        run.diff();
        run.plan.fingerprint = fingerprint(run.plan);
        return run.plan;
    }

    /** One planning run. */
    private final class Run {

        final ImportPlan plan;
        final ImportGraph graph;
        final Decisions decisions;

        Run(ImportPlan plan, Decisions decisions) {
            this.plan = plan;
            this.graph = plan.graph;
            this.decisions = decisions;
        }

        // Matching ------------------------------------------------------------------------------

        void match() {
            for (EntityType type : EntityType.values()) {
                if (type.isLookup()) lookups(type);
            }
            byKeys(INSTITUTION, List.of(
                    strongKey(e -> ror(((Institution) e).getRorId()), r -> ror(r.string("rorId"))),
                    nameKey(e -> name(((Institution) e).getLabel()), r -> name(r.string("label")))));
            byKeys(USER, List.of(
                    strongKey(e -> orcid(((User) e).getOrcid()), r -> orcid(r.string("orcid"))),
                    nameKey(e -> person(((User) e).getLastName(), ((User) e).getFirstName(), ((User) e).getMiddleName()),
                            r -> person(r.string("lastName"), r.string("firstName"), r.string("middleName")))));
            byKeys(AUTHOR, List.of(
                    nameKey(e -> person(((Author) e).getLastName(), ((Author) e).getFirstName(), ((Author) e).getMiddleName()),
                            r -> person(r.string("lastName"), r.string("firstName"), r.string("middleName")))));
            byKeys(LITERATURE, List.of(
                    strongKey(e -> doi(((Literature) e).getDoi()), r -> doi(r.string("doi"))),
                    nameKey(e -> name(((Literature) e).getTitle()) == null ? null : key(name(((Literature) e).getTitle()), ((Literature) e).getPublicationYear()),
                            r -> name(r.string("title")) == null ? null : key(name(r.string("title")), r.values.get("publicationYear")))));
            byKeys(LABORATORY, List.of(
                    nameKey(e -> name(((Laboratory) e).getLabel()), r -> name(r.string("label")))));
            byKeys(RESEARCH_PROJECT, List.of(
                    nameKey(e -> labelKey(((ResearchProject) e).getProjectName()), r -> labelKey(r.string("projectName")))));
            sites();
            underParent(FEATURE, SITE, "site",
                    e -> idOf(((Feature) e).getSite()), e -> labelKey(((Feature) e).getLabel()), r -> labelKey(r.string("label")));
            underParent(SAMPLE, FEATURE, "feature",
                    e -> idOf(((Sample) e).getFeature()), e -> labelKey(((Sample) e).getLabel()), r -> labelKey(r.string("label")));
            underParent(FRACTION_ANALYZED, SAMPLE, "sample",
                    e -> idOf(((FractionAnalyzed) e).getSample()),
                    e -> {
                        FractionAnalyzed f = (FractionAnalyzed) e;
                        return key(f.getFractionAnalyzed(), f.getOrgOrMin(), f.getSieveSize());
                    },
                    r -> key(r.values.get("fractionAnalyzed"), r.values.get("orgOrMin"), r.values.get("sieveSize")));
            underParent(ABSOLUTE_DATING, SAMPLE, "sample",
                    e -> idOf(((AbsoluteDating) e).getSample()), e -> labelKey(((AbsoluteDating) e).getSubSample()),
                    r -> labelKey(r.string("subSample")));
            datings(DENDROCHRONOLOGICAL_DATING, "dendrochronologicalDating", AbsoluteDating::getDendrochronologicalDating);
            datings(C14_DATING, "c14Dating", AbsoluteDating::getC14Dating);
            datings(OTHER_DATING, "otherDating", AbsoluteDating::getOtherDating);
            underParent(RESULT, SAMPLE, "sample",
                    e -> idOf(((Result) e).getSample()),
                    e -> {
                        Result r = (Result) e;
                        return resultKey(idOf(r.getTaxCode()), r.getOrgOrMin(), r.getSieveSize(), idOf(r.getClassificationConfer()),
                                idOf(r.getRestType()), idOf(r.getStateOfPreservation()));
                    },
                    r -> resultKey(r.values.get("taxCode"), r.values.get("fraction.orgOrMin"), r.values.get("fraction.sieveSize"),
                            r.values.get("classificationConfer"), r.values.get("restType"), r.values.get("stateOfPreservation")));
        }

        /**
         * Vocabulary values: the URI is the identity. Unknown ones are created (if their URI belongs to the
         * vocabulary, else the import is blocked), known ones keep their labels.
         */
        void lookups(EntityType type) {
            Collection<ImportRecord> records = graph.of(type);
            if (records.isEmpty()) return;
            EntitySpec<Object> spec = ExchangeSchema.spec(type);
            Map<Object, Object> existing = remember(type, load(spec, ids(records)));
            for (ImportRecord record : records) {
                Object local = existing.get(record.id);
                if (local == null) {
                    // Created only as a term of its DANTE vocabulary (or a local ArboDat+ term of it)
                    if (!Vocabularies.isAllowed(spec.entityClass(), String.valueOf(record.id))) {
                        plan.errors.add(new Issue("UNKNOWN_VOCABULARY_TERM", record.key(), record.path,
                                "'" + record.id + "' is not a term of the vocabulary for " + type + "."));
                    }
                    plan.resolve(record, Resolution.create(record.id));
                    continue;
                }
                plan.resolve(record, Resolution.match(record.id, MatchedBy.ID));
                for (Field<Object> field : spec.fields()) {
                    if (field instanceof Scalar<Object, ?> scalar) {
                        Object imported = record.values.get(field.name());
                        Object current = scalar.get().apply(local);
                        if (imported != null && current != null && !imported.equals(current)) {
                            plan.lookupDiffs.add(new ImportPlan.LookupDiff(type, (String) record.id, field.name(), current, imported));
                        }
                    }
                }
            }
        }

        private record KeyLevel(Function<Object, String> local, Function<ImportRecord, String> imported, boolean strong) {}

        private KeyLevel strongKey(Function<Object, String> local, Function<ImportRecord, String> imported) {
            return new KeyLevel(local, imported, true);
        }

        private KeyLevel nameKey(Function<Object, String> local, Function<ImportRecord, String> imported) {
            return new KeyLevel(local, imported, false);
        }

        /**
         * Small tables matched against all existing rows: id, then each key level in turn. A name
         * never matches a record whose strong id (ORCID, ROR, DOI) differs from the imported one.
         */
        void byKeys(EntityType type, List<KeyLevel> levels) {
            Collection<ImportRecord> records = graph.of(type);
            if (records.isEmpty()) return;
            EntitySpec<Object> spec = ExchangeSchema.spec(type);
            List<Object> all = em.createQuery("select e from " + spec.entityClass().getSimpleName() + " e", Object.class).getResultList();
            Map<Object, Object> byId = remember(type, all);
            Set<Object> claimedById = claimedById(records, byId);

            List<Map<String, List<Object>>> indexes = new ArrayList<>();
            for (KeyLevel level : levels) {
                Map<String, List<Object>> index = new HashMap<>();
                for (Object e : all) {
                    String k = level.local().apply(e);
                    if (k != null) index.computeIfAbsent(k, x -> new ArrayList<>()).add(spec.id().apply(e));
                }
                indexes.add(index);
            }
            KeyLevel strongLevel = levels.stream().filter(KeyLevel::strong).findFirst().orElse(null);

            for (ImportRecord record : records) {
                if (byId.containsKey(record.id)) {
                    plan.resolve(record, Resolution.match(record.id, MatchedBy.ID));
                    continue;
                }
                String importedStrong = strongLevel == null ? null : strongLevel.imported().apply(record);
                List<Object> candidates = List.of();
                for (int i = 0; i < levels.size(); i++) {
                    KeyLevel level = levels.get(i);
                    String k = level.imported().apply(record);
                    if (k == null) continue;
                    List<Object> found = new ArrayList<>(indexes.get(i).getOrDefault(k, List.of()));
                    found.removeAll(claimedById);
                    if (!level.strong() && importedStrong != null) {
                        found.removeIf(id -> {
                            String localStrong = strongLevel.local().apply(byId.get(id));
                            return localStrong != null && !localStrong.equals(importedStrong);
                        });
                    }
                    if (!found.isEmpty()) {
                        candidates = found;
                        break;
                    }
                }
                decide(record, candidates);
            }
            checkClaims(type);
        }

        /**
         * A site by label among the sites of the research projects it is listed under (those
         * matched to existing ones); a site without research project among the existing ones without.
         */
        void sites() {
            Collection<ImportRecord> records = graph.of(SITE);
            if (records.isEmpty()) return;
            EntitySpec<Object> spec = ExchangeSchema.spec(SITE);
            Map<Object, Object> byId = remember(SITE, load(spec, ids(records)));
            Set<Object> claimedById = claimedById(records, byId);

            Set<Object> rpTargets = new HashSet<>();
            boolean anyUnassigned = false;
            for (ImportRecord record : records) {
                Set<Object> rps = record.setOrEmpty("researchProjects");
                if (rps.isEmpty()) anyUnassigned = true;
                for (Object rp : rps) {
                    Resolution r = plan.resolution(RESEARCH_PROJECT, rp);
                    if (r != null && r.action == Action.MATCH) rpTargets.add(r.targetId);
                }
            }
            Map<String, List<Object>> index = new HashMap<>();
            Map<Object, Set<Object>> sitesOfRp = new HashMap<>();
            for (List<Object> chunk : chunks(rpTargets)) {
                jdbc.query("SELECT site_id, research_project_id FROM site_research_project_relation WHERE research_project_id IN (:ids)",
                        Map.of("ids", chunk), rs -> {
                            sitesOfRp.computeIfAbsent(rs.getObject(2), k -> new HashSet<>()).add(rs.getObject(1));
                        });
            }
            Map<Object, Object> local = remember(SITE, load(spec, sitesOfRp.values().stream().flatMap(Set::stream).toList()));
            sitesOfRp.forEach((rp, siteIds) -> {
                for (Object siteId : siteIds) {
                    String k = labelKey(((Site) local.get(siteId)).getLabel());
                    if (k != null) index.computeIfAbsent(rp + SEP + k, x -> new ArrayList<>()).add(siteId);
                }
            });
            if (anyUnassigned) {
                List<Object> unassigned = em.createQuery("select s from Site s where s.researchProjectList is empty", Object.class).getResultList();
                remember(SITE, unassigned);
                for (Object s : unassigned) {
                    String k = labelKey(((Site) s).getLabel());
                    if (k != null) index.computeIfAbsent(NONE + SEP + k, x -> new ArrayList<>()).add(((Site) s).getId());
                }
            }

            for (ImportRecord record : records) {
                if (byId.containsKey(record.id)) {
                    plan.resolve(record, Resolution.match(record.id, MatchedBy.ID));
                    continue;
                }
                String k = labelKey(record.string("label"));
                Set<Object> rps = record.setOrEmpty("researchProjects");
                Set<Object> candidates = new LinkedHashSet<>();
                if (rps.isEmpty()) {
                    if (k != null) candidates.addAll(index.getOrDefault(NONE + SEP + k, List.of()));
                } else {
                    boolean anyMatched = false, anyUnresolved = false;
                    for (Object rp : rps) {
                        Resolution r = plan.resolution(RESEARCH_PROJECT, rp);
                        if (r == null || !r.resolved()) {
                            anyUnresolved = true;
                        } else if (r.action == Action.MATCH) {
                            anyMatched = true;
                            if (k != null) candidates.addAll(index.getOrDefault(r.targetId + SEP + k, List.of()));
                        }
                    }
                    if (!anyMatched && anyUnresolved) {
                        plan.resolve(record, Resolution.pending());
                        continue;
                    }
                }
                candidates.removeAll(claimedById);
                decide(record, new ArrayList<>(candidates));
            }
            checkClaims(SITE);
        }

        /** A child by its key among the existing children of its (matched) parent. */
        void underParent(EntityType type, EntityType parentType, String parentAttribute,
                         Function<Object, Object> localParent, Function<Object, String> localKey,
                         Function<ImportRecord, String> importedKey) {
            Collection<ImportRecord> records = graph.of(type);
            if (records.isEmpty()) return;
            EntitySpec<Object> spec = ExchangeSchema.spec(type);
            Map<Object, Object> byId = remember(type, load(spec, ids(records)));
            Set<Object> claimedById = claimedById(records, byId);

            Set<Object> parentTargets = new HashSet<>();
            for (ImportRecord record : records) {
                Resolution p = record.parentId == null ? null : plan.resolution(parentType, record.parentId);
                if (p != null && p.action == Action.MATCH) parentTargets.add(p.targetId);
            }
            Map<String, List<Object>> index = new HashMap<>();
            for (List<Object> chunk : chunks(parentTargets)) {
                List<Object> children = em.createQuery("select e from " + spec.entityClass().getSimpleName()
                        + " e where e." + parentAttribute + ".id in :ids", Object.class).setParameter("ids", chunk).getResultList();
                remember(type, children);
                for (Object e : children) {
                    String k = localKey.apply(e);
                    if (k != null) index.computeIfAbsent(localParent.apply(e) + SEP + k, x -> new ArrayList<>()).add(spec.id().apply(e));
                }
            }

            for (ImportRecord record : records) {
                if (byId.containsKey(record.id)) {
                    plan.resolve(record, Resolution.match(record.id, MatchedBy.ID));
                    continue;
                }
                Resolution parent = record.parentId == null ? null : plan.resolution(parentType, record.parentId);
                if (parent == null) {
                    plan.resolve(record, Resolution.create(record.id));
                } else if (!parent.resolved()) {
                    plan.resolve(record, Resolution.pending());
                } else if (parent.action == Action.CREATE) {
                    plan.resolve(record, Resolution.create(record.id));
                } else {
                    String k = importedKey.apply(record);
                    List<Object> candidates = new ArrayList<>(k == null ? List.of() : index.getOrDefault(parent.targetId + SEP + k, List.of()));
                    candidates.removeAll(claimedById);
                    decide(record, candidates);
                }
            }
            checkClaims(type);
        }

        /**
         * A dating (C14, dendro, other) is identified by its id, else by its laboratory + number
         * (unique), else it is the one the matched absolute dating already has (one of each kind at
         * most), else new. A dating that belongs to another absolute dating here stays with it: an
         * absolute dating can't share it, and the import doesn't move it.
         */
        void datings(EntityType type, String adField, Function<AbsoluteDating, Object> datingOf) {
            Collection<ImportRecord> records = graph.of(type);
            if (records.isEmpty()) return;
            EntitySpec<Object> spec = ExchangeSchema.spec(type);
            Map<Object, Object> byId = remember(type, load(spec, ids(records)));

            // Existing datings with the imported laboratory numbers
            Map<String, Object> byLabNumber = new HashMap<>();
            Set<String> numbers = new HashSet<>();
            for (ImportRecord record : records) {
                String number = label(record.string("number"));
                if (number != null) numbers.add(number);
            }
            for (List<Object> chunk : chunks(numbers)) {
                List<Object> found = em.createQuery("select d from " + spec.entityClass().getSimpleName() + " d where trim(d.number) in :numbers",
                        Object.class).setParameter("numbers", chunk).getResultList();
                remember(type, found);
                for (Object dating : found) {
                    String k = labNumber(localLab(type, dating), localNumber(type, dating));
                    if (k != null) byLabNumber.put(k, spec.id().apply(dating));
                }
            }

            Map<Object, Object> ownerOf = new HashMap<>();
            Set<Object> loaded = new HashSet<>(byId.keySet());
            loaded.addAll(byLabNumber.values());
            for (List<Object> chunk : chunks(loaded)) {
                for (Object[] row : em.createQuery("select a.id, a." + adField + ".id from AbsoluteDating a where a." + adField
                        + ".id in :ids", Object[].class).setParameter("ids", chunk).getResultList()) {
                    ownerOf.put(row[1], row[0]);
                }
            }

            // First pass: by id, then by laboratory number
            Map<Object, ImportRecord> claimedBy = new HashMap<>();
            Map<ImportRecord, Object> identified = new LinkedHashMap<>();
            Map<ImportRecord, MatchedBy> identifiedBy = new HashMap<>();
            for (ImportRecord record : records) {
                Object target = byId.containsKey(record.id) ? record.id : null;
                MatchedBy by = MatchedBy.ID;
                if (target == null) {
                    target = byLabNumber.get(labNumber(importedLab(type, record), label(record.string("number"))));
                    by = MatchedBy.KEY;
                }
                if (target == null) continue;
                ImportRecord other = claimedBy.putIfAbsent(target, record);
                if (other != null) {
                    plan.errors.add(new Issue("LAB_NUMBER_TWICE", record.key(), record.path, sameNumberMessage(other, record)));
                    continue;
                }
                identified.put(record, target);
                identifiedBy.put(record, by);
            }

            Map<String, ImportRecord> newNumbers = new HashMap<>();
            for (ImportRecord record : records) {
                Resolution ad = record.parentId == null ? null : plan.resolution(ABSOLUTE_DATING, record.parentId);
                boolean adResolved = ad != null && ad.resolved();
                Object target = identified.get(record);
                if (target != null) {
                    Object owner = ownerOf.get(target);
                    if (owner != null && !(adResolved && owner.equals(ad.targetId))) {
                        if (record.parentId != null && !adResolved) {
                            plan.resolve(record, Resolution.pending());
                            continue;
                        }
                        // Same dating, other absolute dating: it stays there.
                        plan.keptWithOwner.add(record.id);
                        plan.warnings.add(new Issue("DATING_ELSEWHERE", record.key(), record.path,
                                "The " + Labels.record(graph, record) + " dating of " + parentPath(record) + " belongs to absolute dating "
                                        + Labels.entityPath(ABSOLUTE_DATING, plan.entity(ABSOLUTE_DATING, owner) != null
                                        ? plan.entity(ABSOLUTE_DATING, owner) : em.find(AbsoluteDating.class, owner))
                                        + " here (same " + (identifiedBy.get(record) == MatchedBy.ID ? "id" : "laboratory number")
                                        + "). It stays there; the import doesn't add it to " + parentPath(record) + "."));
                    }
                    plan.resolve(record, Resolution.match(target, identifiedBy.get(record)));
                    continue;
                }
                if (plan.errors.stream().anyMatch(e -> record.key().equals(e.recordKey()))) {
                    plan.resolve(record, Resolution.pending()); // a second record with a laboratory number already claimed
                    continue;
                }
                if (record.parentId != null && !adResolved) {
                    plan.resolve(record, Resolution.pending());
                    continue;
                }
                if (ad != null && ad.action == Action.MATCH) {
                    AbsoluteDating local = (AbsoluteDating) plan.entity(ABSOLUTE_DATING, ad.targetId);
                    Object dating = local == null ? null : datingOf.apply(local);
                    if (dating != null && !claimedBy.containsKey(spec.id().apply(dating))) {
                        Object datingId = spec.id().apply(dating);
                        claimedBy.put(datingId, record);
                        plan.remember(type, datingId, dating);
                        plan.resolve(record, Resolution.match(datingId, MatchedBy.KEY));
                        continue;
                    }
                }
                String k = labNumber(importedLab(type, record), label(record.string("number")));
                ImportRecord other = k == null ? null : newNumbers.putIfAbsent(k, record);
                if (other != null) {
                    plan.errors.add(new Issue("LAB_NUMBER_TWICE", record.key(), record.path, sameNumberMessage(other, record)));
                    plan.resolve(record, Resolution.pending());
                    continue;
                }
                plan.resolve(record, Resolution.create(record.id));
            }
        }

        /** The laboratory of an imported dating as it is (or will be) here: a URI, or a laboratory's id. */
        private Object importedLab(EntityType type, ImportRecord record) {
            Object lab = record.values.get(type == C14_DATING ? "c14Laboratory" : "laboratory");
            return lab == null || type == C14_DATING ? lab : plan.target(LABORATORY, lab);
        }

        private String parentPath(ImportRecord record) {
            ImportRecord ad = record.parentId == null ? null : graph.get(ABSOLUTE_DATING, record.parentId);
            return ad == null ? "(no absolute dating)" : Labels.recordPath(graph, ad);
        }

        private String sameNumberMessage(ImportRecord first, ImportRecord second) {
            return "The file has two datings with laboratory number " + Labels.record(graph, second) + " of the same laboratory ("
                    + parentPath(first) + " and " + parentPath(second) + "), but a laboratory number belongs to one dating only."
                    + " Please correct this where the file comes from and export again.";
        }

        /** Applies the user's choice, if any, else: no candidate → create, one → match, more → ask. */
        private void decide(ImportRecord record, List<Object> found) {
            List<Object> candidates = new ArrayList<>(found);
            candidates.sort(Comparator.comparing(Object::toString));
            String choice = decisions.match(record.key());
            if (choice != null) {
                if (Decisions.NEW.equals(choice)) {
                    plan.resolve(record, Resolution.create(record.id).withCandidates(candidates));
                    return;
                }
                Optional<Object> chosen = candidates.stream().filter(c -> c.toString().equals(choice)).findFirst();
                if (chosen.isPresent()) {
                    plan.resolve(record, Resolution.match(chosen.get(), MatchedBy.CHOICE).withCandidates(candidates));
                    return;
                }
                plan.warnings.add(new Issue("CHOICE_IGNORED", record.key(), record.path,
                        "The record chosen for " + Labels.record(graph, record) + " is no longer a candidate; the choice was ignored."));
            }
            if (candidates.isEmpty()) {
                plan.resolve(record, Resolution.create(record.id));
            } else if (candidates.size() == 1) {
                plan.resolve(record, Resolution.match(candidates.get(0), MatchedBy.KEY).withCandidates(candidates));
            } else {
                plan.resolve(record, Resolution.ambiguous("MULTIPLE_MATCHES", candidates));
            }
        }

        /**
         * Two imported records of research data may not merge into the same existing one: they
         * were different records where they came from. (Shared records may: two people with the
         * same ORCID are duplicates of one person.)
         */
        private void checkClaims(EntityType type) {
            if (type.kind() == EntityType.Kind.SHARED) return;
            Map<Object, List<ImportRecord>> byTarget = new LinkedHashMap<>();
            for (ImportRecord record : graph.of(type)) {
                Resolution r = plan.resolution(type, record.id);
                if (r.action == Action.MATCH && r.matchedBy != MatchedBy.ID) {
                    byTarget.computeIfAbsent(r.targetId, k -> new ArrayList<>()).add(record);
                }
            }
            byTarget.forEach((target, claimants) -> {
                if (claimants.size() < 2) return;
                long chosen = claimants.stream().filter(c -> plan.resolution(type, c.id).matchedBy == MatchedBy.CHOICE).count();
                for (ImportRecord claimant : claimants) {
                    Resolution r = plan.resolution(type, claimant.id);
                    if (r.matchedBy == MatchedBy.KEY) {
                        plan.resolve(claimant, Resolution.ambiguous("TARGET_CLAIMED_TWICE", r.candidates));
                    } else if (chosen > 1) {
                        plan.errors.add(new Issue("TARGET_CHOSEN_TWICE", claimant.key(), claimant.path,
                                Labels.record(graph, claimant) + ": the same existing record was chosen for more than one imported record."));
                    }
                }
            });
        }

        private Set<Object> claimedById(Collection<ImportRecord> records, Map<Object, Object> byId) {
            Set<Object> claimed = new HashSet<>();
            for (ImportRecord record : records) {
                if (byId.containsKey(record.id)) claimed.add(record.id);
            }
            return claimed;
        }

        private Map<Object, Object> remember(EntityType type, List<Object> entities) {
            EntitySpec<Object> spec = ExchangeSchema.spec(type);
            Map<Object, Object> byId = new HashMap<>();
            for (Object e : entities) {
                Object id = spec.id().apply(e);
                byId.put(id, e);
                plan.remember(type, id, e);
            }
            return byId;
        }

        // Comparing -----------------------------------------------------------------------------

        /** Ids referenced by results' absoluteDatingIds that aren't in the file but exist here. */
        private final Set<Object> existingOutsideFile = new HashSet<>();

        void diff() {
            Set<Object> outside = new HashSet<>();
            for (ImportRecord result : graph.of(RESULT)) {
                for (Object id : result.setOrEmpty("absoluteDatingIds")) {
                    if (graph.get(ABSOLUTE_DATING, id) == null) outside.add(id);
                }
            }
            for (List<Object> chunk : chunks(outside)) {
                existingOutsideFile.addAll(jdbc.queryForList("SELECT id FROM absolute_dating WHERE id IN (:ids)", Map.of("ids", chunk), UUID.class));
            }

            for (EntityType type : EntityType.values()) {
                if (type.isLookup()) continue;
                Collection<ImportRecord> records = graph.of(type);
                if (records.isEmpty()) continue;
                EntitySpec<Object> spec = ExchangeSchema.spec(type);
                List<Object> matched = new ArrayList<>();
                for (ImportRecord record : records) {
                    Resolution r = plan.resolution(type, record.id);
                    if (r.action == Action.MATCH) matched.add(r.targetId);
                }
                Map<String, Map<Object, Set<Object>>> existingLinks = existingLinks(spec, matched);
                for (ImportRecord record : records) {
                    Resolution r = plan.resolution(type, record.id);
                    if (!r.resolved()) continue;
                    boolean create = r.action == Action.CREATE;
                    Object existing = create ? null : plan.entity(type, r.targetId);
                    fields(record, spec.fields(), existing, create, "", r.targetId, existingLinks);
                }
            }
        }

        @SuppressWarnings({"unchecked", "rawtypes"})
        private void fields(ImportRecord record, List<? extends Field<?>> fields, Object existing, boolean create, String prefix,
                            Object ownerTarget, Map<String, Map<Object, Set<Object>>> existingLinks) {
            for (Field<?> field : fields) {
                String key = prefix + field.name();
                if (field instanceof Scalar s) {
                    if (create) continue;
                    ValueType type = s.type();
                    Object imported = record.values.get(key);
                    if (imported == null || type.isEmpty(imported)) continue;
                    Object current = existing == null ? null : s.get().apply(existing);
                    if (current == null || type.isEmpty(current)) {
                        change(record, key, false, null, type.display(imported));
                    } else if (!type.same(current, imported)) {
                        change(record, key, true, type.display(current), type.display(imported));
                    }
                } else if (field instanceof LookupRef l) {
                    if (create) continue;
                    Object imported = record.values.get(key);
                    if (imported == null) continue;
                    Object current = existing == null ? null : l.get().apply(existing);
                    Object currentId = idOf(current);
                    String importedLabel = labelOfRecord(l.target(), imported);
                    if (currentId == null) {
                        change(record, key, false, null, importedLabel);
                    } else if (!currentId.equals(imported)) {
                        change(record, key, true, Labels.lookupLabel(l.target(), current), importedLabel);
                    }
                } else if (field instanceof SharedRef r) {
                    reference(record, key, r.target(), record.values.get(key), existing == null ? null : r.get().apply(existing), create);
                } else if (field instanceof OwnedRef o) {
                    if (plan.keptWithOwner.contains(record.values.get(key))) continue; // belongs to another absolute dating
                    reference(record, key, o.target(), record.values.get(key), existing == null ? null : o.get().apply(existing), create);
                } else if (field instanceof Parent p) {
                    reference(record, key, p.target(), record.parentId, existing == null ? null : p.get().apply(existing), create);
                } else if (field instanceof Embedded e) {
                    if (create) continue;
                    Object part = existing == null ? null : e.get().apply(existing);
                    fields(record, e.fields(), part, false, key + ".", ownerTarget, existingLinks);
                } else if (field instanceof LookupSet || field instanceof SharedSet || field instanceof IdSet || field instanceof ValueList) {
                    links(record, field, ownerTarget, existingLinks);
                }
                // Children: records of their own
            }
        }

        private void reference(ImportRecord record, String key, EntityType target, Object importedId, Object current, boolean create) {
            if (create || importedId == null) return;
            Object importedTarget = plan.target(target, importedId);
            if (importedTarget == null) return; // unresolved: blocks the commit anyway
            Object currentId = idOf(current);
            if (currentId == null) {
                change(record, key, false, null, labelOfRecord(target, importedId));
            } else if (!currentId.equals(importedTarget)) {
                change(record, key, true, Labels.entityPath(target, current), labelOfRecord(target, importedId));
            }
        }

        private void change(ImportRecord record, String field, boolean conflict, Object existing, Object imported) {
            plan.changes.add(new ImportPlan.Change(record, field, conflict, existing, imported));
        }

        @SuppressWarnings({"rawtypes"})
        private void links(ImportRecord record, Field<?> field, Object ownerTarget, Map<String, Map<Object, Set<Object>>> existingLinks) {
            Set<Object> imported = record.setOrEmpty(field.name());
            if (imported.isEmpty()) return;
            Set<Object> current = existingLinks.getOrDefault(field.name(), Map.of()).getOrDefault(ownerTarget, Set.of());
            List<Object> targets = new ArrayList<>();
            List<String> labels = new ArrayList<>();
            Link link = null;
            for (Object value : imported) {
                Object target;
                String label;
                if (field instanceof LookupSet l) {
                    link = l.link();
                    target = value;
                    label = labelOfRecord(l.target(), value);
                } else if (field instanceof SharedSet s) {
                    link = s.link();
                    target = plan.target(s.target(), value);
                    label = labelOfRecord(s.target(), value);
                } else if (field instanceof IdSet ids) {
                    link = ids.link();
                    if (graph.get(ids.target(), value) != null) {
                        target = plan.target(ids.target(), value);
                        label = labelOfRecord(ids.target(), value);
                    } else if (existingOutsideFile.contains(value)) {
                        target = value;
                        label = String.valueOf(value);
                    } else {
                        plan.warnings.add(new Issue("MISSING_REFERENCE", record.key(), record.path,
                                Labels.record(graph, record) + " refers to an absolute dating that is neither in the file nor here; that link is skipped."));
                        continue;
                    }
                } else {
                    ValueList v = (ValueList) field;
                    link = v.link();
                    if (record.type == FEATURE && "excavationYears".equals(field.name()) && !ExcavationYears.isValid(value)) {
                        plan.warnings.add(new Issue("INVALID_EXCAVATION_YEAR", record.key(), record.path,
                                Labels.record(graph, record) + ": the excavation year " + value + " is not between "
                                        + ExcavationYears.MIN + " and this year; it is skipped."));
                        continue;
                    }
                    target = value;
                    label = String.valueOf(value);
                }
                if (target == null || current.contains(target)) continue;
                targets.add(target);
                labels.add(label);
            }
            if (!targets.isEmpty()) plan.links.add(new ImportPlan.LinkAdd(record, field.name(), link, ownerTarget, targets, labels));
        }

        /** The current rows of every link table of the type, for its matched records. */
        private Map<String, Map<Object, Set<Object>>> existingLinks(EntitySpec<Object> spec, List<Object> owners) {
            Map<String, Map<Object, Set<Object>>> result = new HashMap<>();
            if (owners.isEmpty()) return result;
            for (Field<Object> field : spec.fields()) {
                Link link = linkOf(field);
                if (link == null) continue;
                Map<Object, Set<Object>> rows = new HashMap<>();
                for (List<Object> chunk : chunks(owners)) {
                    jdbc.query("SELECT " + link.ownerColumn() + ", " + link.targetColumn() + " FROM " + link.table()
                            + " WHERE " + link.ownerColumn() + " IN (:ids)", Map.of("ids", chunk), rs -> {
                        rows.computeIfAbsent(rs.getObject(1), k -> new HashSet<>()).add(rs.getObject(2));
                    });
                }
                result.put(field.name(), rows);
            }
            return result;
        }

        private String labelOfRecord(EntityType type, Object importedId) {
            ImportRecord r = graph.get(type, importedId);
            return r == null ? String.valueOf(importedId) : Objects.requireNonNullElse(Labels.record(graph, r), String.valueOf(importedId));
        }
    }

    static Link linkOf(Field<?> field) {
        if (field instanceof LookupSet<?, ?> l) return l.link();
        if (field instanceof SharedSet<?, ?> s) return s.link();
        if (field instanceof IdSet<?> i) return i.link();
        if (field instanceof ValueList<?, ?> v) return v.link();
        return null;
    }

    // Loading -----------------------------------------------------------------------------------

    private List<Object> load(EntitySpec<Object> spec, Collection<Object> ids) {
        List<Object> result = new ArrayList<>();
        for (List<Object> chunk : chunks(ids)) {
            result.addAll(em.createQuery("select e from " + spec.entityClass().getSimpleName() + " e where e.id in :ids", Object.class)
                    .setParameter("ids", chunk).getResultList());
        }
        return result;
    }

    private static List<Object> ids(Collection<ImportRecord> records) {
        List<Object> ids = new ArrayList<>(records.size());
        for (ImportRecord record : records) ids.add(record.id);
        return ids;
    }

    static List<List<Object>> chunks(Collection<?> values) {
        List<List<Object>> chunks = new ArrayList<>();
        List<Object> current = new ArrayList<>();
        for (Object value : values) {
            current.add(value);
            if (current.size() == CHUNK) {
                chunks.add(current);
                current = new ArrayList<>();
            }
        }
        if (!current.isEmpty()) chunks.add(current);
        return chunks;
    }

    // Keys ---------------------------------------------------------------------------------------

    /** The id of an entity (or a Hibernate proxy, without loading it), or null. */
    private static Object idOf(Object entity) {
        if (entity == null) return null;
        for (EntityType type : EntityType.values()) {
            EntitySpec<Object> spec = ExchangeSchema.spec(type);
            if (spec.entityClass().isInstance(entity)) return spec.id().apply(entity);
        }
        throw new IllegalArgumentException("Not an exchanged entity: " + entity.getClass());
    }

    /** Labels compare as written, apart from surrounding spaces. */
    private static String label(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /** Labels of sites, features, samples and sub-samples compare ignoring case (as the keys of ArboDat 2018). */
    private static String labelKey(String value) {
        String label = label(value);
        return label == null ? null : label.toLowerCase(Locale.ROOT);
    }

    /** Names compare ignoring case, accents written either way, and extra spaces. */
    static String name(String value) {
        if (value == null) return null;
        String normalized = Normalizer.normalize(value, Normalizer.Form.NFC).trim().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
        return normalized.isEmpty() ? null : normalized;
    }

    private static String person(String last, String first, String middle) {
        String lastName = name(last);
        return lastName == null ? null : key(lastName, name(first), name(middle));
    }

    static String orcid(String value) {
        String v = stripPrefix(value, "https://orcid.org/", "http://orcid.org/", "orcid.org/");
        return v == null ? null : v.toUpperCase(Locale.ROOT);
    }

    static String ror(String value) {
        String v = stripPrefix(value, "https://ror.org/", "http://ror.org/", "ror.org/");
        return v == null ? null : v.toLowerCase(Locale.ROOT);
    }

    static String doi(String value) {
        String v = stripPrefix(value, "https://doi.org/", "http://doi.org/", "https://dx.doi.org/", "http://dx.doi.org/", "doi:");
        return v == null ? null : v.toLowerCase(Locale.ROOT);
    }

    private static String stripPrefix(String value, String... prefixes) {
        if (value == null) return null;
        String v = value.trim();
        for (String prefix : prefixes) {
            if (v.toLowerCase(Locale.ROOT).startsWith(prefix)) {
                v = v.substring(prefix.length());
                break;
            }
        }
        return v.isEmpty() ? null : v;
    }

    /** Several values as one key; null when all are empty. */
    private static String key(Object... parts) {
        boolean any = false;
        StringBuilder sb = new StringBuilder();
        for (Object part : parts) {
            if (sb.length() > 0) sb.append(SEP);
            if (part == null || (part instanceof String s && s.isBlank())) {
                sb.append(NONE);
            } else {
                any = true;
                sb.append(part instanceof String s ? s.trim() : part.toString());
            }
        }
        return any ? sb.toString() : null;
    }

    private static Object localLab(EntityType type, Object dating) {
        return idOf(type == C14_DATING ? ((C14Dating) dating).getC14Laboratory()
                : type == DENDROCHRONOLOGICAL_DATING ? ((DendrochronologicalDating) dating).getLaboratory()
                : ((OtherDating) dating).getLaboratory());
    }

    private static String localNumber(EntityType type, Object dating) {
        return label(type == C14_DATING ? ((C14Dating) dating).getNumber()
                : type == DENDROCHRONOLOGICAL_DATING ? ((DendrochronologicalDating) dating).getNumber()
                : ((OtherDating) dating).getNumber());
    }

    /** Laboratory + number; null unless both are there. */
    private static String labNumber(Object laboratory, String number) {
        return laboratory == null || number == null ? null : laboratory + SEP + number;
    }

    /** A result without taxon has no natural key. */
    private static String resultKey(Object taxCode, Object orgOrMin, Object sieveSize, Object cf, Object restType, Object stateOfPreservation) {
        return taxCode == null ? null : key(taxCode, orgOrMin, sieveSize, cf, restType, stateOfPreservation);
    }

    // Fingerprint ----------------------------------------------------------------------------------

    /**
     * Identifies a plan: the file and everything the import would do. The preview the user
     * reviewed and the plan made at commit time must have the same fingerprint.
     */
    private static String fingerprint(ImportPlan plan) {
        MessageDigest sha;
        try {
            sha = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
        StringBuilder line = new StringBuilder();
        java.util.function.Consumer<Object[]> add = parts -> {
            line.setLength(0);
            for (Object part : parts) line.append(part).append('|');
            sha.update(line.append('\n').toString().getBytes(StandardCharsets.UTF_8));
        };
        add.accept(new Object[]{"F", plan.graph.sha256});
        for (EntityType type : EntityType.values()) {
            for (ImportRecord record : plan.graph.of(type)) {
                Resolution r = plan.resolution(type, record.id);
                add.accept(new Object[]{"R", record.key(), r.action, r.targetId, r.matchedBy, r.reason, r.candidates});
            }
        }
        for (ImportPlan.Change c : plan.changes) {
            add.accept(new Object[]{"C", c.record().key(), c.field(), c.conflict(), c.existing(), c.imported()});
        }
        for (ImportPlan.LinkAdd l : plan.links) {
            add.accept(new Object[]{"L", l.record().key(), l.field(), l.ownerId(), l.targets()});
        }
        for (Issue e : plan.errors) {
            add.accept(new Object[]{"E", e.code(), e.recordKey()});
        }
        return HexFormat.of().formatHex(sha.digest());
    }
}
