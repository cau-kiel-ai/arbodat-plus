package arbodat.plus.repository;

import arbodat.plus.model.DisplayOrder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface DisplayOrderRepository extends JpaRepository<DisplayOrder, String> {
}
