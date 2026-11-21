package arbodat.plus.service;

import arbodat.plus.dto_migration.BulkItemStatus;
import arbodat.plus.dto_migration.BulkLabAndNumberItem;
import arbodat.plus.model.*;
import arbodat.plus.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

// Sets laboratory and number of the absolute datings of the migration (labs and numbers accordion) in bulk:
// datings and laboratories are loaded once per request, a new laboratory is created once per label.
// A laboratory number identifies one dating (see LaboratoryNumberTakenException): a row whose number is
// already used, in the database or by an earlier row of the request, gets an error, the others are saved.
@Service
public class LabAndNumberMigrationService {

    @Autowired
    AbsoluteDatingRepository absoluteDatingRepository;

    @Autowired
    LaboratoryRepository laboratoryRepository;

    @Autowired
    C14LaboratoryRepository c14LaboratoryRepository;

    @Autowired
    C14DatingRepository c14DatingRepository;

    @Autowired
    DendrochronologicalDatingRepository dendrochronologicalDatingRepository;

    @Autowired
    OtherDatingRepository otherDatingRepository;

    // A checked row: dating, number and its laboratory (newLabel: a laboratory which is created first)
    private record Change(int index, AbsoluteDating dating, String method, String number,
                          C14Laboratory c14Laboratory, Laboratory laboratory, String newLabel) {}

    /**
     * Sets laboratory and number of the given datings. Each item gets its own status: "updated", or "error"
     * (unknown dating, missing number / laboratory, invalid dating method, laboratory number already used).
     */
    @Transactional
    public List<BulkItemStatus> updateAll(List<BulkLabAndNumberItem> items) {

        // Datings and laboratories (one query each)
        Set<UUID> datingIds = items.stream()
                .map(BulkLabAndNumberItem::getAbsoluteDatingId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<UUID, AbsoluteDating> datings = absoluteDatingRepository.findAllById(datingIds).stream()
                .collect(Collectors.toMap(AbsoluteDating::getId, Function.identity()));

        Map<String, C14Laboratory> c14Laboratories = c14Laboratories(items);
        Map<UUID, Laboratory> laboratoriesById = laboratoriesById(items);
        Map<String, Laboratory> laboratoriesByLabel = existingLaboratoriesByLabel(items);

        // Check every item -----------------------------------------------------------------------
        BulkItemStatus[] statuses = new BulkItemStatus[items.size()];
        List<Change> changes = new ArrayList<>();
        Set<String> numbersOfRequest = new HashSet<>(); // "method|laboratory|number" of the rows checked so far

        for (int i = 0; i < items.size(); i++) {
            BulkLabAndNumberItem item = items.get(i);
            String clientId = item.getClientId();
            String method = String.valueOf(item.getDatingMethod());

            AbsoluteDating dating = item.getAbsoluteDatingId() != null ? datings.get(item.getAbsoluteDatingId()) : null;
            if (dating == null) {
                statuses[i] = BulkItemStatus.error(clientId, "invalid absolute dating id");
                continue;
            }
            String number = cleanNumber(item.getNumber());
            if (number == null) {
                statuses[i] = BulkItemStatus.error(clientId, "no number");
                continue;
            }

            Change change;
            String laboratoryKey;
            switch (method) {
                case "c14Dating" -> {
                    C14Laboratory c14Laboratory = item.getC14Laboratory() != null
                            ? c14Laboratories.get(item.getC14Laboratory().getId()) : null;
                    if (c14Laboratory == null || dating.getC14Dating() == null) {
                        statuses[i] = BulkItemStatus.error(clientId, c14Laboratory == null ? "no C14 laboratory" : "no C14 dating");
                        continue;
                    }
                    change = new Change(i, dating, method, number, c14Laboratory, null, null);
                    laboratoryKey = c14Laboratory.getId();
                }
                case "dendroDating", "otherDating" -> {
                    if ((method.equals("dendroDating") ? dating.getDendrochronologicalDating() : dating.getOtherDating()) == null) {
                        statuses[i] = BulkItemStatus.error(clientId, "no " + method);
                        continue;
                    }
                    Laboratory transferred = item.getLaboratory();
                    Laboratory laboratory = null;
                    String newLabel = null;
                    if (transferred != null && transferred.getId() != null) {
                        laboratory = laboratoriesById.get(transferred.getId());
                    } else if (transferred != null && transferred.getLabel() != null && !transferred.getLabel().isBlank()) {
                        laboratory = laboratoriesByLabel.get(transferred.getLabel().trim());
                        if (laboratory == null) newLabel = transferred.getLabel().trim();
                    }
                    if (laboratory == null && newLabel == null) {
                        statuses[i] = BulkItemStatus.error(clientId, "no laboratory");
                        continue;
                    }
                    change = new Change(i, dating, method, number, null, laboratory, newLabel);
                    laboratoryKey = laboratory != null ? laboratory.getId().toString() : "new:" + newLabel;
                }
                default -> {
                    statuses[i] = BulkItemStatus.error(clientId, "invalid dating method: " + method);
                    continue;
                }
            }

            // Laboratory number already used (in the database, or by an earlier row of this request)
            Optional<String> taken = numberTaken(change);
            if (taken.isPresent()) {
                statuses[i] = BulkItemStatus.error(clientId, taken.get());
                continue;
            }
            if (!numbersOfRequest.add(method + "|" + laboratoryKey + "|" + number)) {
                statuses[i] = BulkItemStatus.error(clientId, "The number " + number
                        + " is used for this laboratory by another selected row. A laboratory number can belong to one dating only.");
                continue;
            }
            changes.add(change);
        }

        // Save ------------------------------------------------------------------------------------
        // New laboratories: only those of the rows which are saved, each one once
        Map<String, Laboratory> newLaboratories = new HashMap<>();
        changes.stream().map(Change::newLabel).filter(Objects::nonNull).distinct().forEach(label -> {
            Laboratory laboratory = new Laboratory();
            laboratory.setLabel(label);
            newLaboratories.put(label, laboratoryRepository.save(laboratory));
        });

        for (Change change : changes) {
            AbsoluteDating dating = change.dating();
            switch (change.method()) {
                case "c14Dating" -> {
                    dating.getC14Dating().setC14Laboratory(change.c14Laboratory());
                    dating.getC14Dating().setNumber(change.number());
                }
                case "dendroDating" -> {
                    dating.getDendrochronologicalDating().setLaboratory(laboratoryOf(change, newLaboratories));
                    dating.getDendrochronologicalDating().setNumber(change.number());
                }
                default -> {
                    dating.getOtherDating().setLaboratory(laboratoryOf(change, newLaboratories));
                    dating.getOtherDating().setNumber(change.number());
                }
            }
            statuses[change.index()] = BulkItemStatus.updated(items.get(change.index()).getClientId());
        }
        // The datings are saved with the transaction (managed entities)
        return Arrays.asList(statuses);
    }

    private static Laboratory laboratoryOf(Change change, Map<String, Laboratory> newLaboratories) {
        return change.laboratory() != null ? change.laboratory() : newLaboratories.get(change.newLabel());
    }

    // The message, if another dating already has this laboratory and number (a new laboratory has none yet)
    private Optional<String> numberTaken(Change change) {
        AbsoluteDating dating = change.dating();
        return switch (change.method()) {
            case "c14Dating" -> c14DatingRepository
                    .findByC14LaboratoryIdAndNumber(change.c14Laboratory().getId(), change.number())
                    .filter(other -> !other.getId().equals(dating.getC14Dating().getId()))
                    .map(other -> new LaboratoryNumberTakenException("C14",
                            LaboratoryNumberTakenException.c14LaboratoryName(change.c14Laboratory()),
                            change.number(), other.getAbsoluteDating()).getMessage());
            case "dendroDating" -> change.laboratory() == null ? Optional.empty() : dendrochronologicalDatingRepository
                    .findByLaboratoryIdAndNumber(change.laboratory().getId(), change.number())
                    .filter(other -> !other.getId().equals(dating.getDendrochronologicalDating().getId()))
                    .map(other -> new LaboratoryNumberTakenException("dendro",
                            LaboratoryNumberTakenException.laboratoryName(change.laboratory().getLabel()),
                            change.number(), other.getAbsoluteDating()).getMessage());
            default -> change.laboratory() == null ? Optional.empty() : otherDatingRepository
                    .findByLaboratoryIdAndNumber(change.laboratory().getId(), change.number())
                    .filter(other -> !other.getId().equals(dating.getOtherDating().getId()))
                    .map(other -> new LaboratoryNumberTakenException("other",
                            LaboratoryNumberTakenException.laboratoryName(change.laboratory().getLabel()),
                            change.number(), other.getAbsoluteDating()).getMessage());
        };
    }

    // Numbers are stored without surrounding spaces (an empty number is none), as in AbsoluteDatingController
    private static String cleanNumber(String number) {
        if (number == null) return null;
        String trimmed = number.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    // DANTE C14 laboratories of the items: each one saved once, if it's not already in the database
    private Map<String, C14Laboratory> c14Laboratories(List<BulkLabAndNumberItem> items) {
        Map<String, C14Laboratory> byId = new HashMap<>();
        items.stream()
                .map(BulkLabAndNumberItem::getC14Laboratory)
                .filter(c14Laboratory -> c14Laboratory != null && c14Laboratory.getId() != null)
                .forEach(c14Laboratory -> byId.putIfAbsent(c14Laboratory.getId(), c14Laboratory));

        Set<String> existingIds = new HashSet<>();
        c14LaboratoryRepository.findAllById(byId.keySet()).forEach(existing -> {
            byId.put(existing.getId(), existing);
            existingIds.add(existing.getId());
        });
        List<C14Laboratory> missing = byId.values().stream()
                .filter(c14Laboratory -> !existingIds.contains(c14Laboratory.getId()))
                .toList();
        c14LaboratoryRepository.saveAll(missing).forEach(saved -> byId.put(saved.getId(), saved));
        return byId;
    }

    // Laboratories chosen from the list (with id)
    private Map<UUID, Laboratory> laboratoriesById(List<BulkLabAndNumberItem> items) {
        Set<UUID> ids = items.stream()
                .map(BulkLabAndNumberItem::getLaboratory)
                .filter(laboratory -> laboratory != null && laboratory.getId() != null)
                .map(Laboratory::getId)
                .collect(Collectors.toSet());
        return laboratoryRepository.findAllById(ids).stream()
                .collect(Collectors.toMap(Laboratory::getId, Function.identity()));
    }

    // Existing laboratories for the labels entered (without id); labels without one become new laboratories
    private Map<String, Laboratory> existingLaboratoriesByLabel(List<BulkLabAndNumberItem> items) {
        Set<String> labels = items.stream()
                .map(BulkLabAndNumberItem::getLaboratory)
                .filter(laboratory -> laboratory != null && laboratory.getId() == null)
                .map(Laboratory::getLabel)
                .filter(label -> label != null && !label.isBlank())
                .map(String::trim)
                .collect(Collectors.toSet());

        Map<String, Laboratory> byLabel = new HashMap<>();
        laboratoryRepository.findByLabelIn(labels).forEach(existing -> byLabel.putIfAbsent(existing.getLabel(), existing));
        return byLabel;
    }
}
