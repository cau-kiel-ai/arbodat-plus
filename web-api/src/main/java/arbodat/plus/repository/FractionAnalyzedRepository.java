package arbodat.plus.repository;

import arbodat.plus.model.FractionAnalyzed;
import arbodat.plus.model.Sample;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface FractionAnalyzedRepository extends JpaRepository<FractionAnalyzed, UUID> {

    @Query("SELECT f FROM FractionAnalyzed f " +
           "WHERE f.sample = :sample " +
             "AND f.fractionAnalyzed = :fractionAnalyzed " +
             "AND f.orgOrMin = :orgOrMin " +
             "AND f.sieveSize = :sieveSize")
    Optional<FractionAnalyzed> findAlreadyExisting(@Param("sample")           Sample sample,
                                                   @Param("fractionAnalyzed") String fractionAnalyzed,
                                                   @Param("orgOrMin")         String orgOrMin,
                                                   @Param("sieveSize")        Double sieveSize);

    // Existing fractions of many samples at once (bulk create of the migration)
    List<FractionAnalyzed> findBySampleIdIn(Collection<UUID> sampleIds);
}
