package arbodat.plus.model;

import jakarta.persistence.*;
import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/* Custom order of the options of a hierarchical select field; one row per select field (field_key).
 * The values are DANTE uris in tree order (parent followed by its children), stored as plain strings. */
@Data
@Entity
@Table(name = "display_order")
public class DisplayOrder implements Serializable {

    @Id
    @Column(name = "field_key")
    private String fieldKey;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "display_order_ids", joinColumns = @JoinColumn(name = "field_key"))
    @OrderColumn(name = "position")
    @Column(name = "value_id")
    private List<String> valueIds = new ArrayList<>();
}
