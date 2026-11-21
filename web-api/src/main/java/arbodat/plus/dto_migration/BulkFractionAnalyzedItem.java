package arbodat.plus.dto_migration;

import arbodat.plus.model.FractionAnalyzed;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

// One fraction analyzed of a bulk create. 'clientId' is the id of the row in the frontend
// and is returned in the corresponding BulkItemStatus.
@Getter
@Setter
@NoArgsConstructor
public class BulkFractionAnalyzedItem {
    private String clientId;
    private FractionAnalyzed fractionAnalyzed;
}
