package arbodat.plus.dataimport;

import arbodat.plus.exchange.EntitySpec;
import arbodat.plus.exchange.EntityType;
import arbodat.plus.exchange.ExchangeSchema;
import arbodat.plus.exchange.Field;
import arbodat.plus.exchange.Field.*;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.*;
import java.util.zip.GZIPInputStream;

/**
 * Reads an export file (plain or gzipped JSON) into an {@link ImportGraph}.
 * Accepts format version 0 (the bare array of research projects written before the envelope) and
 * every version up to {@link ExchangeSchema#FORMAT_VERSION}. Records are read one top-level object
 * at a time, so only the flat records stay in memory, not the file's JSON tree.
 * A record that appears more than once (a site under two research projects, a person on many
 * sites) is kept once: its first occurrence wins.
 */
@Component
class ImportReader {

    private static final Map<String, EntityType> SHARED_LISTS = Map.of(
            "users", EntityType.USER,
            "institutions", EntityType.INSTITUTION,
            "literature", EntityType.LITERATURE,
            "authors", EntityType.AUTHOR,
            "laboratories", EntityType.LABORATORY);

    private final ObjectMapper mapper = new ObjectMapper();

    ImportReader() {
        // The stream is drained after parsing, so the hash covers the whole file.
        mapper.getFactory().disable(JsonParser.Feature.AUTO_CLOSE_SOURCE);
    }

    ImportGraph read(InputStream raw) throws IOException {
        MessageDigest sha256;
        try {
            sha256 = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
        DigestInputStream digest = new DigestInputStream(raw, sha256);
        BufferedInputStream buffered = new BufferedInputStream(digest);
        buffered.mark(2);
        boolean gzip = buffered.read() == 0x1f && buffered.read() == 0x8b;
        buffered.reset();
        InputStream in = gzip ? new GZIPInputStream(buffered) : buffered;

        Reading reading = new Reading();
        try (JsonParser parser = mapper.getFactory().createParser(in)) {
            JsonToken first = parser.nextToken();
            if (first == JsonToken.START_ARRAY) {
                reading.graph.formatVersion = 0;
                readResearchProjects(parser, reading, "");
            } else if (first == JsonToken.START_OBJECT) {
                readEnvelope(parser, reading);
            } else {
                throw ImportException.invalidFile("This is not an ArboDat+ export (expected a JSON object or array).");
            }
            if (parser.nextToken() != null) {
                throw ImportException.invalidFile("Unexpected content after the end of the export.");
            }
        } catch (JsonProcessingException e) {
            throw ImportException.invalidFile("The file is not valid JSON: " + e.getOriginalMessage()
                    + " (line " + e.getLocation().getLineNr() + ", column " + e.getLocation().getColumnNr() + ").");
        } catch (java.util.zip.ZipException e) {
            throw ImportException.invalidFile("The file looks gzip-compressed but can't be decompressed.");
        }
        in.transferTo(java.io.OutputStream.nullOutputStream()); // hash the whole file, also bytes the parser didn't need
        reading.graph.sha256 = HexFormat.of().formatHex(sha256.digest());

        reading.unknownFields.forEach((field, count) -> reading.graph.warnings.add(new Issue("UNKNOWN_FIELD", null, null,
                "The file has a field this ArboDat+ doesn't know and ignores: " + field
                        + (count > 1 ? " (" + count + " times)" : "") + ". It was probably exported by a newer version.")));
        return reading.graph;
    }

    private void readEnvelope(JsonParser parser, Reading reading) throws IOException {
        ImportGraph graph = reading.graph;
        while (parser.nextToken() == JsonToken.FIELD_NAME) {
            String name = parser.currentName();
            parser.nextToken();
            switch (name) {
                case "formatVersion" -> {
                    if (!parser.currentToken().isNumeric()) {
                        throw ImportException.invalidFile("/formatVersion: expected a number.");
                    }
                    graph.formatVersion = parser.getIntValue();
                    if (graph.formatVersion > ExchangeSchema.FORMAT_VERSION) {
                        throw ImportException.newerFormat(graph.formatVersion, graph.appVersion);
                    }
                }
                case "appVersion" -> graph.appVersion = parser.getValueAsString();
                case "exportedAt" -> graph.exportedAt = parser.getValueAsString();
                case "researchProjects" -> readResearchProjects(parser, reading, "/researchProjects");
                case "unassignedSites" -> readArray(parser, "/unassignedSites", (node, path) ->
                        reading.record(EntityType.SITE, node, path));
                default -> {
                    EntityType shared = SHARED_LISTS.get(name);
                    if (shared != null) {
                        readArray(parser, "/" + name, (node, path) -> reading.record(shared, node, path));
                    } else {
                        if (!name.equals("scope")) reading.unknownFields.merge("/" + name, 1, Integer::sum);
                        parser.skipChildren();
                    }
                }
            }
        }
        if (graph.formatVersion < 0) {
            throw ImportException.invalidFile("This is not an ArboDat+ export (formatVersion is missing).");
        }
    }

    private void readResearchProjects(JsonParser parser, Reading reading, String path) throws IOException {
        readArray(parser, path, (node, itemPath) -> reading.record(EntityType.RESEARCH_PROJECT, node, itemPath));
    }

    private interface ItemReader {
        void read(JsonNode node, String path);
    }

    /** The parser is on START_ARRAY (or null); reads the items one at a time. */
    private void readArray(JsonParser parser, String path, ItemReader item) throws IOException {
        if (parser.currentToken() == JsonToken.VALUE_NULL) return;
        if (parser.currentToken() != JsonToken.START_ARRAY) {
            throw ImportException.invalidFile(path + ": expected an array.");
        }
        int index = 0;
        while (parser.nextToken() != JsonToken.END_ARRAY) {
            JsonNode node = mapper.readTree(parser);
            item.read(node, path + "/" + index++);
        }
    }

    /** State of one read: the graph and the unknown fields seen. */
    private static final class Reading {

        final ImportGraph graph = new ImportGraph();
        final Map<String, Integer> unknownFields = new TreeMap<>();

        ImportRecord record(EntityType type, JsonNode node, String path) {
            if (!node.isObject()) throw ImportException.invalidFile(path + ": expected an object.");
            Object id = id(type, node, path);
            ImportRecord existing = graph.get(type, id);
            if (existing != null) return existing;

            ImportRecord record = new ImportRecord(type, id, path);
            graph.add(record);
            EntitySpec<?> spec = ExchangeSchema.spec(type);
            fields(spec.fields(), node, record, "", path);
            checkKnown(spec.fields(), node, type.name());
            return record;
        }

        private Object id(EntityType type, JsonNode node, String path) {
            JsonNode id = node.get("id");
            if (id == null || !id.isTextual() || id.textValue().isBlank()) {
                throw ImportException.invalidFile(path + "/id: missing.");
            }
            if (type.isLookup()) return id.textValue();
            try {
                return UUID.fromString(id.textValue());
            } catch (IllegalArgumentException e) {
                throw ImportException.invalidFile(path + "/id: not a UUID: " + id.textValue());
            }
        }

        @SuppressWarnings({"unchecked", "rawtypes"})
        private <E> void fields(List<Field<E>> fields, JsonNode node, ImportRecord record, String prefix, String path) {
            for (Field<E> field : fields) {
                String key = prefix + field.name();
                String fieldPath = path + "/" + field.name();
                JsonNode value = node.get(field.name());
                if (field instanceof Children c) {
                    List<JsonNode> children = items(value, fieldPath);
                    for (int i = 0; i < children.size(); i++) {
                        ImportRecord childRecord = record(c.target(), children.get(i), fieldPath + "/" + i);
                        if (c.manyToMany()) {
                            childRecord.set(manyToManyField(c.target(), record.type)).add(record.id);
                        } else if (childRecord.parentId == null) {
                            childRecord.parentId = (UUID) record.id;
                        }
                    }
                    continue;
                }
                if (value == null || value.isNull()) continue;

                if (field instanceof Scalar s) {
                    record.values.put(key, scalar(s.type(), value, fieldPath));
                } else if (field instanceof LookupRef l) {
                    record.values.put(key, lookup(l.target(), value, fieldPath));
                } else if (field instanceof SharedRef r) {
                    record.values.put(key, record(r.target(), value, fieldPath).id);
                } else if (field instanceof OwnedRef o) {
                    ImportRecord part = record(o.target(), value, fieldPath);
                    if (part.parentId == null) part.parentId = (UUID) record.id;
                    record.values.put(key, part.id);
                } else if (field instanceof LookupSet l) {
                    List<JsonNode> items = items(value, fieldPath);
                    for (int i = 0; i < items.size(); i++) {
                        record.set(key).add(lookup(l.target(), items.get(i), fieldPath + "/" + i));
                    }
                } else if (field instanceof SharedSet s) {
                    List<JsonNode> items = items(value, fieldPath);
                    for (int i = 0; i < items.size(); i++) {
                        record.set(key).add(record(s.target(), items.get(i), fieldPath + "/" + i).id);
                    }
                } else if (field instanceof ValueList v) {
                    for (JsonNode item : items(value, fieldPath)) {
                        if (!item.isNull()) record.set(key).add(scalar(v.type(), item, fieldPath));
                    }
                } else if (field instanceof IdSet ids) {
                    if (!ids.written()) continue;
                    for (JsonNode item : items(value, fieldPath)) {
                        try {
                            record.set(key).add(UUID.fromString(item.asText()));
                        } catch (IllegalArgumentException e) {
                            throw ImportException.invalidFile(fieldPath + ": not a UUID: " + item.asText());
                        }
                    }
                } else if (field instanceof Embedded em) {
                    if (!value.isObject()) throw ImportException.invalidFile(fieldPath + ": expected an object.");
                    record.embedded.add(key);
                    fields(em.fields(), value, record, key + ".", fieldPath);
                    checkKnown(em.fields(), value, record.type + "." + field.name());
                }
                // Parent: implied by nesting
            }
        }

        private Object scalar(arbodat.plus.exchange.ValueType<?> type, JsonNode value, String path) {
            try {
                return type.read(value);
            } catch (IllegalArgumentException e) {
                throw ImportException.invalidFile(path + ": " + e.getMessage() + ".");
            }
        }

        /** Registers the lookup value (first occurrence wins) and returns its URI. */
        private String lookup(EntityType type, JsonNode node, String path) {
            if (!node.isObject()) throw ImportException.invalidFile(path + ": expected an object.");
            return (String) record(type, node, path).id;
        }

        private static List<JsonNode> items(JsonNode value, String path) {
            if (value == null || value.isNull()) return List.of();
            if (!value.isArray()) throw ImportException.invalidFile(path + ": expected an array.");
            List<JsonNode> items = new ArrayList<>(value.size());
            value.forEach(items::add);
            return items;
        }

        /** The child's IdSet that lists parents of this type (a site's researchProjects). */
        private static String manyToManyField(EntityType child, EntityType parent) {
            for (Field<?> field : ExchangeSchema.spec(child).fields()) {
                if (field instanceof IdSet<?> ids && ids.target() == parent && !ids.written()) return ids.name();
            }
            throw new IllegalStateException(child + " has no IdSet for " + parent);
        }

        private void checkKnown(List<? extends Field<?>> fields, JsonNode node, String where) {
            Iterator<String> names = node.fieldNames();
            while (names.hasNext()) {
                String name = names.next();
                if (name.equals("id") && !where.contains(".")) continue;
                boolean known = fields.stream().anyMatch(f -> f.name().equals(name)
                        && !(f instanceof Parent<?, ?>) && !(f instanceof IdSet<?> ids && !ids.written()));
                if (!known) unknownFields.merge(where + "." + name, 1, Integer::sum);
            }
        }
    }
}
