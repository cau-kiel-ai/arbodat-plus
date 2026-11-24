package arbodat.plus.repository;

import arbodat.plus.model.Sample;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

@Repository
public interface SampleRepository extends JpaRepository <Sample, UUID>  {

    // Labels compare case-insensitively (as in ArboDat 2018 / Access)
    List<Sample> findAllByLabelIgnoreCase(String label);

    List<Sample> findByFeatureIdAndLabelIgnoreCase(UUID featureId, String label);

    List<Sample> findByFeatureIdIn(Collection<UUID> featureIds);
}
