package arbodat.plus.model;

import arbodat.plus.service.Vocabularies;
import jakarta.persistence.PrePersist;

/**
 * Checks a vocabulary term before it is created, on every way (controllers, cascades, migration, import): its
 * URI must belong to the DANTE vocabulary of its table or be a local ArboDat+ term of it (see Vocabularies).
 */
public class VocabularyTermListener {

    @PrePersist
    void checkNamespace(Object term) {
        Vocabularies.checked(term);
    }
}
