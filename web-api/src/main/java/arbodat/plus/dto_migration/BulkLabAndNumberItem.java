package arbodat.plus.dto_migration;

import arbodat.plus.model.C14Laboratory;
import arbodat.plus.model.Laboratory;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

// Laboratory and number of one absolute dating (labs and numbers accordion of the migration).
// datingMethod "c14Dating" uses c14Laboratory (DANTE), "dendroDating" / "otherDating" use laboratory
// (without id: a new laboratory with this label, or an existing one with the same label).
// 'clientId' is the id of the row in the frontend and is returned in the corresponding BulkItemStatus.
@Getter
@Setter
@NoArgsConstructor
public class BulkLabAndNumberItem {
    private String clientId;
    private UUID absoluteDatingId;
    private String datingMethod;
    private String number;
    private C14Laboratory c14Laboratory;
    private Laboratory laboratory;
}
