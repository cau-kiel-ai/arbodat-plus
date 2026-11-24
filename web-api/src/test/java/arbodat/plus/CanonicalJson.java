package arbodat.plus;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** JSON text with object keys and array elements sorted, to compare JSON regardless of order. */
public final class CanonicalJson {

    private CanonicalJson() {}

    public static String canonical(JsonNode node) {
        if (node.isObject()) {
            List<String> keys = new ArrayList<>();
            node.fieldNames().forEachRemaining(keys::add);
            Collections.sort(keys);
            StringBuilder sb = new StringBuilder("{");
            for (String key : keys) sb.append('"').append(key).append("\":").append(canonical(node.get(key))).append(',');
            return sb.append('}').toString();
        }
        if (node.isArray()) {
            List<String> elements = new ArrayList<>();
            for (JsonNode element : node) elements.add(canonical(element));
            Collections.sort(elements);
            return "[" + String.join(",", elements) + "]";
        }
        return node.toString();
    }
}
