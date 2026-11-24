package arbodat.plus.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.Data;

import java.util.Set;

@Data
@Entity
@EntityListeners(VocabularyTermListener.class)
@Table(name = "sample_type")
public class SampleType {

    @Id
    private String id; // uri

    @Column(name = "label")
    private String label;

    @Column(name = "label_de")
    private String labelDe;

    @Column(name = "label_fr")
    private String labelFr;

    @JsonIgnore
    @OneToMany(mappedBy = "sampleType")
    private Set<Sample> sampleList;
}
