package arbodat.plus.controller;

import arbodat.plus.model.*;
import arbodat.plus.repository.*;
import arbodat.plus.service.LabelTakenException;
import arbodat.plus.service.LabelUniqueness;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.io.Serializable;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/sites")
public class SiteController implements Serializable {

    @Autowired
    SiteRepository siteRepository;

    @Autowired
    FeatureRepository featureRepository;

    @Autowired
    InstitutionRepository institutionRepository;

    @Autowired
    SiteTypeRepository siteTypeRepository;

    @Autowired
    TaxonomyRepository taxonomyRepository;

    @Autowired
    NaturalUnitRepository naturalUnitRepository;

    @Autowired
    CoordinateSystemRepository coordinateSystemRepository;

    @Autowired
    LiteratureRepository literatureRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    LabelUniqueness labelUniqueness;

    @GetMapping
    public List<Site> getAllSites() {
        return siteRepository.findAll();
    }

    @PostMapping
    public String create(@RequestPart Site transferredSite,
                         @RequestPart List<Institution> institutionList) {

        // Label must be unique within each research project of the site (before anything is saved)
        labelUniqueness.checkSite(transferredSite.getLabel(), transferredSite.getResearchProjectList(), null);

        // Handle coordinate
        if (transferredSite.getCoordinate() != null && transferredSite.getCoordinate().getCoordinateSystem() != null) {
            CoordinateSystem coordinateSystem = coordinateSystemRepository.findById(transferredSite.getCoordinate().getCoordinateSystem().getId())
                    .orElseGet(() -> coordinateSystemRepository.save(transferredSite.getCoordinate().getCoordinateSystem()));

            transferredSite.getCoordinate().setCoordinateSystem(coordinateSystem);
        }

        // Handle institutions --------------------------------------
        Set<Institution> institutions = new HashSet<>();

        for (Institution institution : institutionList) {
            UUID institutionId = institution.getId();
            // Create if it does not yet exist
            if (institutionId == null) {
                Institution newInstitution = institutionRepository.save(institution);
                institutions.add(newInstitution);
            } else {
                Institution existingInstitution = institutionRepository.findById(institutionId).
                        orElseThrow(() -> new IllegalArgumentException("invalid institution id: " + institutionId));
                institutions.add(existingInstitution);
            }
        }
        transferredSite.setInstitutionList(institutions);
        // ----------------------------------------------------------

        // Handle natural unit
        if (transferredSite.getNaturalUnit() != null && transferredSite.getNaturalUnit().getId() != null) {
            NaturalUnit naturalUnit = naturalUnitRepository.findById(transferredSite.getNaturalUnit().getId())
                    .orElseGet(() -> naturalUnitRepository.save(transferredSite.getNaturalUnit()));

            transferredSite.setNaturalUnit(naturalUnit);
        }


        // Handle taxonomy
        if (transferredSite.getTaxonomy() != null && transferredSite.getTaxonomy().getId() != null) {
            Taxonomy taxonomy = taxonomyRepository.findById(transferredSite.getTaxonomy().getId())
                    .orElseGet(() -> taxonomyRepository.save(transferredSite.getTaxonomy()));

            transferredSite.setTaxonomy(taxonomy);
        }

        // Handle site types -------------------------------------------
        Set<SiteType> transferredSiteTypeList = transferredSite.getSiteTypeList();
        Set<SiteType> siteTypeList = new HashSet<>();

        for (SiteType transferredSiteType : transferredSiteTypeList) {
            SiteType siteType = siteTypeRepository.findById(transferredSiteType.getId())
                    .orElseGet(() -> siteTypeRepository.save(transferredSiteType));

            siteTypeList.add(siteType);
        }

        transferredSite.setSiteTypeList(siteTypeList);
        // ------------------------------------------------------------

        siteRepository.save(transferredSite);

        // Handle reference literature
        for (Literature transferredLiterature : transferredSite.getLiteratureList()) {
            Literature literature = literatureRepository.findById(transferredLiterature.getId())
                    .orElseThrow(() -> new IllegalArgumentException("invalid literature id: " + transferredLiterature.getId()));

            literature.getSiteList().add(transferredSite);
            literatureRepository.save(literature);
        }
        return "site is created";
    }

    @PutMapping("/{siteId}")
    public String update(@RequestBody Site transferredSite,
                         @PathVariable UUID siteId) {

        Site site = siteRepository.findById(siteId)
                .orElseThrow(() -> new IllegalArgumentException("invalid site id: " + siteId));

        // Label must be unique within each (new) research project of the site
        labelUniqueness.checkSite(transferredSite.getLabel(), transferredSite.getResearchProjectList(), siteId);

        // update attributes
        site.setLabel(transferredSite.getLabel());
        site.setActivityNumbers(transferredSite.getActivityNumbers());
        site.setLabel(transferredSite.getLabel());
        site.setLabelAbbreviation(transferredSite.getLabelAbbreviation());
        site.setSiteNumber(transferredSite.getSiteNumber());
        site.setUndisturbed(transferredSite.getUndisturbed());
        site.setRemarksSite(transferredSite.getRemarksSite());
        site.setSiteTypeUncertain(transferredSite.getSiteTypeUncertain());

        site.setAddress(transferredSite.getAddress());
        site.setCoordinate(transferredSite.getCoordinate());

        site.setSiteDirectors(transferredSite.getSiteDirectors());
        site.setArchaeologists(transferredSite.getArchaeologists());
        site.setBotanists(transferredSite.getBotanists());

        site.setResearchProjectList(transferredSite.getResearchProjectList());

        site.setInstitutionList(transferredSite.getInstitutionList());

        // Handle natural unit
        if (transferredSite.getNaturalUnit() != null && transferredSite.getNaturalUnit().getId() != null) {
            NaturalUnit naturalUnit = naturalUnitRepository.findById(transferredSite.getNaturalUnit().getId())
                    .orElseGet(() -> naturalUnitRepository.save(transferredSite.getNaturalUnit()));

            site.setNaturalUnit(naturalUnit);
        } else {
            site.setNaturalUnit(null);
        }

        // Handle taxonomy
        if (transferredSite.getTaxonomy() != null && transferredSite.getTaxonomy().getId() != null) {
            Taxonomy taxonomy = taxonomyRepository.findById(transferredSite.getTaxonomy().getId())
                    .orElseGet(() -> taxonomyRepository.save(transferredSite.getTaxonomy()));

            site.setTaxonomy(taxonomy);
        } else {
            site.setTaxonomy(null);
        }

        // Handle site types -------------------------------------------
        Set<SiteType> siteTypeList = new HashSet<>();

        for (SiteType transferredSiteType : transferredSite.getSiteTypeList()) {
            SiteType siteType = siteTypeRepository.findById(transferredSiteType.getId())
                    .orElseGet(() -> siteTypeRepository.save(transferredSiteType));

            siteTypeList.add(siteType);
        }

        site.setSiteTypeList(siteTypeList);
        // ------------------------------------------------------------

        siteRepository.save(site);

        // Handle reference literature --------------------------------
        // remove old
        for (Literature oldLiterature : site.getLiteratureList()) {
            Literature literature = literatureRepository.findById(oldLiterature.getId())
                    .orElseThrow(() -> new IllegalArgumentException("invalid literature id: " + oldLiterature.getId()));

            literature.getSiteList().remove(site);
            literatureRepository.save(literature);
        }
        // add new
        for (Literature transferredLiterature : transferredSite.getLiteratureList()) {
            Literature literature = literatureRepository.findById(transferredLiterature.getId())
                    .orElseThrow(() -> new IllegalArgumentException("invalid literature id: " + transferredLiterature.getId()));

            literature.getSiteList().add(transferredSite);
            literatureRepository.save(literature);
        } // ----------------------------------------------------------

        return "site is updated";
    }

    @DeleteMapping("/{siteId}")
    public String delete(@PathVariable UUID siteId) {

        // Get site
        Site site = siteRepository.findById(siteId)
                .orElseThrow(() -> new IllegalArgumentException("invalid site id: " + siteId));

        // Delete references
        for (Feature referencedFeature : site.getFeatureList()) {
            referencedFeature.setSite(null);
            featureRepository.save(referencedFeature);
        }
        for (Literature referencedLiterature : site.getLiteratureList()) {
            Literature literature = literatureRepository.findById(referencedLiterature.getId())
                    .orElseThrow(() -> new IllegalArgumentException("invalid literature id: " + referencedLiterature.getId()));

            literature.getSiteList().remove(site);
            literatureRepository.save(literature);
        }

        siteRepository.delete(site);
        return "site is deleted";
    }

    @PutMapping("/{siteId}/updateSiteTypes")
    public String updateSiteTypes(@RequestBody  List<SiteType> transferredSiteTypeList,
                                  @PathVariable UUID siteId) {

        Site site = siteRepository.findById(siteId)
                .orElseThrow(() -> new IllegalArgumentException("invalid site id: " + siteId));

        Set<SiteType> siteTypeList = site.getSiteTypeList();

        for (SiteType transferredSiteType : transferredSiteTypeList) {
            SiteType siteType = siteTypeRepository.findById(transferredSiteType.getId())
                    .orElseGet(() -> siteTypeRepository.save(transferredSiteType));

            siteTypeList.add(siteType);
        }

        site.setSiteTypeList(siteTypeList);

        siteRepository.save(site);

        return "site is updated with new siteTypes";
    }

    @PutMapping("/{siteId}/updateNaturalUnit")
    public String updateNaturalUnit(@RequestBody  NaturalUnit transferredNaturalUnit,
                                    @PathVariable UUID siteId) {

        Site site = siteRepository.findById(siteId)
                .orElseThrow(() -> new IllegalArgumentException("invalid site id: " + siteId));


        NaturalUnit naturalUnit = naturalUnitRepository.findById(transferredNaturalUnit.getId())
                .orElseGet(() -> naturalUnitRepository.save(transferredNaturalUnit));

        site.setNaturalUnit(naturalUnit);

        siteRepository.save(site);

        return "site is updated with new naturalUnit";
    }

    @PutMapping("/{siteId}/updateUsers/{role}")
    public String updateUsers(@RequestBody  List<UUID> employeeIds,
                                  @PathVariable UUID       siteId,
                                  @PathVariable String     role        ) {

        // Get site
        Site site = siteRepository.findById(siteId)
                .orElseThrow(() -> new IllegalArgumentException("invalid site id: " + siteId));

        // Handle employeeIds -> get users and create user set
        Set<User> employeeList = new HashSet<>();
        for (UUID employeeId : employeeIds) {
            User employee = userRepository.findById(employeeId)
                    .orElseThrow(() -> new IllegalArgumentException("invalid employee id: " + employeeId));
            employeeList.add(employee);
        }

        switch (role) {
            case "siteDirector" -> {
                site.setSiteDirectors(employeeList);
                siteRepository.save(site);
                return "site is updated with new siteDirector(s)";
            }
            case "archaeologist" -> {
                site.setArchaeologists(employeeList);
                siteRepository.save(site);
                return "site is updated with new archaeologist(s)";
            }
            case "botanist" -> {
                site.setBotanists(employeeList);
                siteRepository.save(site);
                return "site is updated with new botanist(s)";
            }
            default -> {
                return "invalid role: " + role;
            }
        }
    }

    @ExceptionHandler(LabelTakenException.class)
    public ResponseEntity<String> handleLabelTaken(LabelTakenException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(e.getMessage());
    }
}
