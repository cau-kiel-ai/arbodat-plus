package arbodat.plus.controller;

import arbodat.plus.model.*;
import arbodat.plus.repository.InstitutionRepository;
import arbodat.plus.repository.ResearchProjectRepository;
import arbodat.plus.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/users")
public class UserController {

    @Autowired
    UserRepository userRepository;

    @Autowired
    InstitutionRepository institutionRepository;


    @GetMapping
    public List<User> getAllUsers() {
        return userRepository.findAll();
    }

    @PostMapping
    public String create(@RequestPart User user,
                         @RequestPart List<Institution> institutionList) {

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

        user.setInstitutionList(institutions);
        // ----------------------------------------------------------

        userRepository.save(user);
        return "user is created";
    }

    @PutMapping("/{userId}")
    public String update(@RequestPart  User transferredUser,
                         @RequestPart  List<Institution> institutionList,
                         @PathVariable UUID userId) {

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("invalid user id: " + userId));

        // update user attributes
        user.setOrcid(transferredUser.getOrcid());
        user.setFirstName(transferredUser.getFirstName());
        user.setMiddleName(transferredUser.getMiddleName());
        user.setLastName(transferredUser.getLastName());
        user.setMailAddress(transferredUser.getMailAddress());

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

        user.setInstitutionList(institutions);
        // ----------------------------------------------------------

        userRepository.save(user);
        return "user is updated";
    }

    @DeleteMapping("/{userId}")
    public String delete(@PathVariable UUID userId) {

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("invalid user id: " + userId));

        userRepository.delete(user);
        return "user is deleted";
    }
}
