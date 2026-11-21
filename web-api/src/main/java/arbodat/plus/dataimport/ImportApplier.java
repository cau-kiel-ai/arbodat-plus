package arbodat.plus.dataimport;

import arbodat.plus.dataimport.Resolution.Action;
import arbodat.plus.exchange.EntitySpec;
import arbodat.plus.exchange.EntityType;
import arbodat.plus.exchange.ExchangeSchema;
import arbodat.plus.exchange.Field;
import arbodat.plus.exchange.Field.*;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.hibernate.engine.spi.SessionFactoryImplementor;
import org.hibernate.persister.entity.AbstractEntityPersister;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * Writes a plan into the database, inside the caller's transaction, parents before children:
 * vocabulary values, shared records, then research project → site → feature → sample → fraction →
 * datings → absolute dating → result, and all links last.
 *
 * <p>New records keep their imported id: a row with only the id is inserted first (the entities
 * generate their ids, which would replace it), then loaded and filled like any other record.
 */
@Component
class ImportApplier {

    @PersistenceContext
    private EntityManager em;
    private final JdbcTemplate jdbc;

    ImportApplier(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    List<ImportService.Outcome> apply(ImportPlan plan, Decisions decisions) {
        Map<ImportRecord, List<ImportPlan.Change>> changes = new HashMap<>();
        for (ImportPlan.Change change : plan.changes) {
            if (!change.conflict() || decisions.take(change.record().key(), change.record().type, change.field())) {
                changes.computeIfAbsent(change.record(), r -> new ArrayList<>()).add(change);
            }
        }

        List<ImportService.Outcome> outcomes = new ArrayList<>();
        for (EntityType type : EntityType.values()) {
            Collection<ImportRecord> records = plan.graph.of(type);
            if (records.isEmpty()) continue;
            EntitySpec<Object> spec = ExchangeSchema.spec(type);

            List<ImportRecord> creates = new ArrayList<>();
            for (ImportRecord record : records) {
                if (plan.resolution(type, record.id).action == Action.CREATE) creates.add(record);
            }
            if (!creates.isEmpty()) {
                em.flush();
                List<Object[]> ids = creates.stream().map(r -> new Object[]{plan.resolution(type, r.id).targetId}).toList();
                jdbc.batchUpdate("INSERT INTO " + table(spec.entityClass()) + " (id) VALUES (?)", ids);
                Map<Object, Object> created = new HashMap<>();
                for (List<Object> chunk : ImportPlanner.chunks(ids.stream().map(row -> row[0]).toList())) {
                    for (Object e : em.createQuery("select e from " + spec.entityClass().getSimpleName() + " e where e.id in :ids",
                            Object.class).setParameter("ids", chunk).getResultList()) {
                        created.put(spec.id().apply(e), e);
                    }
                }
                for (ImportRecord record : creates) {
                    setAll(plan, spec.fields(), created.get(plan.resolution(type, record.id).targetId), record, "");
                }
            }

            int updated = 0;
            for (ImportRecord record : records) {
                List<ImportPlan.Change> toApply = changes.get(record);
                Resolution r = plan.resolution(type, record.id);
                if (toApply == null || r.action != Action.MATCH) continue;
                Object entity = em.find(spec.entityClass(), r.targetId);
                for (ImportPlan.Change change : toApply) {
                    set(plan, spec.fields(), entity, record, change.field(), change.field());
                }
                updated++;
            }
            em.flush();
            em.clear();
            if (!creates.isEmpty() || updated > 0) outcomes.add(new ImportService.Outcome(type, creates.size(), updated));
        }

        Map<Link, List<Object[]>> rows = new LinkedHashMap<>();
        for (ImportPlan.LinkAdd link : plan.links) {
            for (Object target : link.targets()) {
                rows.computeIfAbsent(link.link(), l -> new ArrayList<>()).add(new Object[]{link.ownerId(), target});
            }
        }
        rows.forEach((link, values) -> jdbc.batchUpdate("INSERT INTO " + link.table() + " (" + link.ownerColumn() + ", "
                + link.targetColumn() + ") VALUES (?, ?) ON CONFLICT DO NOTHING", values));
        return outcomes;
    }

    /** Sets every imported value of a new record. */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private void setAll(ImportPlan plan, List<? extends Field<?>> fields, Object entity, ImportRecord record, String prefix) {
        for (Field<?> field : fields) {
            String key = prefix + field.name();
            if (field instanceof Embedded e) {
                if (!record.embedded.contains(key)) continue;
                setAll(plan, e.fields(), part(e, entity), record, key + ".");
            } else if (isSingleValued(field)) {
                set(plan, fields, entity, record, key, field.name());
            }
            // Sets and value lists: written as links; children: records of their own
        }
    }

    /**
     * Sets one value: {@code key} is the record's value key ("address.country"), {@code path}
     * what is left of it below {@code entity}.
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private void set(ImportPlan plan, List<? extends Field<?>> fields, Object entity, ImportRecord record, String key, String path) {
        int dot = path.indexOf('.');
        String name = dot < 0 ? path : path.substring(0, dot);
        Field<?> field = fields.stream().filter(f -> f.name().equals(name)).findFirst()
                .orElseThrow(() -> new IllegalStateException(record.type + " has no field " + key));
        if (field instanceof Embedded e) {
            set(plan, e.fields(), part(e, entity), record, key, path.substring(dot + 1));
        } else if (field instanceof Scalar s) {
            // Also "" on a new record: it is created as it was exported. (A change never carries an empty value.)
            Object value = record.values.get(key);
            if (value != null) s.set().accept(entity, value);
        } else if (field instanceof LookupRef l) {
            Object uri = record.values.get(key);
            if (uri != null) l.set().accept(entity, reference(l.target(), uri));
        } else if (field instanceof SharedRef r) {
            Object target = plan.target(r.target(), record.values.get(key));
            if (target != null) r.set().accept(entity, reference(r.target(), target));
        } else if (field instanceof OwnedRef o) {
            Object imported = record.values.get(key);
            Object target = plan.keptWithOwner.contains(imported) ? null : plan.target(o.target(), imported);
            if (target != null) o.set().accept(entity, reference(o.target(), target));
        } else if (field instanceof Parent p) {
            Object target = record.parentId == null ? null : plan.target(p.target(), record.parentId);
            if (target != null) p.set().accept(entity, reference(p.target(), target));
        }
    }

    private static boolean isSingleValued(Field<?> field) {
        return field instanceof Scalar || field instanceof LookupRef || field instanceof SharedRef
                || field instanceof OwnedRef || field instanceof Parent;
    }

    /** The embedded object (an address, a coordinate), created when the entity has none yet. */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private static Object part(Embedded e, Object entity) {
        Object part = e.get().apply(entity);
        if (part == null) {
            part = e.factory().get();
            e.set().accept(entity, part);
        }
        return part;
    }

    private Object reference(EntityType type, Object id) {
        return em.getReference(ExchangeSchema.spec(type).entityClass(), id);
    }

    private String table(Class<?> entityClass) {
        SessionFactoryImplementor factory = em.getEntityManagerFactory().unwrap(SessionFactoryImplementor.class);
        return ((AbstractEntityPersister) factory.getMappingMetamodel().getEntityDescriptor(entityClass)).getTableName();
    }
}
