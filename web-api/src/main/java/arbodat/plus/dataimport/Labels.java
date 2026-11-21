package arbodat.plus.dataimport;

import arbodat.plus.exchange.EntityType;
import arbodat.plus.exchange.ExchangeSchema;
import arbodat.plus.exchange.Field;
import arbodat.plus.model.*;

import java.util.Objects;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/** How records are named in the import preview, for imported records and existing ones alike. */
final class Labels {

    private static final String SEP = " › ";

    private Labels() {}

    static String record(ImportGraph graph, ImportRecord r) {
        return switch (r.type) {
            case RESEARCH_PROJECT -> r.string("projectName");
            case SITE, FEATURE, SAMPLE, INSTITUTION, LABORATORY -> r.string("label");
            case FRACTION_ANALYZED -> join(" / ", r.values.get("fractionAnalyzed"), r.values.get("orgOrMin"), r.values.get("sieveSize"));
            case ABSOLUTE_DATING -> r.string("subSample");
            case C14_DATING, DENDROCHRONOLOGICAL_DATING, OTHER_DATING -> r.string("number");
            case RESULT -> {
                ImportRecord taxCode = r.values.get("taxCode") == null ? null : graph.get(EntityType.TAX_CODE, r.values.get("taxCode"));
                yield taxCode == null ? "(no taxon)" : taxCode.string("label");
            }
            case USER, AUTHOR -> person(r.string("lastName"), r.string("firstName"), r.string("middleName"));
            case LITERATURE -> r.string("shortCitation") != null ? r.string("shortCitation") : r.string("title");
            default -> r.string("label") != null ? r.string("label") : String.valueOf(r.id);
        };
    }

    /** The record with its ancestors, e.g. "Haithabu › Pit 7 › S-1". */
    static String recordPath(ImportGraph graph, ImportRecord r) {
        String label = Objects.requireNonNullElse(record(graph, r), "?");
        EntityType parentType = parentType(r.type);
        if (parentType == null || r.parentId == null) return label;
        ImportRecord parent = graph.get(parentType, r.parentId);
        return parent == null ? label : recordPath(graph, parent) + SEP + label;
    }

    static String entity(EntityType type, Object e) {
        if (e == null) return null;
        return switch (type) {
            case RESEARCH_PROJECT -> ((ResearchProject) e).getProjectName();
            case SITE -> ((Site) e).getLabel();
            case FEATURE -> ((Feature) e).getLabel();
            case SAMPLE -> ((Sample) e).getLabel();
            case FRACTION_ANALYZED -> {
                FractionAnalyzed f = (FractionAnalyzed) e;
                yield join(" / ", f.getFractionAnalyzed(), f.getOrgOrMin(), f.getSieveSize());
            }
            case ABSOLUTE_DATING -> ((AbsoluteDating) e).getSubSample();
            case C14_DATING -> ((C14Dating) e).getNumber();
            case DENDROCHRONOLOGICAL_DATING -> ((DendrochronologicalDating) e).getNumber();
            case OTHER_DATING -> ((OtherDating) e).getNumber();
            case RESULT -> {
                TaxCode taxCode = ((Result) e).getTaxCode();
                yield taxCode == null ? "(no taxon)" : taxCode.getLabel();
            }
            case USER -> {
                User u = (User) e;
                yield person(u.getLastName(), u.getFirstName(), u.getMiddleName());
            }
            case AUTHOR -> {
                Author a = (Author) e;
                yield person(a.getLastName(), a.getFirstName(), a.getMiddleName());
            }
            case INSTITUTION -> ((Institution) e).getLabel();
            case LABORATORY -> ((Laboratory) e).getLabel();
            case LITERATURE -> {
                Literature l = (Literature) e;
                yield l.getShortCitation() != null ? l.getShortCitation() : l.getTitle();
            }
            default -> lookupLabel(type, e);
        };
    }

    /** The existing record with its ancestors. */
    static String entityPath(EntityType type, Object e) {
        String label = Objects.requireNonNullElse(entity(type, e), "?");
        return switch (type) {
            case FEATURE -> prefix(SITE_OF.apply(((Feature) e).getSite()), label);
            case SAMPLE -> prefix(featurePath(((Sample) e).getFeature()), label);
            case FRACTION_ANALYZED -> prefix(samplePath(((FractionAnalyzed) e).getSample()), label);
            case ABSOLUTE_DATING -> prefix(samplePath(((AbsoluteDating) e).getSample()), label);
            case RESULT -> prefix(samplePath(((Result) e).getSample()), label);
            case USER -> {
                User u = (User) e;
                yield u.getOrcid() == null ? label : label + " (ORCID " + u.getOrcid() + ")";
            }
            case INSTITUTION -> {
                Institution i = (Institution) e;
                yield i.getRorId() == null ? label : label + " (" + i.getRorId() + ")";
            }
            case LITERATURE -> {
                Literature l = (Literature) e;
                yield l.getPublicationYear() == null ? label : label + " (" + l.getPublicationYear() + ")";
            }
            default -> label;
        };
    }

    private static final java.util.function.Function<Site, String> SITE_OF = s -> s == null ? null : s.getLabel();

    private static String featurePath(Feature f) {
        return f == null ? null : prefix(SITE_OF.apply(f.getSite()), f.getLabel());
    }

    private static String samplePath(Sample s) {
        return s == null ? null : prefix(featurePath(s.getFeature()), s.getLabel());
    }

    private static String prefix(String parent, String label) {
        return parent == null ? label : parent + SEP + label;
    }

    /** A vocabulary value's "label" (every lookup spec has one). */
    @SuppressWarnings("unchecked")
    static String lookupLabel(EntityType type, Object lookup) {
        if (lookup == null) return null;
        Field.Scalar<Object, ?> label = (Field.Scalar<Object, ?>) ExchangeSchema.spec(type).field("label");
        Object value = label == null ? null : label.get().apply(lookup);
        return value == null ? null : value.toString();
    }

    static EntityType parentType(EntityType type) {
        return switch (type) {
            case FEATURE -> EntityType.SITE;
            case SAMPLE -> EntityType.FEATURE;
            case FRACTION_ANALYZED, ABSOLUTE_DATING, RESULT -> EntityType.SAMPLE;
            case C14_DATING, DENDROCHRONOLOGICAL_DATING, OTHER_DATING -> EntityType.ABSOLUTE_DATING;
            default -> null;
        };
    }

    private static String person(String last, String first, String middle) {
        String given = Stream.of(first, middle).filter(s -> s != null && !s.isBlank()).collect(Collectors.joining(" "));
        if (last == null || last.isBlank()) return given.isEmpty() ? null : given;
        return given.isEmpty() ? last : last + ", " + given;
    }

    private static String join(String sep, Object... parts) {
        String joined = Stream.of(parts).filter(Objects::nonNull).map(Object::toString).collect(Collectors.joining(sep));
        return joined.isEmpty() ? null : joined;
    }
}
