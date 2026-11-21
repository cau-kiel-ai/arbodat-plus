package arbodat.plus.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.Data;

import java.io.Serializable;
import java.util.UUID;

@Data
@Entity
// A laboratory number identifies one dating: unique per laboratory (rows without laboratory or
// number don't count). LabNumberConstraints adds it to databases that had duplicates before.
@Table(name = "other_dating",
        uniqueConstraints = @UniqueConstraint(name = "uk_other_dating_laboratory_number", columnNames = {"laboratory", "number"}))
public class OtherDating implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "age_divers")
    private String ageDivers;

    // laboratory_label + number -------------
    @ManyToOne
    @JoinColumn(name = "laboratory")
    private Laboratory laboratory;

    @Column(name = "number")
    private String number;
    // ---------------------------------------

    @OneToOne(mappedBy = "otherDating")
    @JsonIgnore
    private AbsoluteDating absoluteDating;
}
