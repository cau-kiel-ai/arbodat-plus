package arbodat.plus.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.Data;
import java.io.Serializable;
import java.util.Set;

@Data
@Entity
@EntityListeners(VocabularyTermListener.class)
@Table(name = "natural_unit")
public class NaturalUnit implements Serializable {

    @Id
    private String id; // uri

    @Column(name = "label")
    private String label;

    @Column(name = "label_de")
    private String labelDe;

    @Column(name = "label_fr")
    private String labelFr;

    @Column(name = "natural_main_group")
    private String naturalMainGroup;

    @JsonIgnore
    @OneToMany(mappedBy = "naturalUnit")
    private Set<Site> siteList;
}