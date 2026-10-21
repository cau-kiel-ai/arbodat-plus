package arbodat.plus.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.Data;
import java.io.Serializable;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Data
@Entity
@Table(name = "sample")
public class Sample implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne
    @JoinColumn(name = "feature_id")
    private Feature feature;

    @Column(name = "sample_label")
    private String label;

    // Sample Location --------------------------------------------------------
    @Column(name = "stratum")
    private String stratum;

    @Column(name = "layer")
    private String layer;

    @Column(name = "sector")
    private String sector;

    @Column(name = "planum")
    private String planum;

    @Column(name = "depth_from")
    private Double depthFrom;

    @Column(name = "depth_to")
    private Double depthTo;

    // Coordinates ------------------------------------------------------------
    @OneToOne(cascade = CascadeType.ALL, orphanRemoval=true)
    @JoinColumn(name = "coordinate")
    private Coordinate coordinate;

    // Measurement details ----------------------------------------------------
    @ManyToMany
    @JoinTable(name = "botanical_determination_by",
               joinColumns = @JoinColumn(name = "sample_id"),
               inverseJoinColumns = @JoinColumn(name = "user_id")
    )
    private Set<User> botanicalDeterminationBy;

    @Column(name = "botanical_determination_year")
    private String botanicalDeterminationYear;

    @OneToMany(mappedBy = "sample", cascade = CascadeType.ALL, orphanRemoval=true)
    private Set<FractionAnalyzed> fractionAnalyzedList;

    // central on Dante
    @ManyToOne
    @JoinColumn(name = "sample_type")
    private SampleType sampleType;

    @Column(name = "sample_storage")
    private Boolean sampleStorage;

    @Column(name = "micro_remain_sample")
    private Boolean microRemain;

    // Inventory --------------------------------------------------------------
    // central on Dante
    @ManyToOne
    @JoinColumn(name = "seeds_and_fruits")
    private SampleInvestigated seedsAndFruits;

    // central on Dante
    @ManyToOne
    @JoinColumn(name = "wood_subfossile")
    private SampleInvestigated woodSubfossile;

    // central on Dante
    @ManyToOne
    @JoinColumn(name = "charcoal_investigated")
    private SampleInvestigated charcoalInvestigated;

    @Column(name = "total_weight")
    private Double totalWeight; // charcoal

    @Column(name = "weight_undetermined")
    private Double weightUndetermined; // charcoal

    @Column(name = "sample_volume")
    private Double sampleVolume; // liter

    @Column(name = "volume_determination")
    private String volumeDetermination; // dryOrWet

    // Sample dating ----------------------------------------------------------
    // central on Dante
    @ManyToOne
    @JoinColumn(name = "chronozone")
    private Chronozone chronozone;

    @Column(name = "archaeological_dating")
    private String archaeologicalDating;

    @Column(name = "cultural_group")
    private String culturalGroup;

    @Column(name = "absolute_dating_from")
    private Integer absoluteDatingFrom;

    @Column(name = "absolute_dating_to")
    private Integer absoluteDatingTo;

    // Remarks ----------------------------------------------------------------
    @Column(name = "remarks_sample", columnDefinition = "TEXT")
    private String remarksSample;

    // ------------------------------------------------------------------------
    @JsonIgnore
    @OneToMany(mappedBy = "sample")
    private Set<AbsoluteDating> absoluteDatingList;

    @JsonIgnore
    @OneToMany(mappedBy = "sample")
    private Set<Result> resultList;

    @Override
    public boolean equals(Object obj) {
        if (this == obj) return true;
        if (obj == null || getClass() != obj.getClass()) return false;
        Sample sample = (Sample) obj;
        return Objects.equals(id, sample.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }
}
