package arbodat.plus.controller;

import arbodat.plus.model.*;
import arbodat.plus.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
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
            // Remove old references
            absoluteDating.setDendrochronologicalDating(null);
            absoluteDating.setC14Dating(null);
            absoluteDating.setOtherDating(null);

            DatingMethod datingMethod = datingMethodRepository.findById(transferredAbsoluteDating.getDatingMethod().getId())
                    .orElseGet(() -> datingMethodRepository.save(transferredAbsoluteDating.getDatingMethod()));

            absoluteDating.setDatingMethod(datingMethod);

            // The dating is saved even without a laboratory (the lab stays null)
            // Dendro dating
            if (transferredAbsoluteDating.getDatingMethod().getLabel().equals("Dendrochronology")) {
                DendrochronologicalDating dendroDating = transferredAbsoluteDating.getDendrochronologicalDating();
                if (dendroDating != null) {
                    dendroDating.setLaboratory(resolveLaboratory(dendroDating.getLaboratory()));
                    absoluteDating.setDendrochronologicalDating(dendroDating);
                }
            }
            // C14 dating
            else if (transferredAbsoluteDating.getDatingMethod().getLabel().equals("Radiocarbon Dating")) {
                C14Dating c14Dating = transferredAbsoluteDating.getC14Dating();
                if (c14Dating != null) {
                    C14Laboratory transferredC14Lab = c14Dating.getC14Laboratory();
                    if (transferredC14Lab != null && transferredC14Lab.getId() != null) {
                        c14Dating.setC14Laboratory(c14LaboratoryRepository.findById(transferredC14Lab.getId())
                                .orElseGet(() -> c14LaboratoryRepository.save(transferredC14Lab)));
                    } else {
                        c14Dating.setC14Laboratory(null);
                    }
                    absoluteDating.setC14Dating(c14Dating);
                }
            }
            // Other dating
            else {
                OtherDating otherDating = transferredAbsoluteDating.getOtherDating();
                if (otherDating != null) {
                    otherDating.setLaboratory(resolveLaboratory(otherDating.getLaboratory()));
                    absoluteDating.setOtherDating(otherDating);
                }
            }
        } else {
            absoluteDating.setDatingMethod(null);
        }

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

        absoluteDatingRepository.save(absoluteDating);

        return "absoluteDating is updated with new laboratory and number";
    }
}
