package arbodat.plus.dto_migration;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;
import java.util.UUID;

// Users of one site role or sample (team accordion of the migration):
// type "site" with userRole siteDirector / archaeologist / botanist, or type "sample" (botanicalDeterminationBy).
// The users replace the ones set so far. 'clientId' is the id of the row in the frontend and is returned
// in the corresponding BulkItemStatus.
@Getter
@Setter
@NoArgsConstructor
public class BulkUserItem {
    private String clientId;
    private String type;
    private UUID id;
    private String userRole;
    private List<UUID> userIds;
}
