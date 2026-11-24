package arbodat.plus.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.Data;

import java.util.Set;

@Data
@Entity
@EntityListeners(VocabularyTermListener.class)
@Table(name = "sample_investigated")
public class SampleInvestigated {

    @Id
    private String id; // uri

    @Column(name = "label")
    private String label;

    @Column(name = "label_de")
    private String labelDe;

    @Column(name = "label_fr")
    private String labelFr;

    @JsonIgnore
    @OneToMany(mappedBy = "seedsAndFruits")
    private Set<Sample> SampleSeedsAndFruitsList;

    @JsonIgnore
    @OneToMany(mappedBy = "charcoalInvestigated")
    private Set<Sample> SampleCharcoalInvestigatedList;

    @JsonIgnore
    @OneToMany(mappedBy = "woodSubfossile")
    private Set<Sample> SampleWoodSubfossileList;
}
