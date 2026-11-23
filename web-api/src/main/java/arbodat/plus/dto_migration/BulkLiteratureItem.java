package arbodat.plus.dto_migration;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;
import java.util.UUID;

// Literature for one site (literature accordion of the migration): the literature is added to the site's
// literature (links set so far stay). 'clientId' is the id of the row in the frontend and is returned
// in the corresponding BulkItemStatus.
@Getter
@Setter
@NoArgsConstructor
public class BulkLiteratureItem {
    private String clientId;
    private UUID siteId;
    private List<UUID> literatureIds;
}
