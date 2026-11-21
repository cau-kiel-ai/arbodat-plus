package arbodat.plus.controller;

import arbodat.plus.model.*;
import arbodat.plus.repository.*;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/absolute_datings")
public class AbsoluteDatingController {

    @Autowired
    AbsoluteDatingRepository absoluteDatingRepository;

    @Autowired
    LiteratureRepository literatureRepository;

    @Autowired
    DatingMethodRepository datingMethodRepository;

    @Autowired
    MaterialRepository materialRepository;

    @Autowired
    LaboratoryRepository laboratoryRepository;

    @Autowired
    C14LaboratoryRepository c14LaboratoryRepository;

    @Autowired
    ResultRepository resultRepository;

    @Autowired
    C14DatingRepository c14DatingRepository;

    @Autowired
    DendrochronologicalDatingRepository dendrochronologicalDatingRepository;

    @Autowired
    OtherDatingRepository otherDatingRepository;

    @GetMapping
    public List<AbsoluteDating> getAllAbsoluteDatings() {
        return absoluteDatingRepository.findAll();
    }

    @PostMapping
    public String create(@RequestBody AbsoluteDating transferredAbsoluteDating) {

        // Handle material
        if (transferredAbsoluteDating.getMaterial() != null) {
            Material material = materialRepository.findById(transferredAbsoluteDating.getMaterial().getId())
                    .orElseGet(() -> materialRepository.save(transferredAbsoluteDating.getMaterial()));

            transferredAbsoluteDating.setMaterial(material);
        }

        // Handle datingMethod
        if (transferredAbsoluteDating.getDatingMethod() != null) {
            DatingMethod datingMethod = datingMethodRepository.findById(transferredAbsoluteDating.getDatingMethod().getId())
                    .orElseGet(() -> datingMethodRepository.save(transferredAbsoluteDating.getDatingMethod()));

            transferredAbsoluteDating.setDatingMethod(datingMethod);

            // Dendro dating
            if (transferredAbsoluteDating.getDatingMethod().getLabel().equals("Dendrochronology")) {
                if (transferredAbsoluteDating.getDendrochronologicalDating().getLaboratory() != null) {
                    Laboratory lab;
                    if (transferredAbsoluteDating.getDendrochronologicalDating().getLaboratory().getId() != null) {
                        lab = laboratoryRepository.findById(transferredAbsoluteDating.getDendrochronologicalDating().getLaboratory().getId())
                                .orElseThrow(() -> new IllegalArgumentException("invalid laboratory id: " + transferredAbsoluteDating.getDendrochronologicalDating().getLaboratory().getId()));
                    } else {
                        lab = laboratoryRepository.save(transferredAbsoluteDating.getDendrochronologicalDating().getLaboratory());
                    }
                    transferredAbsoluteDating.getDendrochronologicalDating().setLaboratory(lab);
                }
            }

            // C14 dating
            else if (transferredAbsoluteDating.getDatingMethod().getLabel().equals("Radiocarbon Dating")) {
                if (transferredAbsoluteDating.getC14Dating().getC14Laboratory() != null) {
                    C14Laboratory c14Lab = c14LaboratoryRepository.findById(transferredAbsoluteDating.getC14Dating().getC14Laboratory().getId())
                            .orElseGet(() -> c14LaboratoryRepository.save(transferredAbsoluteDating.getC14Dating().getC14Laboratory()));
                    transferredAbsoluteDating.getC14Dating().setC14Laboratory(c14Lab);
                }
            }

            // Other dating
            else {
                if (transferredAbsoluteDating.getOtherDating().getLaboratory() != null) {
                    Laboratory lab;
                    if (transferredAbsoluteDating.getOtherDating().getLaboratory().getId() != null) {
                        lab = laboratoryRepository.findById(transferredAbsoluteDating.getOtherDating().getLaboratory().getId())
                                .orElseThrow(() -> new IllegalArgumentException("invalid laboratory id: " + transferredAbsoluteDating.getOtherDating().getLaboratory().getId()));
                    } else {
                        lab = laboratoryRepository.save(transferredAbsoluteDating.getOtherDating().getLaboratory());
                    }
                    transferredAbsoluteDating.getOtherDating().setLaboratory(lab);
                }
            }
        }

        checkLaboratoryNumbers(transferredAbsoluteDating);
        AbsoluteDating absoluteDating = absoluteDatingRepository.save(transferredAbsoluteDating);

        // Handle reference literature
        for (Literature transferredLiterature : transferredAbsoluteDating.getLiteratureList()) {
            Literature literature = literatureRepository.findById(transferredLiterature.getId())
                    .orElseThrow(() -> new IllegalArgumentException("invalid literature id: " + transferredLiterature.getId()));

            literature.getAbsoluteDatingList().add(absoluteDating);
            literatureRepository.save(literature);
        }

        return "absolute dating is created";
    }

    // Resolves a transferred laboratory: existing lab by id, new lab (label only) is saved, no lab -> null
    private Laboratory resolveLaboratory(Laboratory transferredLab) {
        if (transferredLab == null) return null;
        if (transferredLab.getId() != null) {
            return laboratoryRepository.findById(transferredLab.getId())
                    .orElseThrow(() -> new IllegalArgumentException("invalid laboratory id: " + transferredLab.getId()));
        }
        if (transferredLab.getLabel() == null || transferredLab.getLabel().isBlank()) return null;
        return laboratoryRepository.save(transferredLab);
    }

    @PutMapping("/{absoluteDatingId}")
    public String update(@RequestBody  AbsoluteDating transferredAbsoluteDating,
                         @PathVariable UUID           absoluteDatingId)
    {
        AbsoluteDating absoluteDating = absoluteDatingRepository.findById(absoluteDatingId)
                .orElseThrow(() -> new IllegalArgumentException("invalid absoluteDating id: " + absoluteDatingId));

        // Update attributes
        absoluteDating.setSubSample(transferredAbsoluteDating.getSubSample());
        absoluteDating.setRemarks(transferredAbsoluteDating.getRemarks());
        absoluteDating.setSample(transferredAbsoluteDating.getSample());

        // Handle reference literature ---------------------------------------------
        // Remove absolute dating reference in old literature
        for (Literature oldLiterature : absoluteDating.getLiteratureList()) {
            oldLiterature.getAbsoluteDatingList().remove(absoluteDating);
        }
        // Add absolute dating reference to new literature
        Set<Literature> literatureList = new HashSet<>();
        for (Literature transferredLiterature : transferredAbsoluteDating.getLiteratureList()) {
            Literature literature = literatureRepository.findById(transferredLiterature.getId())
                    .orElseThrow(() -> new IllegalArgumentException("invalid literature id: " + transferredLiterature.getId()));

            literature.getAbsoluteDatingList().add(absoluteDating);
            literatureList.add(literature);
        }
        absoluteDating.setLiteratureList(literatureList);
        // -------------------------------------------------------------------------

        // Handle material
        if (transferredAbsoluteDating.getMaterial() != null && transferredAbsoluteDating.getMaterial().getId() != null) {
            Material material = materialRepository.findById(transferredAbsoluteDating.getMaterial().getId())
                    .orElseGet(() -> materialRepository.save(transferredAbsoluteDating.getMaterial()));

            absoluteDating.setMaterial(material);
        } else {
            absoluteDating.setMaterial(null);
        }

        // Handle datingMethod
        if (transferredAbsoluteDating.getDatingMethod() != null && transferredAbsoluteDating.getDatingMethod().getId() != null) {
            DatingMethod datingMethod = datingMethodRepository.findById(transferredAbsoluteDating.getDatingMethod().getId())
                    .orElseGet(() -> datingMethodRepository.save(transferredAbsoluteDating.getDatingMethod()));

            absoluteDating.setDatingMethod(datingMethod);

            // Only the dating of the chosen method stays (the dating is saved even without a laboratory)
            String methodLabel = transferredAbsoluteDating.getDatingMethod().getLabel();
            DendrochronologicalDating dendroDating = null;
            C14Dating c14Dating = null;
            OtherDating otherDating = null;
            // Dendro dating
            if ("Dendrochronology".equals(methodLabel)) {
                dendroDating = transferredAbsoluteDating.getDendrochronologicalDating();
                if (dendroDating != null) {
                    dendroDating.setLaboratory(resolveLaboratory(dendroDating.getLaboratory()));
                }
            }
            // C14 dating
            else if ("Radiocarbon Dating".equals(methodLabel)) {
                c14Dating = transferredAbsoluteDating.getC14Dating();
                if (c14Dating != null) {
                    C14Laboratory transferredC14Lab = c14Dating.getC14Laboratory();
                    if (transferredC14Lab != null && transferredC14Lab.getId() != null) {
                        c14Dating.setC14Laboratory(c14LaboratoryRepository.findById(transferredC14Lab.getId())
                                .orElseGet(() -> c14LaboratoryRepository.save(transferredC14Lab)));
                    } else {
                        c14Dating.setC14Laboratory(null);
                    }
                }
            }
            // Other dating
            else {
                otherDating = transferredAbsoluteDating.getOtherDating();
                if (otherDating != null) {
                    otherDating.setLaboratory(resolveLaboratory(otherDating.getLaboratory()));
                }
            }
            // The existing dating is changed, not replaced; one of another method is deleted
            absoluteDating.setDendrochronologicalDating(changeOrReplace(absoluteDating.getDendrochronologicalDating(), dendroDating));
            absoluteDating.setC14Dating(changeOrReplace(absoluteDating.getC14Dating(), c14Dating));
            absoluteDating.setOtherDating(changeOrReplace(absoluteDating.getOtherDating(), otherDating));
        } else {
            absoluteDating.setDatingMethod(null);
        }

        checkLaboratoryNumbers(absoluteDating);
        absoluteDatingRepository.save(absoluteDating);
        return "absolute dating is updated";
    }

    @DeleteMapping("/{absoluteDatingId}")
    public String delete(@PathVariable UUID absoluteDatingId) {

        // Get absolute dating
        AbsoluteDating absoluteDating = absoluteDatingRepository.findById(absoluteDatingId)
                .orElseThrow(() -> new IllegalArgumentException("invalid absolute dating id: " + absoluteDatingId));

        // Delete references
        for (Result referencedResult : absoluteDating.getResultList()) {
            referencedResult.getAbsoluteDatingList().remove(absoluteDating);
            resultRepository.save(referencedResult);
        }
        for (Literature referencedLiterature : absoluteDating.getLiteratureList()) {
            Literature literature = literatureRepository.findById(referencedLiterature.getId())
                    .orElseThrow(() -> new IllegalArgumentException("invalid literature id: " + referencedLiterature.getId()));

            literature.getAbsoluteDatingList().remove(absoluteDating);
            literatureRepository.save(literature);
        }

        absoluteDatingRepository.delete(absoluteDating);
        return "absolute dating is deleted";
    }

    @PutMapping("/{absoluteDatingId}/updateDatingMethod")
    public String updateDatingMethod(@RequestBody  DatingMethod transferredDatingMethod,
                                     @PathVariable UUID         absoluteDatingId)
    {
        AbsoluteDating absoluteDating = absoluteDatingRepository.findById(absoluteDatingId)
                .orElseThrow(() -> new IllegalArgumentException("invalid absoluteDating id: " + absoluteDatingId));


        DatingMethod datingMethod = datingMethodRepository.findById(transferredDatingMethod.getId())
                .orElseGet(() -> datingMethodRepository.save(transferredDatingMethod));

        absoluteDating.setDatingMethod(datingMethod);

        absoluteDatingRepository.save(absoluteDating);

        return "absoluteDating is updated with new datingMethod";
    }

    @PutMapping("/{absoluteDatingId}/updateMaterial")
    public String updateMaterial(@RequestBody  Material transferredMaterial,
                                 @PathVariable UUID     absoluteDatingId)
    {
        AbsoluteDating absoluteDating = absoluteDatingRepository.findById(absoluteDatingId)
                .orElseThrow(() -> new IllegalArgumentException("invalid absoluteDating id: " + absoluteDatingId));


        Material material = materialRepository.findById(transferredMaterial.getId())
                .orElseGet(() -> materialRepository.save(transferredMaterial));

        absoluteDating.setMaterial(material);

        absoluteDatingRepository.save(absoluteDating);

        return "absoluteDating is updated with new material";
    }

    @PutMapping("/{absoluteDatingId}/updateC14Dating/{number}")
    public String updateC14LaboratoryAndNumber(@RequestBody  C14Laboratory transferredC14Laboratory,
                                               @PathVariable UUID          absoluteDatingId,
                                               @PathVariable String       number)
    {
        // Get absoluteDating
        AbsoluteDating absoluteDating = absoluteDatingRepository.findById(absoluteDatingId)
                .orElseThrow(() -> new IllegalArgumentException("invalid absoluteDating id: " + absoluteDatingId));

        // Handle C14 laboratory
        C14Laboratory c14Laboratory = c14LaboratoryRepository.findById(transferredC14Laboratory.getId())
                    .orElseGet(() -> c14LaboratoryRepository.save(transferredC14Laboratory));

        absoluteDating.getC14Dating().setC14Laboratory(c14Laboratory);
        absoluteDating.getC14Dating().setNumber(number);

        checkLaboratoryNumbers(absoluteDating);
        absoluteDatingRepository.save(absoluteDating);

        return "absoluteDating is updated with new c14 laboratory and number";
    }

    @PutMapping("/{absoluteDatingId}/update/{datingMethod}/{number}")
    public String updateLaboratoryAndNumber(@RequestBody  Laboratory transferredLaboratory,
                                            @PathVariable UUID       absoluteDatingId,
                                            @PathVariable String     datingMethod,
                                            @PathVariable String     number)
    {
        // Get absoluteDating
        AbsoluteDating absoluteDating = absoluteDatingRepository.findById(absoluteDatingId)
                .orElseThrow(() -> new IllegalArgumentException("invalid absoluteDating id: " + absoluteDatingId));

        // Handle laboratory
        Laboratory laboratory;
        UUID transferredLaboratoryId = transferredLaboratory.getId();
        // Create new laboratory if it doesn't exist,
        if (transferredLaboratoryId == null) {
            laboratory = laboratoryRepository.save(transferredLaboratory);

        // else get existing one
        } else {
            laboratory = laboratoryRepository.findById(transferredLaboratoryId)
                    .orElseThrow(() -> new IllegalArgumentException("invalid laboratory id: " + transferredLaboratoryId));
        }

        if (datingMethod.equals("dendroDating")) {
            absoluteDating.getDendrochronologicalDating().setLaboratory(laboratory);
            absoluteDating.getDendrochronologicalDating().setNumber(number);
        } else if (datingMethod.equals("otherDating")) {
            absoluteDating.getOtherDating().setLaboratory(laboratory);
            absoluteDating.getOtherDating().setNumber(number);
        } else {
            return "invalid dating method: " + datingMethod;
        }

        checkLaboratoryNumbers(absoluteDating);
        absoluteDatingRepository.save(absoluteDating);

        return "absoluteDating is updated with new laboratory and number";
    }

    // Laboratory numbers -----------------------------------------------------------

    /*
    The existing dating takes the transferred values (it keeps its id); without an existing one the
    transferred dating is used, and without a transferred one the existing dating goes (orphanRemoval).
    */
    private static <T> T changeOrReplace(T existing, T transferred) {
        if (transferred == null || existing == null) return transferred;
        BeanUtils.copyProperties(transferred, existing, "id", "absoluteDating");
        return existing;
    }

    /*
    A laboratory number identifies one dating: no other dating may have the same laboratory and number.
    Numbers are stored without surrounding spaces (an empty number is none).
    */
    private void checkLaboratoryNumbers(AbsoluteDating absoluteDating) {
        C14Dating c14 = absoluteDating.getC14Dating();
        if (c14 != null) {
            c14.setNumber(cleanNumber(c14.getNumber()));
            if (c14.getC14Laboratory() != null && c14.getNumber() != null) {
                c14DatingRepository.findByC14LaboratoryIdAndNumber(c14.getC14Laboratory().getId(), c14.getNumber())
                        .filter(other -> !other.getId().equals(c14.getId()))
                        .ifPresent(other -> { throw new LaboratoryNumberTakenException("C14", c14LaboratoryName(c14.getC14Laboratory()),
                                c14.getNumber(), other.getAbsoluteDating()); });
            }
        }
        DendrochronologicalDating dendro = absoluteDating.getDendrochronologicalDating();
        if (dendro != null) {
            dendro.setNumber(cleanNumber(dendro.getNumber()));
            if (dendro.getLaboratory() != null && dendro.getLaboratory().getId() != null && dendro.getNumber() != null) {
                dendrochronologicalDatingRepository.findByLaboratoryIdAndNumber(dendro.getLaboratory().getId(), dendro.getNumber())
                        .filter(other -> !other.getId().equals(dendro.getId()))
                        .ifPresent(other -> { throw new LaboratoryNumberTakenException("dendro", laboratoryName(dendro.getLaboratory().getLabel()),
                                dendro.getNumber(), other.getAbsoluteDating()); });
            }
        }
        OtherDating otherDating = absoluteDating.getOtherDating();
        if (otherDating != null) {
            otherDating.setNumber(cleanNumber(otherDating.getNumber()));
            if (otherDating.getLaboratory() != null && otherDating.getLaboratory().getId() != null && otherDating.getNumber() != null) {
                otherDatingRepository.findByLaboratoryIdAndNumber(otherDating.getLaboratory().getId(), otherDating.getNumber())
                        .filter(other -> !other.getId().equals(otherDating.getId()))
                        .ifPresent(other -> { throw new LaboratoryNumberTakenException("other", laboratoryName(otherDating.getLaboratory().getLabel()),
                                otherDating.getNumber(), other.getAbsoluteDating()); });
            }
        }
    }

    private static String c14LaboratoryName(C14Laboratory laboratory) {
        if (laboratory.getLabel() != null && !laboratory.getLabel().isBlank()) return laboratory.getLabel();
        if (laboratory.getNotation() != null && !laboratory.getNotation().isBlank()) return laboratory.getNotation();
        return laboratory.getId();
    }

    private static String laboratoryName(String label) {
        return label == null || label.isBlank() ? "this laboratory" : label;
    }

    private static String cleanNumber(String number) {
        if (number == null) return null;
        String trimmed = number.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    static class LaboratoryNumberTakenException extends RuntimeException {
        LaboratoryNumberTakenException(String kind, String laboratory, String number, AbsoluteDating owner) {
            super("The " + kind + " dating number " + number + " of " + laboratory + " is already used"
                    + (owner == null ? "" : " by absolute dating " + describe(owner)) + ". A laboratory number can belong to one dating only.");
        }

        private static String describe(AbsoluteDating owner) {
            StringBuilder path = new StringBuilder();
            Sample sample = owner.getSample();
            if (sample != null) {
                Feature feature = sample.getFeature();
                if (feature != null && feature.getSite() != null) path.append(feature.getSite().getLabel()).append(" › ");
                if (feature != null) path.append(feature.getLabel()).append(" › ");
                path.append(sample.getLabel()).append(" › ");
            }
            return path.append(owner.getSubSample() == null ? "(no sub-sample)" : owner.getSubSample()).toString();
        }
    }

    @ExceptionHandler(LaboratoryNumberTakenException.class)
    public ResponseEntity<String> handleLaboratoryNumberTaken(LaboratoryNumberTakenException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(e.getMessage());
    }

    // Another request took the number between the check and the save
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<String> handleDataIntegrityViolation(DataIntegrityViolationException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body("The dating could not be saved: its laboratory number is already used by another dating.");
    }
}
