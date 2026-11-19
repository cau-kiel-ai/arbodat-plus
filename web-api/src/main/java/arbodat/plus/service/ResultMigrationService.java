package arbodat.plus.service;

import arbodat.plus.dto_migration.BulkItemStatus;
import arbodat.plus.dto_migration.BulkResultItem;
import arbodat.plus.model.*;
import arbodat.plus.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

// Creates the results of the migration (result accordion) in bulk:
// every lookup is done once per request instead of once per result.
@Service
public class ResultMigrationService {

    @Autowired
    ResultRepository resultRepository;

    @Autowired
    SampleRepository sampleRepository;

    @Autowired
    TaxonomyRepository taxonomyRepository;

    @Autowired
    TaxCodeRepository taxCodeRepository;

    @Autowired
    RestTypeRepository restTypeRepository;

    @Autowired
    StateOfPreservationRepository stateOfPreservationRepository;

    // Values which make a result unique (see ResultRepository.findAlreadyExisting).
    // Like the query, a result with an empty value never counts as already existing.
    private record ResultKey(UUID sampleId, String taxCode, String orgOrMin, Double sieveSize,
                             String classificationConfer, String restType, String stateOfPreservation) {

        static Optional<ResultKey> of(Result result) {
            ResultKey key = new ResultKey(
                    result.getSample() != null ? result.getSample().getId() : null,
                    result.getTaxCode() != null ? result.getTaxCode().getId() : null,
                    result.getOrgOrMin(),
                    result.getSieveSize(),
                    result.getClassificationConfer() != null ? result.getClassificationConfer().getId() : null,
                    result.getRestType() != null ? result.getRestType().getId() : null,
                    result.getStateOfPreservation() != null ? result.getStateOfPreservation().getId() : null);

            boolean complete = key.sampleId != null && key.taxCode != null && key.orgOrMin != null
                    && key.sieveSize != null && key.classificationConfer != null
                    && key.restType != null && key.stateOfPreservation != null;
            return complete ? Optional.of(key) : Optional.empty();
        }
    }

    /**
     * Creates the given results and sets the taxonomy of their sites.
     * Each item gets its own status; items with an unknown sample or a missing value get "error",
     * results which already exist (in the database or earlier in the list) get "exists".
     */
    @Transactional
    public List<BulkItemStatus> createAll(String taxonomyLabel, List<BulkResultItem> items) {

        Taxonomy taxonomy = taxonomyRepository.findByLabel(taxonomyLabel)
                .orElseThrow(() -> new IllegalArgumentException("invalid taxonomy label: " + taxonomyLabel));

        List<Result> results = items.stream()
                .map(BulkResultItem::getResult)
                .filter(Objects::nonNull)
                .toList();

        // Dante values: each distinct value is saved once, if it's not already in the database
        Map<String, TaxCode> taxCodes = saveMissing(results.stream().map(Result::getTaxCode).toList(),
                                                    TaxCode::getId, taxCodeRepository);
        Map<String, RestType> restTypes = saveMissing(results.stream().map(Result::getRestType).toList(),
                                                      RestType::getId, restTypeRepository);
        Map<String, StateOfPreservation> statesOfPreservation = saveMissing(
                results.stream().map(Result::getStateOfPreservation).toList(),
                StateOfPreservation::getId, stateOfPreservationRepository);

        // Samples and their existing results (one query each)
        Set<UUID> sampleIds = results.stream()
                .map(Result::getSample)
                .filter(Objects::nonNull)
                .map(Sample::getId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<UUID, Sample> samples = sampleRepository.findAllById(sampleIds).stream()
                .collect(Collectors.toMap(Sample::getId, Function.identity()));

        Set<ResultKey> existingKeys = new HashSet<>();
        resultRepository.findBySampleIdIn(sampleIds)
                .forEach(existing -> ResultKey.of(existing).ifPresent(existingKeys::add));

        // Check every item ------------------------------------------------------------------------
        List<BulkItemStatus> statuses = new ArrayList<>();
        // Result.equals compares ids, which new results don't have yet -> lists instead of a map
        List<Result> toSave = new ArrayList<>();
        List<String> clientIdsToSave = new ArrayList<>();
        Set<Site> sites = new HashSet<>();

        for (BulkResultItem item : items) {
            Result result = item.getResult();
            String clientId = item.getClientId();

            if (result == null) {
                statuses.add(BulkItemStatus.error(clientId, "no result"));
                continue;
            }
            Sample sample = result.getSample() != null ? samples.get(result.getSample().getId()) : null;
            if (sample == null) {
                statuses.add(BulkItemStatus.error(clientId, "invalid sample id"));
                continue;
            }
            if (result.getTaxCode() == null || result.getRestType() == null || result.getStateOfPreservation() == null) {
                statuses.add(BulkItemStatus.error(clientId, "taxCode, restType and stateOfPreservation are required"));
                continue;
            }

            result.setSample(sample);
            result.setTaxCode(taxCodes.get(result.getTaxCode().getId()));
            result.setRestType(restTypes.get(result.getRestType().getId()));
            result.setStateOfPreservation(statesOfPreservation.get(result.getStateOfPreservation().getId()));

            Optional<ResultKey> key = ResultKey.of(result);
            if (key.isPresent() && !existingKeys.add(key.get())) {
                statuses.add(BulkItemStatus.exists(clientId));
                continue;
            }

            toSave.add(result);
            clientIdsToSave.add(clientId);
            sites.add(sample.getFeature().getSite());
            statuses.add(null); // set after saving
        }

        // Save ------------------------------------------------------------------------------------
        sites.forEach(site -> site.setTaxonomy(taxonomy));

        List<Result> saved = resultRepository.saveAll(toSave);

        // Fill in the statuses of the saved results (same order as the placeholders)
        Iterator<String> clientIds = clientIdsToSave.iterator();
        Iterator<Result> savedResults = saved.iterator();
        for (int i = 0; i < statuses.size(); i++) {
            if (statuses.get(i) == null) {
                statuses.set(i, BulkItemStatus.created(clientIds.next(), savedResults.next().getId()));
            }
        }
        return statuses;
    }

    // Saves the values which are not already in the database. Returns all values by id.
    private <T> Map<String, T> saveMissing(List<T> transferred, Function<T, String> getId,
                                           JpaRepository<T, String> repository) {
        Map<String, T> byId = new HashMap<>();
        transferred.stream()
                .filter(value -> value != null && getId.apply(value) != null)
                .forEach(value -> byId.putIfAbsent(getId.apply(value), value));

        Set<String> existingIds = new HashSet<>();
        repository.findAllById(byId.keySet()).forEach(existing -> {
            byId.put(getId.apply(existing), existing);
            existingIds.add(getId.apply(existing));
        });

        List<T> missing = byId.entrySet().stream()
                .filter(entry -> !existingIds.contains(entry.getKey()))
                .map(Map.Entry::getValue)
                .toList();
        repository.saveAll(missing).forEach(saved -> byId.put(getId.apply(saved), saved));
        return byId;
    }
}
