package arbodat.plus.dto_migration;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.UUID;

// Outcome of one item of a bulk create / update: "created" (with id), "updated", "exists" or "error" (with message)
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
