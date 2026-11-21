package arbodat.plus.dataimport;

import arbodat.plus.exchange.EntityType;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * One record read from an import file, stored flat (no nested objects).
 * <ul>
 *   <li>{@code values}: scalars, and single references as the referenced id (lookup URI or UUID).
 *       Keys are field names; fields of an embedded object are "address.country".</li>
 *   <li>{@code sets}: many-to-many references and value lists, by field name.</li>
 *   <li>{@code parentId}: the record it was nested in (a feature's site, a dating's absolute dating).</li>
 *   <li>{@code embedded}: the embedded objects the file has, by field key.</li>
 * </ul>
 */
final class ImportRecord {

    final EntityType type;
    final Object id;
    final String path;
    UUID parentId;
    final Map<String, Object> values = new LinkedHashMap<>();
    final Map<String, Set<Object>> sets = new LinkedHashMap<>();
    /** Embedded objects present in the file (an address or coordinate, possibly with all fields null). */
    final Set<String> embedded = new HashSet<>();

    ImportRecord(EntityType type, Object id, String path) {
        this.type = type;
        this.id = id;
        this.path = path;
    }

    /** "SITE:&lt;uuid&gt;": how the preview and the decisions name this record. */
    String key() {
        return key(type, id);
    }

    static String key(EntityType type, Object id) {
        return type + ":" + id;
    }

    Set<Object> set(String field) {
        return sets.computeIfAbsent(field, f -> new LinkedHashSet<>());
    }

    Set<Object> setOrEmpty(String field) {
        return sets.getOrDefault(field, Set.of());
    }

    String string(String field) {
        Object value = values.get(field);
        return value instanceof String s ? s : null;
    }
}
