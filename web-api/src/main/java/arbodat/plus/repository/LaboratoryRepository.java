package arbodat.plus.repository;

import arbodat.plus.model.Laboratory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

@Repository
public interface LaboratoryRepository extends JpaRepository<Laboratory, UUID> {

    // Laboratories with one of the labels (bulk update of the migration)
    List<Laboratory> findByLabelIn(Collection<String> labels);
}
