package arbodat.plus.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.Data;

import java.io.Serializable;
import java.util.Set;

@Data
@Entity
@EntityListeners(VocabularyTermListener.class)
@Table(name = "coordinate_system")
public class CoordinateSystem implements Serializable {

    @Id
    private String id; // uri

    @Column(name = "label")
    private String label;

    @Column(name = "epsg")
    private String epsg;

    @JsonIgnore
    @OneToMany(mappedBy = "coordinateSystem")
    private Set<Coordinate> coordinateList;
}
