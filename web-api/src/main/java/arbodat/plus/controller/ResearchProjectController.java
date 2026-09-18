package arbodat.plus.controller;
/* Controller (Service class) encapsulates the business logic and interacts with the repository layer. */

import arbodat.plus.model.*;
import arbodat.plus.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.*;

///* enables CORS (cross origin resource sharing) from Frontend (Bootstrap on port 5500)
//* info source: https://spring.io/guides/gs/rest-service-cors */

@RestController
/* includes Controller and ResponseBody annotations for request handling methods (get(),...)
serializes automatically return objects into HttpResponse
@PostMapping and @GetMapping methods will be exposed as Http Endpoints.
Postman -> HTTP GET request -> Controller -> @GetMapping method is invoked
Postman -> HTTP POST request -> Controller -> @PostMapping method is invoked -> creates new object using the model's class
 -> saves object in DB using repository interface */

@RequestMapping("/research_projects")
/* the "/..." address is the API endpoint
the "@..." maps requests to controller methods, e.g. create() */

public class ResearchProjectController {

    @Autowired
    /* annotation-driven dependency injection: resolve and inject collaborating beans (objects) into this bean */
    ResearchProjectRepository researchProjectRepository;

    @Autowired
    LicenseRepository licenseRepository;

    @Autowired
    SiteRepository siteRepository;


    @GetMapping
    public List<ResearchProject> getAllResearchProjects() {
        return researchProjectRepository.findAll();
    }

    @PostMapping
    public String create(@RequestBody ResearchProject transferredResearchProject) {

        // Handle license
        if (transferredResearchProject.getLicense() != null) {
            License license = licenseRepository.findById(transferredResearchProject.getLicense().getId())
                    .orElseGet(() -> licenseRepository.save(transferredResearchProject.getLicense()));

            transferredResearchProject.setLicense(license);
        }

        researchProjectRepository.save(transferredResearchProject);

        return "research project is created";
    }

    @PutMapping("/{researchProjectId}")
    public String update(@RequestBody  ResearchProject transferredResearchProject,
                         @PathVariable UUID researchProjectId) {

        ResearchProject researchProject = researchProjectRepository.findById(researchProjectId)
                .orElseThrow(() -> new IllegalArgumentException("invalid research project id: " + researchProjectId));

        // update attributes
        researchProject.setProjectName(transferredResearchProject.getProjectName());
        researchProject.setFunder(transferredResearchProject.getFunder());
        researchProject.setAuthorisationNumber(transferredResearchProject.getAuthorisationNumber());
        researchProject.setExportFileName(transferredResearchProject.getExportFileName());

        // Handle license
        if (transferredResearchProject.getLicense() != null && transferredResearchProject.getLicense().getId() != null) {
            License license = licenseRepository.findById(transferredResearchProject.getLicense().getId())
                    .orElseGet(() -> licenseRepository.save(transferredResearchProject.getLicense()));

            researchProject.setLicense(license);
        } else {
            researchProject.setLicense(null);
        }

        // Handle siteList -----------------------------------------------
        Set<Site> currentSites = new HashSet<>();
        for (Site currentSite : researchProject.getSiteList()) {
            Site site = siteRepository.findById(currentSite.getId())
                    .orElseThrow(() -> new IllegalArgumentException("invalid site id: " + currentSite.getId()));

            currentSites.add(site);
        }

        Set<Site> updatedSites  = new HashSet<>();
        for (Site transferredSite : transferredResearchProject.getSiteList()) {
            if (transferredSite != null) {
                Site site = siteRepository.findById(transferredSite.getId())
                        .orElseThrow(() -> new IllegalArgumentException("invalid site id: " + transferredSite.getId()));

                updatedSites.add(site);
            }
        }

        // Remove old sites
        for (Site oldSite : new HashSet<>(currentSites)) {
            if (!updatedSites.contains(oldSite)) {
                currentSites.remove(oldSite);
                oldSite.getResearchProjectList().remove(researchProject);
                siteRepository.save(oldSite);
            }
        }

        // Add new sites
        for (Site newSite : updatedSites) {
            currentSites.add(newSite);
            newSite.getResearchProjectList().add(researchProject);
            siteRepository.save(newSite);
        }

        researchProject.setSiteList(currentSites);
        // ---------------------------------------------------------------

        researchProjectRepository.save(researchProject);

        return "research project is updated";
    }

    @DeleteMapping("/{researchProjectId}")
    public String delete(@PathVariable UUID researchProjectId) {

        // Get research project
        ResearchProject researchProject = researchProjectRepository.findById(researchProjectId)
                .orElseThrow(() -> new IllegalArgumentException("invalid research project id: " + researchProjectId));

        // Delete references
        for (Site referencedSite : researchProject.getSiteList()) {
            referencedSite.getResearchProjectList().remove(researchProject);
            siteRepository.save(referencedSite);
        }

        researchProjectRepository.delete(researchProject);
        return "research project is deleted";
    }
}