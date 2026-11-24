package arbodat.plus.service;

import arbodat.plus.model.License;
import arbodat.plus.model.ResearchProject;
import arbodat.plus.repository.LicenseRepository;
import arbodat.plus.repository.ResearchProjectRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class ResearchProjectService {

    @Autowired
    ResearchProjectRepository researchProjectRepository;

    @Autowired
    LicenseRepository licenseRepository;

    @Autowired
    LabelUniqueness labelUniqueness;

    public List<ResearchProject> create(List<ResearchProject> transferredResearchProjectList) {

        List<ResearchProject> researchProjectList = new ArrayList<>();

        for (ResearchProject transferredResearchProject : transferredResearchProjectList) {

            // Handle license
            if (transferredResearchProject.getLicense() != null) {
                License license = licenseRepository.findById(transferredResearchProject.getLicense().getId())
                        .orElseGet(() -> licenseRepository.save(transferredResearchProject.getLicense()));

                transferredResearchProject.setLicense(license);
            }

            ResearchProject researchProject;

            // Create new research project if it doesn't exist,
            if (transferredResearchProject.getId() == null) {
                labelUniqueness.checkResearchProject(transferredResearchProject.getProjectName(), null);
                researchProject = researchProjectRepository.save(transferredResearchProject);

            // else get existing one
            } else {
                researchProject = researchProjectRepository.findById(transferredResearchProject.getId())
                        .orElseThrow(() -> new IllegalArgumentException("invalid research project id: " + transferredResearchProject.getId()));
            }

            researchProjectList.add(researchProject);
        }

        return researchProjectList;
    }

    public List<ResearchProject> getDifference(List<ResearchProject> firstList, List<ResearchProject> secondList) {

        List<UUID> secondListIds = secondList.stream()
                                  .map(ResearchProject::getId)
                                  .toList();

        return firstList.stream()
                .filter(project -> !secondListIds.contains(project.getId()))
                .toList();
    }
}