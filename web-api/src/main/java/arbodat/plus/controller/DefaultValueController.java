package arbodat.plus.controller;

import arbodat.plus.model.DefaultValue;
import arbodat.plus.repository.DefaultValueRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/default_values")
public class DefaultValueController {

    /* select fields that can have a default value (keys of the settings page) */
    private static final Set<String> VALID_KEYS = Set.of(
            "license",
            "taxonomy", "siteType", "naturalUnit", "siteCoordinateSystem",
            "featureType", "preservationCondition",
            "chronozone", "sampleType", "seedsAndFruits", "charcoalInvestigated", "woodSubfossile",
            "sampleCoordinateSystem",
            "datingMethod", "material", "c14Laboratory",
            "restType", "stateOfPreservation", "classificationConfer");

    @Autowired
    DefaultValueRepository defaultValueRepository;

    @GetMapping
    public Map<String, List<String>> getAllDefaultValues() {
        Map<String, List<String>> defaultValues = new HashMap<>();
        for (DefaultValue defaultValue : defaultValueRepository.findAll()) {
            defaultValues.put(defaultValue.getFieldKey(), new ArrayList<>(defaultValue.getValueIds()));
        }
        return defaultValues;
    }

    /* replaces all default values: keys with values are saved, all other keys are removed */
    @PutMapping
    @Transactional
    public String update(@RequestBody Map<String, List<String>> transferredDefaultValues) {

        for (String key : transferredDefaultValues.keySet()) {
            if (!VALID_KEYS.contains(key)) {
                throw new IllegalArgumentException("invalid default key: " + key);
            }
        }

        for (DefaultValue defaultValue : defaultValueRepository.findAll()) {
            List<String> ids = transferredDefaultValues.get(defaultValue.getFieldKey());
            if (ids == null || ids.isEmpty()) {
                defaultValueRepository.delete(defaultValue);
            }
        }

        transferredDefaultValues.forEach((key, ids) -> {
            if (ids != null && !ids.isEmpty()) {
                DefaultValue defaultValue = defaultValueRepository.findById(key).orElseGet(DefaultValue::new);
                defaultValue.setFieldKey(key);
                defaultValue.setValueIds(new HashSet<>(ids));
                defaultValueRepository.save(defaultValue);
            }
        });

        return "default values are updated";
    }
}
