package arbodat.plus.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.Data;

import java.io.Serializable;
import java.util.Set;

@Data
@Entity
@EntityListeners(VocabularyTermListener.class)
@Table(name = "dating_method")
public class DatingMethod implements Serializable {

    @Id
    private String id; // uri

    @Column(name = "label")
    private String label;

    @Column(name = "label_de")
    private String labelDe;

    @Column(name = "label_fr")
    private String labelFr;

    @JsonIgnore
    @OneToMany(mappedBy = "datingMethod")
    private Set<AbsoluteDating> absoluteDatingList;
}
