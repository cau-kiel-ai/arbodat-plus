package arbodat.plus.dataimport;

import arbodat.plus.exchange.EntityType;

import java.util.Map;

/**
 * What the user decided in the preview, sent with the next preview and with the commit.
 *
 * @param planFingerprint the preview the user reviewed (commit only): if the plan computed at
 *                        commit time differs, nothing is imported and the new preview is returned
 * @param matches         "SITE:&lt;uuid&gt;" → the id of the existing record to merge into, or "NEW"
 * @param conflicts       keep the existing value or take the imported one, see {@link Conflicts}
 */
public record Decisions(String planFingerprint, Map<String, String> matches, Conflicts conflicts) {

    public static final String NEW = "NEW";
    public static final String KEEP = "KEEP";
    public static final String TAKE = "TAKE";

    public static Decisions none() {
        return new Decisions(null, Map.of(), null);
    }

    String match(String recordKey) {
        return matches == null ? null : matches.get(recordKey);
    }

    /**
     * Whether the imported value replaces the existing one. The most specific choice wins:
     * byField ("SITE:&lt;uuid&gt;:remarks") > byRecord ("SITE:&lt;uuid&gt;") > byTypeField ("SITE:remarks")
     * > byType ("SITE") > default; without any, the existing value is kept.
     */
    boolean take(String recordKey, EntityType type, String field) {
        if (conflicts == null) return false;
        String choice = first(
                get(conflicts.byField(), recordKey + ":" + field),
                get(conflicts.byRecord(), recordKey),
                get(conflicts.byTypeField(), type + ":" + field),
                get(conflicts.byType(), type.name()),
                conflicts.defaultChoice());
        return TAKE.equals(choice);
    }

    /** Throws if a value isn't one of the allowed words. */
    void validate() {
        if (matches != null) {
            matches.forEach((key, value) -> {
                if (value == null || value.isBlank()) throw ImportException.invalidDecisions("No choice for " + key + ".");
            });
        }
        if (conflicts != null) {
            check(conflicts.defaultChoice());
            for (Map<String, String> choices : new Map[]{conflicts.byType(), conflicts.byTypeField(), conflicts.byRecord(), conflicts.byField()}) {
                if (choices != null) choices.values().forEach(Decisions::check);
            }
        }
    }

    private static void check(String choice) {
        if (choice != null && !KEEP.equals(choice) && !TAKE.equals(choice)) {
            throw ImportException.invalidDecisions("A conflict choice must be KEEP or TAKE, not \"" + choice + "\".");
        }
    }

    private static String get(Map<String, String> choices, String key) {
        return choices == null ? null : choices.get(key);
    }

    private static String first(String... choices) {
        for (String choice : choices) {
            if (choice != null) return choice;
        }
        return null;
    }

    /** KEEP or TAKE per conflict, at several levels; see {@link #take}. */
    public record Conflicts(String defaultChoice, Map<String, String> byType, Map<String, String> byTypeField,
                            Map<String, String> byRecord, Map<String, String> byField) {}
}
