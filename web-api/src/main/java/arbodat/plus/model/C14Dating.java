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
@Table(name = "c14_dating",
        uniqueConstraints = @UniqueConstraint(name = "uk_c14_dating_laboratory_number", columnNames = {"c14_laboratory", "number"}))
public class C14Dating implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "c14_age_bp")
    private Integer c14AgeBp;

    @Column(name = "c14_std_dev")
    private Integer c14StdDev;

    @Column(name = "c14_calibration_bc_ad_2s")
    private String c14CalibrationBcAd2s;

    @Column(name = "delta_c13")
    private Double deltaC13;

    @Column(name = "delta_c13_uncertainty")
    private Double deltaC13Uncertainty;

    @Column(name = "pmc")
    private Double pmc;

    @Column(name = "pmc_uncertainty")
    private Double pmcUncertainty;

    // lab_code + number -------------------
    // central on Dante
    @ManyToOne (cascade = CascadeType.MERGE)
    @JoinColumn(name = "c14_laboratory")
    private C14Laboratory c14Laboratory;

    @Column(name = "number")
    private String number;
    // -------------------------------------

    @OneToOne(mappedBy = "c14Dating")
    @JsonIgnore
    private AbsoluteDating absoluteDating;
}
