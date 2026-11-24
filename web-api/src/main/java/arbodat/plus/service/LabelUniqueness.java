package arbodat.plus.service;

import arbodat.plus.model.ResearchProject;
import arbodat.plus.model.Site;
import arbodat.plus.repository.AbsoluteDatingRepository;
import arbodat.plus.repository.FeatureRepository;
import arbodat.plus.repository.ResearchProjectRepository;
import arbodat.plus.repository.SampleRepository;
import arbodat.plus.repository.SiteRepository;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.HashSet;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Checks that a label is unique before a research project, site, feature, sample or absolute dating is
 * created or changed: a project name overall, a site label within each of its research projects, a feature label within its site, a sample label within
 * its feature and a sub-sample within its sample - ignoring letter case, as the keys of ArboDat 2018.
 * The database backs this with unique constraints on the exact labels (see the entities and LabelConstraints).
 *
 * <p>'self' is the id of the record being changed (null when creating), it doesn't count as duplicate.
 * Without label or parent there is nothing to check.
 */
@Service
public class LabelUniqueness {

    private final SiteRepository siteRepository;
    private final FeatureRepository featureRepository;
    private final SampleRepository sampleRepository;
    private final AbsoluteDatingRepository absoluteDatingRepository;
    private final ResearchProjectRepository researchProjectRepository;

    public LabelUniqueness(SiteRepository siteRepository, FeatureRepository featureRepository,
                           SampleRepository sampleRepository, AbsoluteDatingRepository absoluteDatingRepository,
                           ResearchProjectRepository researchProjectRepository) {
        this.researchProjectRepository = researchProjectRepository;
        this.siteRepository = siteRepository;
        this.featureRepository = featureRepository;
        this.sampleRepository = sampleRepository;
        this.absoluteDatingRepository = absoluteDatingRepository;
    }

    public void checkResearchProject(String projectName, UUID self) {
        if (isBlank(projectName)) return;
        boolean taken = researchProjectRepository.findByProjectNameIgnoreCase(projectName).stream()
                .anyMatch(researchProject -> !researchProject.getId().equals(self));
        if (taken) {
            throw new LabelTakenException("Research project '" + projectName + "' already exists.");
        }
    }

    public void checkSite(String label, Collection<ResearchProject> researchProjects, UUID self) {
        if (isBlank(label) || researchProjects == null || researchProjects.isEmpty()) return;
        Set<UUID> researchProjectIds = researchProjects.stream()
                .map(ResearchProject::getId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        if (researchProjectIds.isEmpty()) return;
        boolean taken = siteRepository.findAlreadyExisting(label, researchProjectIds).stream()
                .anyMatch(site -> !site.getId().equals(self));
        if (taken) {
            throw new LabelTakenException("Site '" + label + "' already exists in this research project.");
        }
    }

    // The sites of a research project (e.g. after changing its site list) must have different labels
    public void checkSitesOfResearchProject(Collection<Site> sites) {
        Set<String> labels = new HashSet<>();
        for (Site site : sites) {
            if (!isBlank(site.getLabel()) && !labels.add(site.getLabel().toLowerCase(Locale.ROOT))) {
                throw new LabelTakenException("Site '" + site.getLabel() + "' would exist twice in this research project.");
            }
        }
    }

    public void checkFeature(String label, UUID siteId, UUID self) {
        if (isBlank(label) || siteId == null) return;
        boolean taken = featureRepository.findBySiteIdAndLabelIgnoreCase(siteId, label).stream()
                .anyMatch(feature -> !feature.getId().equals(self));
        if (taken) {
            throw new LabelTakenException("Feature '" + label + "' already exists in this site.");
        }
    }

    public void checkSample(String label, UUID featureId, UUID self) {
        if (isBlank(label) || featureId == null) return;
        boolean taken = sampleRepository.findByFeatureIdAndLabelIgnoreCase(featureId, label).stream()
                .anyMatch(sample -> !sample.getId().equals(self));
        if (taken) {
            throw new LabelTakenException("Sample '" + label + "' already exists in this feature.");
        }
    }

    public void checkSubSample(String subSample, UUID sampleId, UUID self) {
        if (isBlank(subSample) || sampleId == null) return;
        boolean taken = absoluteDatingRepository.findBySampleIdAndSubSampleIgnoreCase(sampleId, subSample).stream()
                .anyMatch(dating -> !dating.getId().equals(self));
        if (taken) {
            throw new LabelTakenException("Sub-sample '" + subSample + "' already exists in this sample.");
        }
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
