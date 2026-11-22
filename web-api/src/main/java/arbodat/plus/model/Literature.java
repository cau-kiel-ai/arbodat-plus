package arbodat.plus.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import jakarta.persistence.*;

import java.io.Serializable;
import java.util.Set;
import java.util.UUID;

@Data
@Entity
@Table(name = "literature")
public class Literature implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "doi")
    private String doi;

    @Column(name = "publication_year")
    private Integer publicationYear;

    @Column(name = "title")
    private String title;

    @Column(name = "short_citation")
    private String shortCitation;

    @Column (name = "long_citation")
    private String longCitation;

    @Column(name = "abstract")
    private String litAbstract;

    @ManyToMany(cascade = CascadeType.MERGE)
    @JoinTable(name = "literature_author_relation",
            joinColumns = @JoinColumn(name = "literature_id"),
            inverseJoinColumns = @JoinColumn(name = "author_id")
    )
    @JsonIgnoreProperties("literatureList")
    private Set<Author> authorList;


    @ManyToMany
    @JoinTable(name = "literature_site_relation",
            joinColumns = @JoinColumn(name = "literature_id"),
            inverseJoinColumns = @JoinColumn(name = "site_id")
    )
    @JsonIgnoreProperties("literatureList")
    private Set<Site> siteList;

    @ManyToMany
    @JoinTable(name = "literature_absolute_dating_relation",
            joinColumns = @JoinColumn(name = "literature_id"),
            inverseJoinColumns = @JoinColumn(name = "absolute_dating_id")
    )
    @JsonIgnoreProperties("literatureList")
    // Only written to JSON, never read (datings are linked in the dating update): reading the nested datings
    // could fail ("No _valueDeserializer assigned") -> literature with datings couldn't be saved from the data explorer
    @JsonProperty(access = JsonProperty.Access.READ_ONLY)
    private Set<AbsoluteDating> absoluteDatingList;
}
