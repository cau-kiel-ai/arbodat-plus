package arbodat.plus.dataimport;

/**
 * A warning or error shown in the import preview.
 *
 * @param code      stable identifier, e.g. "UNKNOWN_FIELD"
 * @param recordKey the record it concerns ("SITE:&lt;uuid&gt;"), or null
 * @param path      where in the file (JSON pointer), or null
 */
public record Issue(String code, String recordKey, String path, String message) {}
