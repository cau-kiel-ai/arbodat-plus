package arbodat.plus.model;

import jakarta.persistence.*;
import lombok.Data;

import java.io.Serializable;
import java.util.HashSet;
import java.util.Set;

/* Default value(s) preselected in the input forms; one row per select field (field_key).
 * The values are DANTE uris, stored as plain strings (no FK to the lookup tables). */
@Data
@Entity
@Table(name = "default_value")
public class DefaultValue implements Serializable {

    @Id
    @Column(name = "field_key")
    private String fieldKey;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "default_value_ids", joinColumns = @JoinColumn(name = "field_key"))
    @Column(name = "value_id")
    private Set<String> valueIds = new HashSet<>();
}
