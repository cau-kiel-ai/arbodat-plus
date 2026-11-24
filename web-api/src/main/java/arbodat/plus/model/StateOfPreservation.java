package arbodat.plus.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.Data;

import java.util.Set;

@Data
@Entity
@EntityListeners(VocabularyTermListener.class)
@Table(name = "state_of_preservation")
public class StateOfPreservation {

    @Id
    private String id; // uri

    @Column(name = "label")
    private String label;

    @Column(name = "label_de")
    private String labelDe;

    @Column(name = "label_fr")
    private String labelFr;

    @JsonIgnore
    @OneToMany(mappedBy = "stateOfPreservation")
    private Set<Result> resultList;
}
