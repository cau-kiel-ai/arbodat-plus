package arbodat.plus.repository;

import arbodat.plus.model.Feature;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

@Repository
public interface FeatureRepository extends JpaRepository<Feature, UUID>{

    // Labels compare case-insensitively (as in ArboDat 2018 / Access)
    List<Feature> findAllByLabelIgnoreCase(String label);

    List<Feature> findBySiteIdAndLabelIgnoreCase(UUID siteId, String label);

    List<Feature> findBySiteIdIn(Collection<UUID> siteIds);
}
