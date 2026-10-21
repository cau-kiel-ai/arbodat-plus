package arbodat.plus.model;

import com.fasterxml.jackson.annotation.JsonIdentityInfo;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.ObjectIdGenerators;
import jakarta.persistence.*;
import lombok.Data;
import java.io.Serializable;
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Data
@Entity
@Table(name = "site")
public class Site implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "activity_number")
    private String activityNumber;

    @Column (name = "site_label")
    private String label;

    @Column(name = "site_label_abbreviation")
    private String labelAbbreviation;

    @Column(name = "site_number")
    private String siteNumber;

    @Column(name = "site_condition_undisturbed")
    private Boolean undisturbed;

    @Column (name = "remarks_site", columnDefinition = "TEXT")
    private String remarksSite;

    @OneToOne(cascade = CascadeType.ALL, orphanRemoval = true)
    @JoinColumn(name = "address")
    private Address address;

    @OneToOne(cascade = CascadeType.ALL, orphanRemoval = true)
    @JoinColumn(name = "coordinate")
    private Coordinate coordinate;

    // Team ----------------------------------------------------
    @ManyToMany
    @JoinTable(name = "site_directors",
            joinColumns = @JoinColumn(name = "site_id"),
            inverseJoinColumns = @JoinColumn(name = "user_id")
    )
    private Set<User> siteDirectors;

    @ManyToMany
    @JoinTable(name = "archaeologists",
            joinColumns = @JoinColumn(name = "site_id"),
            inverseJoinColumns = @JoinColumn(name = "user_id")
    )
    private Set<User> archaeologists;

    @ManyToMany
    @JoinTable(name = "botanists",
            joinColumns = @JoinColumn(name = "site_id"),
            inverseJoinColumns = @JoinColumn(name = "user_id")
    )
    private Set<User> botanists;
    // --------------------------------------------------------------

    @ManyToMany
    @JoinTable(name = "site_research_project_relation",
            joinColumns = @JoinColumn(name = "site_id"),
            inverseJoinColumns = @JoinColumn(name = "research_project_id")
    )
    @JsonIgnoreProperties("siteList")
    private Set<ResearchProject> researchProjectList = new HashSet<>();

    @JsonIgnore
    @OneToMany(mappedBy = "site")
    private Set<Feature> featureList;

    @ManyToMany
    @JoinTable(name = "institutions",
            joinColumns = @JoinColumn(name = "site_id"),
            inverseJoinColumns = @JoinColumn(name = "institution_id")
    )
    private Set<Institution> institutionList;

    @ManyToMany(mappedBy = "siteList")
    @JsonIgnoreProperties("siteList")
    private Set<Literature> literatureList;

    // central on Dante -------------------------------------------
    @ManyToOne
    @JoinColumn(name = "taxonomy")
    private Taxonomy taxonomy;

    @ManyToOne
    @JoinColumn(name = "natural_unit")
    private NaturalUnit naturalUnit;

    @ManyToMany
    @JoinTable(name = "site_type_relation",
            joinColumns = @JoinColumn(name = "site_id"),
            inverseJoinColumns = @JoinColumn(name = "site_type_id")
    )
    private Set<SiteType> siteTypeList = new HashSet<>();
    // ------------------------------------------------------------

    @Column (name = "site_type_uncertain")
    private Boolean siteTypeUncertain;

    @Override
    public boolean equals(Object obj) {
        if (this == obj) return true;
        if (obj == null || getClass() != obj.getClass()) return false;
        Site site = (Site) obj;
        return Objects.equals(id, site.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }
}

