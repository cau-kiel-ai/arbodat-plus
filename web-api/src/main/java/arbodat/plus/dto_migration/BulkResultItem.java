package arbodat.plus.dto_migration;

import arbodat.plus.model.Result;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

// One result of a bulk create. 'clientId' is the id of the row in the frontend
// and is returned in the corresponding BulkItemStatus.
@Getter
@Setter
@NoArgsConstructor
public class BulkResultItem {
    private String clientId;
    private Result result;
}
