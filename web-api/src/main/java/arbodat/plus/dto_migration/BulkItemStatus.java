package arbodat.plus.dto_migration;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.UUID;

// Outcome of one item of a bulk create / update: "created" (with id, optionally a note as message), "updated",
// "exists" or "error" (with message)
@Getter
@AllArgsConstructor
public class BulkItemStatus {
    private String clientId;
    private String status;
    private UUID id;
    private String message;

    public static BulkItemStatus created(String clientId, UUID id) {
        return new BulkItemStatus(clientId, "created", id, null);
    }

    // Created, with a note (e.g. a rule of ArboDat+ the taken over value doesn't meet)
    public static BulkItemStatus created(String clientId, UUID id, String note) {
        return new BulkItemStatus(clientId, "created", id, note);
    }

    public static BulkItemStatus updated(String clientId) {
        return new BulkItemStatus(clientId, "updated", null, null);
    }

    public static BulkItemStatus exists(String clientId) {
        return new BulkItemStatus(clientId, "exists", null, null);
    }

    public static BulkItemStatus error(String clientId, String message) {
        return new BulkItemStatus(clientId, "error", null, message);
    }
}
