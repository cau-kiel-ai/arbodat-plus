package arbodat.plus.controller;

import arbodat.plus.model.DisplayOrder;
import arbodat.plus.repository.DisplayOrderRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/display_order")
public class DisplayOrderController {

    /* select fields whose options can be ordered manually (keys of the settings page) */
    private static final Set<String> VALID_KEYS = Set.of(
            "featureType", "datingMethod", "stateOfPreservation", "classificationConfer", "restType");

    @Autowired
    DisplayOrderRepository displayOrderRepository;

    @GetMapping
    public Map<String, List<String>> getAllDisplayOrders() {
        Map<String, List<String>> displayOrders = new HashMap<>();
        for (DisplayOrder displayOrder : displayOrderRepository.findAll()) {
            displayOrders.put(displayOrder.getFieldKey(), new ArrayList<>(displayOrder.getValueIds()));
        }
        return displayOrders;
    }

    /* replaces all orders: keys with values are saved, all other keys are removed (= default order) */
    @PutMapping
    @Transactional
    public String update(@RequestBody Map<String, List<String>> transferredDisplayOrders) {

        for (String key : transferredDisplayOrders.keySet()) {
            if (!VALID_KEYS.contains(key)) {
                throw new IllegalArgumentException("invalid display order key: " + key);
            }
        }

        for (DisplayOrder displayOrder : displayOrderRepository.findAll()) {
            List<String> ids = transferredDisplayOrders.get(displayOrder.getFieldKey());
            if (ids == null || ids.isEmpty()) {
                displayOrderRepository.delete(displayOrder);
            }
        }

        transferredDisplayOrders.forEach((key, ids) -> {
            if (ids != null && !ids.isEmpty()) {
                DisplayOrder displayOrder = displayOrderRepository.findById(key).orElseGet(DisplayOrder::new);
                displayOrder.setFieldKey(key);
                displayOrder.setValueIds(new ArrayList<>(ids));
                displayOrderRepository.save(displayOrder);
            }
        });

        return "display orders are updated";
    }
}
