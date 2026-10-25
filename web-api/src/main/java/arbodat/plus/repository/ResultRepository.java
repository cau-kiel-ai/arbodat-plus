package arbodat.plus.repository;

import arbodat.plus.model.*;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ResultRepository extends JpaRepository <Result, UUID> {

    @Query("SELECT r FROM Result r " +
           "WHERE r.sample = :sample " +
             "AND r.taxCode = :taxCode " +
             "AND r.orgOrMin = :orgOrMin " +
             "AND r.sieveSize = :sieveSize " +
             "AND r.classificationConfer = :cf " +
             "AND r.restType = :restType " +
             "AND r.stateOfPreservation = :stateOfPreservation")
    Optional<Result> findAlreadyExisting(@Param("sample")    Sample sample,
                                         @Param("taxCode") TaxCode taxCode,
                                         @Param("orgOrMin")  String orgOrMin,
                                         @Param("sieveSize") Double sieveSize,
                                         @Param("cf")        ClassificationConfer cf,
                                         @Param("restType")   RestType restType,
                                         @Param("stateOfPreservation")StateOfPreservation stateOfPreservation);

    // Results of one sample (paged like findAll, used by the results table in the input form)
    Page<Result> findBySampleId(UUID sampleId, Pageable pageable);

    // Called per FEATURE (batch), not per sample -> no N+1
    List<Result> findBySampleFeatureId(UUID featureId);

    // Result<->AbsoluteDating pairs directly from the join table – avoids lazy loading of the collections (N+1)
    @Query("select r.id, ad.id from Result r join r.absoluteDatingList ad where r.sample.id in :sampleIds")
    List<Object[]> findAbsoluteDatingIdPairsBySampleIdIn(@Param("sampleIds") Collection<UUID> sampleIds);
}
