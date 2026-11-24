package arbodat.plus.dataimport;

import org.springframework.http.HttpStatus;

/**
 * An import that can't go ahead, with the HTTP status and a stable {@code reason} for the frontend.
 * {@code plan} (the fresh preview) is set when the user has to look again before committing.
 */
public class ImportException extends RuntimeException {

    private final HttpStatus status;
    private final String reason;
    private final transient Object plan;

    private ImportException(HttpStatus status, String reason, String message, Object plan) {
        super(message);
        this.status = status;
        this.reason = reason;
        this.plan = plan;
    }

    /** The file isn't a readable ArboDat+ export. */
    public static ImportException invalidFile(String message) {
        return new ImportException(HttpStatus.BAD_REQUEST, "INVALID_FILE", message, null);
    }

    /** The file was written by a newer ArboDat+ with a format this one doesn't know. */
    public static ImportException newerFormat(int formatVersion, String appVersion) {
        return new ImportException(HttpStatus.UNPROCESSABLE_ENTITY, "NEWER_FORMAT",
                "This file was exported by ArboDat+ " + (appVersion == null ? "(unknown version)" : appVersion)
                        + " in format version " + formatVersion + ", which this ArboDat+ can't read yet."
                        + " Please update ArboDat+ first.", null);
    }

    /** The decisions sent with the request aren't valid. */
    public static ImportException invalidDecisions(String message) {
        return new ImportException(HttpStatus.BAD_REQUEST, "INVALID_DECISIONS", message, null);
    }

    /** The data changed since the preview: the user has to review the new plan. */
    public static ImportException planChanged(Object plan) {
        return new ImportException(HttpStatus.CONFLICT, "PLAN_CHANGED",
                "The data changed since the preview. Please review the updated preview.", plan);
    }

    /** Ambiguous matches are unresolved, or a choice isn't valid. */
    public static ImportException unresolved(Object plan) {
        return new ImportException(HttpStatus.UNPROCESSABLE_ENTITY, "UNRESOLVED",
                "Some records still need a decision before the import can run.", plan);
    }

    /**
     * The database refused a value the import (with the user's choices) would write, e.g. a
     * laboratory number another dating has. Nothing was imported.
     */
    public static ImportException refusedByDatabase(String detail) {
        return new ImportException(HttpStatus.CONFLICT, "REFUSED_BY_DATABASE",
                "Nothing was imported: the database refused a value. " + detail, null);
    }

    public HttpStatus status() {
        return status;
    }

    public String reason() {
        return reason;
    }

    public Object plan() {
        return plan;
    }
}
