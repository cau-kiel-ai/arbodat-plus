package arbodat.plus.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import lombok.Data;
import java.io.Serializable;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Data
@Entity
@Table(name = "absolute_dating")
public class AbsoluteDating implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    // label
    @Column(name = "sub_sample")
    private String subSample;

    @Column(name = "remarks", columnDefinition = "TEXT")
    private String remarks;

    // central on Dante ---------------
    @ManyToOne
    @JoinColumn(name = "dating_method")
    private DatingMethod datingMethod;

    @ManyToOne
    @JoinColumn(name = "material")
    private Material material;
    // --------------------------------

    @ManyToOne
    @JoinColumn(name = "sample")
    private Sample sample;

    @ManyToMany(mappedBy = "absoluteDatingList")
    @JsonIgnoreProperties("absoluteDatingList")
    private Set<Result> resultList;

    @ManyToMany(mappedBy = "absoluteDatingList")
    private Set<Literature> literatureList;

    // Datings: each belongs to this absolute dating only (one-to-one); one that is replaced is deleted
    // (it would be unreachable, and its laboratory number blocked for good).
    @OneToOne(cascade = CascadeType.ALL, orphanRemoval = true)
    @JoinColumn(name = "c14_dating_id", referencedColumnName = "id")
    private C14Dating c14Dating;

    @OneToOne(cascade = CascadeType.ALL, orphanRemoval = true)
    @JoinColumn(name = "dendrochronological_dating_id", referencedColumnName = "id")
    private DendrochronologicalDating dendrochronologicalDating;

    @OneToOne(cascade = CascadeType.ALL, orphanRemoval = true)
    @JoinColumn(name = "other_dating_id", referencedColumnName = "id")
    private OtherDating otherDating;
    // -----------------------------------------------------------------------------

    @Override
    public boolean equals(Object obj) {
        if (this == obj) return true;
        if (obj == null || getClass() != obj.getClass()) return false;
        AbsoluteDating absoluteDating = (AbsoluteDating) obj;
        return Objects.equals(id, absoluteDating.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }
}
