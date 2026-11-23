package arbodat.plus.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;
import jakarta.persistence.*;
import java.io.Serializable;
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Data
@Entity
// A project name is unique (exact; ignoring case is checked by LabelUniqueness)
@Table(name = "research_project",
        uniqueConstraints = @UniqueConstraint(name = ResearchProject.UNIQUE_NAME, columnNames = {"project_name"}))
public class ResearchProject implements Serializable {

    public static final String UNIQUE_NAME = "uk_research_project_name";

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "project_name")
    private String projectName;

    @Column(name = "funder")
    private String funder;

    @Column (name = "authorisation_number")
    private String authorisationNumber;

    // central on Dante
    @ManyToOne(cascade = CascadeType.MERGE)
    @JoinColumn(name = "license")
    private License license;

    @ManyToMany(mappedBy = "researchProjectList")
    @JsonIgnoreProperties("researchProjectList")
    private Set<Site> siteList = new HashSet<>();

    @Override
    public boolean equals(Object obj) {
        if (this == obj) return true;
        if (obj == null || getClass() != obj.getClass()) return false;
        ResearchProject researchProject = (ResearchProject) obj;
        return Objects.equals(id, researchProject.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }
}
