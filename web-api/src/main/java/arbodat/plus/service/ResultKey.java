package arbodat.plus.service;

import arbodat.plus.model.Result;
import arbodat.plus.repository.ResultRepository;

import java.util.List;
import java.util.UUID;

/**
 * Values which make a result unique within its sample: tax code, fraction (org / min + sieve size), fraction
 * analyzed, cf, rest type and state of preservation. Empty values count as values (two results without cf are
 * the same), like the unique index uk_result_key (NULLS NOT DISTINCT, see ResultConstraints).
 * Results without sample (their sample was deleted) are never duplicates.
 */
public record ResultKey(UUID sampleId, String taxCode, String orgOrMin, Double sieveSize, String fractionAnalyzed,
                        String classificationConfer, String restType, String stateOfPreservation) {

    public static ResultKey of(Result result) {
        return new ResultKey(
                result.getSample() != null ? result.getSample().getId() : null,
                result.getTaxCode() != null ? result.getTaxCode().getId() : null,
                result.getOrgOrMin(),
                result.getSieveSize(),
                result.getFractionAnalyzed(),
                result.getClassificationConfer() != null ? result.getClassificationConfer().getId() : null,
                result.getRestType() != null ? result.getRestType().getId() : null,
                result.getStateOfPreservation() != null ? result.getStateOfPreservation().getId() : null);
    }

    // Another result of the sample has the same key ('self': id of the result being changed, null when creating)
    public boolean isTaken(ResultRepository resultRepository, UUID self) {
        if (sampleId == null) return false;
        return resultRepository.findBySampleIdIn(List.of(sampleId)).stream()
                .filter(existing -> !existing.getId().equals(self))
                .anyMatch(existing -> of(existing).equals(this));
    }
}
