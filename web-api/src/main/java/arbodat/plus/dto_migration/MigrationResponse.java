package arbodat.plus.dto_migration;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Getter
@Setter
@NoArgsConstructor
public class MigrationResponse {

    private List<NonMatchingDanteAttribute>                 nonMatchingDanteAttributeList   = new ArrayList<>();
    private List<LiteratureMigration>                       literatureList                  = new ArrayList<>();
    private List<CoordinateMigration>                       coordinateList                  = new ArrayList<>();
    private List<UserMigration>                             userList                        = new ArrayList<>();
    private List<FractionAnalyzedMigration>                 fractionAnalyzedList            = new ArrayList<>();
    private List<LabAndNumberMigration>                     labAndNumberList                = new ArrayList<>();
    private List<Map.Entry<String, List<ResultMigration>>>  resultList                      = new ArrayList<>();

    private List<ExistingSite>              existingSiteList                = new ArrayList<>();
    private List<ExistingFeature>           existingFeatureList             = new ArrayList<>();
    private List<ExistingSample>            existingSampleList              = new ArrayList<>();
    private List<ExistingAbsoluteDating>    existingAbsoluteDatingList      = new ArrayList<>();

    private List<FailedSite>                failedSiteList                  = new ArrayList<>();

    // For Testing
    @Override
    public String toString() {
        return "MigrationResponse{" +
                "nonMatchingDanteAttributeList=" + nonMatchingDanteAttributeList +
                ", literatureList=" + literatureList +
                ", coordinateList=" + coordinateList +
                ", userList=" + userList +
                ", fractionAnalyzedList=" + fractionAnalyzedList +
                ", labAndNumberList=" + labAndNumberList +
                ", resultList=" + resultList +
                ", existingSiteList=" + existingSiteList +
                ", existingFeatureList=" + existingFeatureList +
                ", existingSampleList=" + existingSampleList +
                ", existingAbsoluteDatingList=" + existingAbsoluteDatingList +
                ", failedSiteList=" + failedSiteList +
                '}';
    }
}
