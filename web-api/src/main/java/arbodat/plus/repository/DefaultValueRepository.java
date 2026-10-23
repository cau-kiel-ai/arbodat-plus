package arbodat.plus.repository;

import arbodat.plus.model.DefaultValue;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface DefaultValueRepository extends JpaRepository<DefaultValue, String> {
}
