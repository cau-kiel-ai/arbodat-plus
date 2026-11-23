package arbodat.plus.dto_migration;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;
import java.util.UUID;

// DANTE value(s) for a non-matching attribute of the migration (non-matching attributes accordion):
// 'attribute' (e.g. "naturalUnit", "material") of the site / feature / sample / absolute dating with 'id'.
// 'values' are DANTE entries { id (uri), label }: one, or several for "siteType" (added to the site types).
// 'clientId' is the id of the row in the frontend and is returned in the corresponding BulkItemStatus.
@Getter
@Setter
@NoArgsConstructor
public class BulkDanteAttributeItem {
    private String clientId;
    private String attribute;
    private UUID id;
    private List<Value> values;

    @Getter
    @Setter
    @NoArgsConstructor
    public static class Value {
        private String id;
        private String label;
    }
}
