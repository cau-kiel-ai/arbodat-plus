package arbodat.plus.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.Data;

import java.io.Serializable;
import java.util.Set;

@Data
@Entity
@EntityListeners(VocabularyTermListener.class)
@Table(name = "c14_laboratory")
public class C14Laboratory implements Serializable {

    @Id
    private String id; // uri

    @Column(name = "label")
    private String label;

    @Column(name = "notation")
    private String notation;

    @JsonIgnore
    @OneToMany(mappedBy = "c14Laboratory")
    private Set<C14Dating> c14DatingList;
}
