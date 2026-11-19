package arbodat.plus.dto_migration;

import arbodat.plus.model.Result;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
public class ResultMigration {

    // The sample is not sent (it contains the whole feature and site), only the fields below
    @JsonIgnoreProperties("sample")
    private Result result;

    private UUID   sampleId;
    private String sampleLabel;
    private UUID   featureId;
    private String featureLabel;
    private String siteLabel;
    private FractionAnalyzedMigration fractionAnalyzed;

    // ---- Empty string indicates that attribute is already set ----
    private String nonMatchingTaxCode               = "";
    private String nonMatchingStateOfPreservation   = "";
    private String nonMatchingRestType              = "";
    private String nonMatchingClassificationConfer  = "";
    // --------------------------------------------------------------
}
