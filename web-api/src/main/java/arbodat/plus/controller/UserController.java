package arbodat.plus.controller;

import arbodat.plus.dto_migration.BulkItemStatus;
import arbodat.plus.dto_migration.BulkUserItem;
import arbodat.plus.model.*;
import arbodat.plus.repository.InstitutionRepository;
import arbodat.plus.repository.ResearchProjectRepository;
import arbodat.plus.repository.UserRepository;
import arbodat.plus.service.TeamMigrationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/users")
public class UserController {

    private static final Logger log = LoggerFactory.getLogger(UserController.class);

    @Autowired
    TeamMigrationService teamMigrationService;

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

    /**
     * Sets the users of many site roles / samples (team accordion of the migration).
     * Every item gets its own status ("updated" or "error"), so one bad row doesn't stop the others.
     */
    @PutMapping("/assignments/bulk")
    public List<BulkItemStatus> assignAll(@RequestBody List<BulkUserItem> items) {
        try {
            return teamMigrationService.assignAll(items);
        } catch (DataAccessException e) {
            // The transaction is rolled back -> none of the items is updated
            log.error("Bulk update of the team failed", e);
            String message = e.getMostSpecificCause().getMessage();
            return items.stream()
                    .map(item -> BulkItemStatus.error(item.getClientId(), message))
                    .toList();
        }
    }
}
