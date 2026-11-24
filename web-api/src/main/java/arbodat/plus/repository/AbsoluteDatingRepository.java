package arbodat.plus.repository;

import arbodat.plus.model.AbsoluteDating;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface AbsoluteDatingRepository extends JpaRepository <AbsoluteDating, UUID>{

    // Sub-samples compare case-insensitively (as in ArboDat 2018 / Access)
    List<AbsoluteDating> findAllBySubSampleIgnoreCase(String subSample);

    List<AbsoluteDating> findBySampleIdAndSubSampleIgnoreCase(UUID sampleId, String subSample);

    List<AbsoluteDating> findBySampleFeatureId(UUID featureId);
}
