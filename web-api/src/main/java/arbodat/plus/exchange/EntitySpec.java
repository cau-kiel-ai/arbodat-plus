package arbodat.plus.exchange;

import java.util.List;
import java.util.function.Function;

/**
 * The exchange format of one entity: its id and its fields in the order they are written.
 * Lookups have a String (URI) id, everything else a UUID.
 */
public record EntitySpec<E>(EntityType type, Class<E> entityClass, Function<E, Object> id, List<Field<E>> fields) {

    public Field<E> field(String name) {
        for (Field<E> field : fields) {
            if (field.name().equals(name)) return field;
        }
        return null;
    }
}
