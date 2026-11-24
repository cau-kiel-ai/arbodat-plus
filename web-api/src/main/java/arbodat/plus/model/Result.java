package arbodat.plus.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import lombok.Data;
import java.io.Serializable;
import java.util.Date;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Data
@Entity
// A result is unique within its sample by sample, tax code, org / min, sieve size, fraction analyzed, cf,
// rest type and state of preservation (see ResultKey). The unique index treats empty values as equal
// (NULLS NOT DISTINCT), which Hibernate can't create from the entity: ResultConstraints adds it at start.
@Table(name = "result")
public class Result implements Serializable {

    public static final String UNIQUE_KEY = "uk_result_key";

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "entry_date")
    private Date entryDate;

    // Fraction analyzed ----------------
    @Column(name = "fraction_analyzed")
    private String fractionAnalyzed;

    @Column(name = "org_or_min")
    private String orgOrMin;

    @Column(name = "sieve_size")
    private Double sieveSize;

    @Column(name = "multiplier")
    private Double multiplier;
    // ----------------------------------

    @Column(name = "rest_count")
    private Integer restCount;

    @Column(name = "rest_fragment")
    private Integer restFragment;

    @Column(name = "rest_weight")
    private Double restWeight;

    @Column(name = "estimation")
    private Boolean estimation;

    // central on Dante -----------------------------
    @ManyToOne
    @JoinColumn(name = "tax_code")
    private TaxCode taxCode;

    // central on Dante
    @ManyToOne
    @JoinColumn(name = "classification_confer")
    private ClassificationConfer classificationConfer;

    // central on Dante
    @ManyToOne
    @JoinColumn(name = "rest_type")
    private RestType restType;

    // central on Dante
    @ManyToOne
    @JoinColumn(name = "state_of_preservation")
    private StateOfPreservation stateOfPreservation;
    // ----------------------------------------------

    @Column(name = "remarks_taxonomy", columnDefinition = "TEXT")
    private String remarksTaxonomy;

    @ManyToOne
    @JoinColumn(name = "sample")
    private Sample sample;

    @ManyToMany
    @JoinTable(name = "result_absolute_dating_relation",
               joinColumns = @JoinColumn(name = "result_id"),
               inverseJoinColumns = @JoinColumn(name = "absolute_dating_id"))
    @JsonIgnoreProperties("resultList")
    private Set<AbsoluteDating> absoluteDatingList;

    @Override
    public boolean equals(Object obj) {
        if (this == obj) return true;
        if (obj == null || getClass() != obj.getClass()) return false;
        Result result = (Result) obj;
        return Objects.equals(id, result.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }
}
