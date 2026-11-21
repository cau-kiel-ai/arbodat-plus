package arbodat.plus.repository;

import arbodat.plus.model.C14Dating;
import jakarta.persistence.QueryHint;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.QueryHints;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface C14DatingRepository extends JpaRepository<C14Dating, UUID> {
    // Laboratory + number is unique (see C14Dating). Doesn't flush first: the check runs before a
    // changed dating is saved, so that the database's own (less readable) refusal doesn't come first.
    @QueryHints(@QueryHint(name = "org.hibernate.flushMode", value = "COMMIT"))
    Optional<C14Dating> findByC14LaboratoryIdAndNumber(String laboratoryId, String number);
}
