package arbodat.plus.exchange;

import java.util.Collection;
import java.util.List;
import java.util.function.BiConsumer;
import java.util.function.Function;
import java.util.function.Supplier;

/**
 * One property of an entity in the JSON exchange format. The kinds are plain data; the export
 * writer and the import reader, planner and applier each handle every kind, so adding a field to
 * {@link ExchangeSchema} makes it round-trip without touching them.
 *
 * <p>{@code name} is the JSON property name and, for import decisions, the field key.
 */
public sealed interface Field<E> {

    String name();

    /** A join table (or element collection table) row: owner id → target id or value. */
    record Link(String table, String ownerColumn, String targetColumn) {}

    /** A plain value (string, number, boolean, instant). */
    record Scalar<E, V>(String name, ValueType<V> type, Function<E, V> get, BiConsumer<E, V> set) implements Field<E> {}

    /** A many-to-one reference to a DANTE vocabulary value, written as the full lookup object. */
    record LookupRef<E, L>(String name, EntityType target, Function<E, L> get, BiConsumer<E, L> set) implements Field<E> {}

    /** A many-to-many set of vocabulary values, written as an array of lookup objects. */
    record LookupSet<E, L>(String name, EntityType target, Function<E, ? extends Collection<L>> get, Link link) implements Field<E> {}

    /**
     * A nested object without an id of its own: a one-to-one value object (address, coordinate),
     * created when first needed, or ({@code factory == null}) a group of the entity's own columns
     * (the result's "fraction").
     */
    record Embedded<E, X>(String name, Function<E, X> get, BiConsumer<E, X> set, Supplier<X> factory,
                          List<Field<X>> fields) implements Field<E> {}

    /** An element collection of plain values (activity numbers, excavation years). */
    record ValueList<E, V>(String name, ValueType<V> type, Function<E, ? extends Collection<V>> get, Link link) implements Field<E> {}

    /** A many-to-many set of shared records (people, institutions, literature, authors), written in full. */
    record SharedSet<E, R>(String name, EntityType target, Function<E, ? extends Collection<R>> get, Link link) implements Field<E> {}

    /** A many-to-one reference to a shared record (a laboratory), written in full. */
    record SharedRef<E, R>(String name, EntityType target, Function<E, R> get, BiConsumer<E, R> set) implements Field<E> {}

    /**
     * A one-to-one part that lives in its own table, written nested in its owner (an absolute
     * dating's C14, dendro or other dating). The owner holds the foreign key.
     */
    record OwnedRef<E, C>(String name, EntityType target, Function<E, C> get, BiConsumer<E, C> set) implements Field<E> {}

    /**
     * A many-to-many set of plain ids. {@code written}: a JSON array of id strings (a result's
     * absoluteDatingIds); otherwise implied by nesting (the research projects a site is listed under).
     */
    record IdSet<E>(String name, EntityType target, Link link, boolean written) implements Field<E> {}

    /** The many-to-one link to the parent record; implied by nesting, never written. */
    record Parent<E, P>(String name, EntityType target, Function<E, P> get, BiConsumer<E, P> set) implements Field<E> {}

    /**
     * Nested child records. {@code manyToMany}: the child also lists this record in its own
     * IdSet (a site under several research projects) instead of having it as its parent.
     */
    record Children<E>(String name, EntityType target, boolean manyToMany) implements Field<E> {}
}
