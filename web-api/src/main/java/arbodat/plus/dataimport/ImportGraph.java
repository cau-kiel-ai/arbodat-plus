package arbodat.plus.dataimport;

import arbodat.plus.exchange.EntityType;

import java.util.*;

/** Everything read from one import file: the records by type and id, and what the file says about itself. */
final class ImportGraph {

    private final Map<EntityType, LinkedHashMap<Object, ImportRecord>> records = new EnumMap<>(EntityType.class);
    final List<Issue> warnings = new ArrayList<>();
    int formatVersion = -1;
    String appVersion;
    String exportedAt;
    String sha256;

    ImportRecord get(EntityType type, Object id) {
        LinkedHashMap<Object, ImportRecord> ofType = records.get(type);
        return ofType == null ? null : ofType.get(id);
    }

    void add(ImportRecord record) {
        records.computeIfAbsent(record.type, t -> new LinkedHashMap<>()).put(record.id, record);
    }

    Collection<ImportRecord> of(EntityType type) {
        LinkedHashMap<Object, ImportRecord> ofType = records.get(type);
        return ofType == null ? List.of() : ofType.values();
    }

    int size() {
        return records.values().stream().mapToInt(Map::size).sum();
    }
}
