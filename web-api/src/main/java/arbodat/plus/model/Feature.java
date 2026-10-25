package arbodat.plus.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import lombok.Data;
import java.io.Serializable;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Data
@Entity
@Table(name = "feature")
public class Feature implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "feature_label")
    private String label;

    @ElementCollection
    @CollectionTable(name = "excavation_years", joinColumns = @JoinColumn(name = "feature_id"))
    @Column(name = "excavation_year")
    private List<Integer> excavationYears;

    @Column(name = "excavation_area")
    private String excavationArea;

    @Column(name = "building_context")
    private Boolean buildingContext;

    @Column(name = "building_context_description")
    private String buildingContextDescription;

    @Column(name = "feature_condition")
    private Boolean featureCondition;

    @Column(name = "remarks_feature", columnDefinition = "TEXT")
    private String remarksFeature;

    // central on Dante
    @ManyToOne
    @JoinColumn(name = "preservation_condition")
    private PreservationCondition preservationCondition;

    // central on Dante
    @ManyToOne
    @JoinColumn(name = "feature_type")
    private FeatureType featureType;

    @JsonIgnore
    @OneToMany(mappedBy = "feature")
    private Set<Sample> sampleList;

    @ManyToOne
    @JoinColumn(name = "site")
    @JsonIgnoreProperties("literatureList")
    private Site site;

    @Override
    public boolean equals(Object obj) {
        if (this == obj) return true;
        if (obj == null || getClass() != obj.getClass()) return false;
        Feature feature = (Feature) obj;
        return Objects.equals(id, feature.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }
}
