package arbodat.plus.dto_migration;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.Setter;

// Site, whose migration failed and was rolled back (with the reason)
@Getter
@Setter
@AllArgsConstructor
public class FailedSite {

    private String label;
    private String message;
}
