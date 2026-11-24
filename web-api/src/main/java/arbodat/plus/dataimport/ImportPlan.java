package arbodat.plus.dataimport;

import arbodat.plus.exchange.EntityType;
import arbodat.plus.exchange.Field;

import java.util.*;

/**
 * The outcome of planning an import (nothing written yet): what happens to every record, every
 * field that would change, and every link that would be added.
 */
final class ImportPlan {

    /**
     * A field of a matched record whose value differs. {@code conflict}: both sides have a value
     * (the user decides); otherwise the existing record has none and the imported value fills it.
     * {@code existing}/{@code imported} are display values.
     */
    record Change(ImportRecord record, String field, boolean conflict, Object existing, Object imported) {}

    /** Links (or values of a value list) the record gets in addition to those it has. */
    record LinkAdd(ImportRecord record, String field, Field.Link link, Object ownerId, List<Object> targets,
                   List<String> labels) {}

    /** An existing vocabulary value whose labels differ from the imported one (the local labels stay). */
    record LookupDiff(EntityType type, String id, String field, Object existing, Object imported) {}

    final ImportGraph graph;
    final Map<EntityType, Map<Object, Resolution>> resolutions = new EnumMap<>(EntityType.class);
    /** Existing records loaded while matching, by type and id. */
    final Map<EntityType, Map<Object, Object>> entities = new EnumMap<>(EntityType.class);
    final List<Change> changes = new ArrayList<>();
    final List<LinkAdd> links = new ArrayList<>();
    final List<LookupDiff> lookupDiffs = new ArrayList<>();
    final List<Issue> warnings = new ArrayList<>();
    /** Imported datings (ids) that belong to another absolute dating here: not linked to theirs. */
    final Set<Object> keptWithOwner = new HashSet<>();
    /** Decisions that can't be applied, and problems of the file; they block the commit. */
    final List<Issue> errors = new ArrayList<>();
    String fingerprint;

    ImportPlan(ImportGraph graph) {
        this.graph = graph;
        warnings.addAll(graph.warnings);
    }

    Resolution resolution(EntityType type, Object importedId) {
        Map<Object, Resolution> ofType = resolutions.get(type);
        return ofType == null ? null : ofType.get(importedId);
    }

    void resolve(ImportRecord record, Resolution resolution) {
        resolutions.computeIfAbsent(record.type, t -> new LinkedHashMap<>()).put(record.id, resolution);
    }

    /** The id the imported record has after the import, or null while it is unresolved. */
    Object target(EntityType type, Object importedId) {
        Resolution r = resolution(type, importedId);
        return r != null && r.resolved() ? r.targetId : null;
    }

    Object entity(EntityType type, Object id) {
        Map<Object, Object> ofType = entities.get(type);
        return ofType == null ? null : ofType.get(id);
    }

    void remember(EntityType type, Object id, Object entity) {
        entities.computeIfAbsent(type, t -> new HashMap<>()).put(id, entity);
    }

    long unresolved() {
        return resolutions.values().stream().flatMap(m -> m.values().stream()).filter(r -> !r.resolved()).count();
    }

    /** Whether the commit has to wait for decisions. */
    boolean blocked() {
        return unresolved() > 0 || !errors.isEmpty();
    }
}
