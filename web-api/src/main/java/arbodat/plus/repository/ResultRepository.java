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

    // Results of one sample (paged like findAll, used by the results table in the input form)
    Page<Result> findBySampleId(UUID sampleId, Pageable pageable);

    // Existing results of many samples at once (bulk create of the migration)
    List<Result> findBySampleIdIn(Collection<UUID> sampleIds);

    // Called per FEATURE (batch), not per sample -> no N+1
    List<Result> findBySampleFeatureId(UUID featureId);

    // Result<->AbsoluteDating pairs directly from the join table – avoids lazy loading of the collections (N+1)
    @Query("select r.id, ad.id from Result r join r.absoluteDatingList ad where r.sample.id in :sampleIds")
    List<Object[]> findAbsoluteDatingIdPairsBySampleIdIn(@Param("sampleIds") Collection<UUID> sampleIds);
}
