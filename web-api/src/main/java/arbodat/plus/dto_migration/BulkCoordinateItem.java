package arbodat.plus.dto_migration;

import arbodat.plus.model.Coordinate;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

// Coordinate of one site or sample (coordinates accordion of the migration): type "site" or "sample" with its id.
// The coordinate replaces the one set so far; its coordinateSystem is referenced by id (a DANTE uri).
// 'clientId' is the id of the row in the frontend and is returned in the corresponding BulkItemStatus.
@Getter
@Setter
@NoArgsConstructor
public class BulkCoordinateItem {
    private String clientId;
    private String type;
    private UUID id;
    private Coordinate coordinate;
}
