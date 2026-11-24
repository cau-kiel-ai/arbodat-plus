package arbodat.plus.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.Data;

import java.io.Serializable;
import java.util.Set;

@Data
@Entity
@EntityListeners(VocabularyTermListener.class)
@Table(name = "taxCode")
public class TaxCode implements Serializable {

    @Id
    private String id; // uri

    @Column(name = "label")
    private String label;

    @Column(name = "label_de")
    private String labelDe;

    @Column(name = "label_en")
    private String labelEn;

    @Column(name = "label_fr")
    private String labelFr;

    @Column(name = "label_it")
    private String labelIt;

    @Column(name = "taxonomy")
    private String taxonomy;

    @JsonIgnore
    @OneToMany(mappedBy = "taxCode")
    private Set<Result> resultList;
}
