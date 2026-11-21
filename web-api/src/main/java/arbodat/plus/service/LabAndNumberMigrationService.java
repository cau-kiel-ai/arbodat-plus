package arbodat.plus.service;

import arbodat.plus.dto_migration.BulkItemStatus;
import arbodat.plus.dto_migration.BulkLabAndNumberItem;
import arbodat.plus.model.AbsoluteDating;
import arbodat.plus.model.C14Laboratory;
import arbodat.plus.model.Laboratory;
import arbodat.plus.repository.AbsoluteDatingRepository;
import arbodat.plus.repository.C14LaboratoryRepository;
import arbodat.plus.repository.LaboratoryRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

// Sets laboratory and number of the absolute datings of the migration (labs and numbers accordion) in bulk:
// datings and laboratories are loaded once per request, a new laboratory is created once per label.
@Service
public class LabAndNumberMigrationService {

    @Autowired
    AbsoluteDatingRepository absoluteDatingRepository;

    @Autowired
    LaboratoryRepository laboratoryRepository;

    @Autowired
    C14LaboratoryRepository c14LaboratoryRepository;

    /**
     * Sets laboratory and number of the given datings. Each item gets its own status:
     * "updated", or "error" (unknown dating, missing number / laboratory, invalid dating method).
     */
    @Transactional
    public List<BulkItemStatus> updateAll(List<BulkLabAndNumberItem> items) {

        // Datings (one query)
        Set<UUID> datingIds = items.stream()
                .map(BulkLabAndNumberItem::getAbsoluteDatingId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<UUID, AbsoluteDating> datings = absoluteDatingRepository.findAllById(datingIds).stream()
                .collect(Collectors.toMap(AbsoluteDating::getId, Function.identity()));

        Map<String, C14Laboratory> c14Laboratories = c14Laboratories(items);
        Map<UUID, Laboratory> laboratoriesById = laboratoriesById(items);
        Map<String, Laboratory> laboratoriesByLabel = laboratoriesByLabel(items);

        List<BulkItemStatus> statuses = new ArrayList<>();
        for (BulkLabAndNumberItem item : items) {
            String clientId = item.getClientId();

            AbsoluteDating dating = item.getAbsoluteDatingId() != null ? datings.get(item.getAbsoluteDatingId()) : null;
            if (dating == null) {
                statuses.add(BulkItemStatus.error(clientId, "invalid absolute dating id"));
                continue;
            }
            String number = item.getNumber() != null ? item.getNumber().trim() : "";
            if (number.isEmpty()) {
                statuses.add(BulkItemStatus.error(clientId, "no number"));
                continue;
            }

            switch (String.valueOf(item.getDatingMethod())) {
                case "c14Dating" -> {
                    C14Laboratory c14Laboratory = item.getC14Laboratory() != null
                            ? c14Laboratories.get(item.getC14Laboratory().getId()) : null;
                    if (c14Laboratory == null || dating.getC14Dating() == null) {
                        statuses.add(BulkItemStatus.error(clientId, c14Laboratory == null ? "no C14 laboratory" : "no C14 dating"));
                        continue;
                    }
                    dating.getC14Dating().setC14Laboratory(c14Laboratory);
                    dating.getC14Dating().setNumber(number);
                }
                case "dendroDating", "otherDating" -> {
                    Laboratory laboratory = laboratoryOf(item.getLaboratory(), laboratoriesById, laboratoriesByLabel);
                    boolean dendro = item.getDatingMethod().equals("dendroDating");
                    if (laboratory == null || (dendro ? dating.getDendrochronologicalDating() == null : dating.getOtherDating() == null)) {
                        statuses.add(BulkItemStatus.error(clientId, laboratory == null ? "no laboratory" : "no " + item.getDatingMethod()));
                        continue;
                    }
                    if (dendro) {
                        dating.getDendrochronologicalDating().setLaboratory(laboratory);
                        dating.getDendrochronologicalDating().setNumber(number);
                    } else {
                        dating.getOtherDating().setLaboratory(laboratory);
                        dating.getOtherDating().setNumber(number);
                    }
                }
                default -> {
                    statuses.add(BulkItemStatus.error(clientId, "invalid dating method: " + item.getDatingMethod()));
                    continue;
                }
            }
            statuses.add(BulkItemStatus.updated(clientId));
        }
        // The datings are saved with the transaction (managed entities)
        return statuses;
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

    // Laboratories entered as label (without id): an existing one with the same label, else a new one
    // (created once per label, also if several datings use it)
    private Map<String, Laboratory> laboratoriesByLabel(List<BulkLabAndNumberItem> items) {
        Set<String> labels = items.stream()
                .map(BulkLabAndNumberItem::getLaboratory)
                .filter(laboratory -> laboratory != null && laboratory.getId() == null)
                .map(Laboratory::getLabel)
                .filter(label -> label != null && !label.isBlank())
                .map(String::trim)
                .collect(Collectors.toSet());

        Map<String, Laboratory> byLabel = new HashMap<>();
        laboratoryRepository.findByLabelIn(labels).forEach(existing -> byLabel.putIfAbsent(existing.getLabel(), existing));

        List<Laboratory> missing = labels.stream()
                .filter(label -> !byLabel.containsKey(label))
                .map(label -> {
                    Laboratory laboratory = new Laboratory();
                    laboratory.setLabel(label);
                    return laboratory;
                })
                .toList();
        laboratoryRepository.saveAll(missing).forEach(saved -> byLabel.put(saved.getLabel(), saved));
        return byLabel;
    }

    private Laboratory laboratoryOf(Laboratory transferred, Map<UUID, Laboratory> byId, Map<String, Laboratory> byLabel) {
        if (transferred == null) return null;
        if (transferred.getId() != null) return byId.get(transferred.getId());
        return transferred.getLabel() != null ? byLabel.get(transferred.getLabel().trim()) : null;
    }
}
