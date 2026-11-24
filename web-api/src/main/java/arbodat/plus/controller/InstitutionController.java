package arbodat.plus.controller;

import arbodat.plus.model.*;
import arbodat.plus.repository.InstitutionRepository;
import arbodat.plus.repository.SiteRepository;
import arbodat.plus.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/institutions")
public class InstitutionController {

    @Autowired
    InstitutionRepository institutionRepository;

    @Autowired
    SiteRepository siteRepository;

    @Autowired
    UserRepository userRepository;

    @GetMapping
    public List<Institution> getAllInstitutions() {
        return institutionRepository.findAll();
    }

    @PostMapping
    public String create(@RequestBody Institution institution) {
        institutionRepository.save(institution);
        return "institution is created";
    }

    @PutMapping("/{institutionId}")
    public String update(@RequestBody Institution transferredInstitution,
                         @PathVariable UUID institutionId) {

        Institution institution = institutionRepository.findById(institutionId)
                .orElseThrow(() -> new IllegalArgumentException("invalid institution id: " + institutionId));

        // update attributes
        institution.setLabel(transferredInstitution.getLabel());
        institution.setRorId(transferredInstitution.getRorId());

        institutionRepository.save(institution);
        return "institution is updated";
    }

    @DeleteMapping("/{institutionId}")
    public String delete(@PathVariable UUID institutionId) {

        // Get research project
        Institution institution = institutionRepository.findById(institutionId)
                .orElseThrow(() -> new IllegalArgumentException("invalid institution id: " + institutionId));

        // Delete references
        for (Site referencedSite : institution.getSites()) {
            referencedSite.getInstitutionList().remove(institution);
            siteRepository.save(referencedSite);
        }
        for (User referencedUser : institution.getUserList()) {
            referencedUser.getInstitutionList().remove(institution);
            userRepository.save(referencedUser);
        }

        institutionRepository.delete(institution);
        return "institution is deleted";
    }
}

