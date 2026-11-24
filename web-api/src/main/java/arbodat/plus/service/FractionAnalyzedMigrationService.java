package arbodat.plus.service;

import arbodat.plus.dto_migration.BulkFractionAnalyzedItem;
import arbodat.plus.dto_migration.BulkItemStatus;
import arbodat.plus.model.FractionAnalyzed;
import arbodat.plus.model.Sample;
import arbodat.plus.repository.FractionAnalyzedRepository;
import arbodat.plus.repository.SampleRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

// Creates the fractions analyzed of the migration (fractions analyzed accordion) in bulk:
// samples and existing fractions are loaded once per request instead of once per fraction.
@Service
public class FractionAnalyzedMigrationService {

    @Autowired
    FractionAnalyzedRepository fractionAnalyzedRepository;

    @Autowired
    SampleRepository sampleRepository;

    // Values which make a fraction analyzed unique (see FractionAnalyzedRepository.findAlreadyExisting).
    // Like the query, a fraction with an empty value never counts as already existing.
    private record FractionKey(UUID sampleId, String fractionAnalyzed, String orgOrMin, Double sieveSize) {

        static Optional<FractionKey> of(FractionAnalyzed fraction) {
            FractionKey key = new FractionKey(
                    fraction.getSample() != null ? fraction.getSample().getId() : null,
                    fraction.getFractionAnalyzed(),
                    fraction.getOrgOrMin(),
                    fraction.getSieveSize());

            boolean complete = key.sampleId != null && key.fractionAnalyzed != null
                    && key.orgOrMin != null && key.sieveSize != null;
            return complete ? Optional.of(key) : Optional.empty();
        }
    }

    /**
     * Creates the given fractions analyzed. Each item gets its own status; items with an unknown sample
     * or a missing value get "error", fractions which already exist (in the database or earlier in the list)
     * get "exists".
     */
    @Transactional
    public List<BulkItemStatus> createAll(List<BulkFractionAnalyzedItem> items) {

        // Samples and their existing fractions (one query each)
        Set<UUID> sampleIds = items.stream()
                .map(BulkFractionAnalyzedItem::getFractionAnalyzed)
                .filter(Objects::nonNull)
                .map(FractionAnalyzed::getSample)
                .filter(Objects::nonNull)
                .map(Sample::getId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<UUID, Sample> samples = sampleRepository.findAllById(sampleIds).stream()
                .collect(Collectors.toMap(Sample::getId, Function.identity()));

        Set<FractionKey> existingKeys = new HashSet<>();
        fractionAnalyzedRepository.findBySampleIdIn(sampleIds)
                .forEach(existing -> FractionKey.of(existing).ifPresent(existingKeys::add));

        // Check every item ------------------------------------------------------------------------
        List<BulkItemStatus> statuses = new ArrayList<>();
        // Lists, not a map: FractionAnalyzed is a Lombok @Data entity (equals/hashCode over all fields)
        List<FractionAnalyzed> toSave = new ArrayList<>();
        List<String> clientIdsToSave = new ArrayList<>();

        for (BulkFractionAnalyzedItem item : items) {
            FractionAnalyzed fraction = item.getFractionAnalyzed();
            String clientId = item.getClientId();

            if (fraction == null) {
                statuses.add(BulkItemStatus.error(clientId, "no fraction analyzed"));
                continue;
            }
            Sample sample = fraction.getSample() != null ? samples.get(fraction.getSample().getId()) : null;
            if (sample == null) {
                statuses.add(BulkItemStatus.error(clientId, "invalid sample id"));
                continue;
            }
            if (fraction.getOrgOrMin() == null || fraction.getSieveSize() == null) {
                statuses.add(BulkItemStatus.error(clientId, "orgOrMin and sieveSize are required"));
                continue;
            }
            fraction.setSample(sample);

            Optional<FractionKey> key = FractionKey.of(fraction);
            if (key.isPresent() && !existingKeys.add(key.get())) {
                statuses.add(BulkItemStatus.exists(clientId));
                continue;
            }

            toSave.add(fraction);
            clientIdsToSave.add(clientId);
            statuses.add(null); // set after saving
        }

        // Save and fill in the statuses of the saved fractions (same order as the placeholders)
        List<FractionAnalyzed> saved = fractionAnalyzedRepository.saveAll(toSave);
        Iterator<String> clientIds = clientIdsToSave.iterator();
        Iterator<FractionAnalyzed> savedFractions = saved.iterator();
        for (int i = 0; i < statuses.size(); i++) {
            if (statuses.get(i) == null) {
                statuses.set(i, BulkItemStatus.created(clientIds.next(), savedFractions.next().getId()));
            }
        }
        return statuses;
    }
}
