package arbodat.plus.exchange;

/**
 * Every kind of record in the JSON exchange format (export and import).
 * <ul>
 *   <li>DATA: the research data tree, keyed by UUID.</li>
 *   <li>SHARED: people, institutions, literature and labs, embedded wherever they are referenced, keyed by UUID.</li>
 *   <li>LOOKUP: DANTE vocabulary values, keyed by their URI.</li>
 * </ul>
 */
public enum EntityType {
    // Lookups (DANTE vocabularies)
    LICENSE(Kind.LOOKUP),
    TAXONOMY(Kind.LOOKUP),
    SITE_TYPE(Kind.LOOKUP),
    NATURAL_UNIT(Kind.LOOKUP),
    FEATURE_TYPE(Kind.LOOKUP),
    PRESERVATION_CONDITION(Kind.LOOKUP),
    SAMPLE_TYPE(Kind.LOOKUP),
    SAMPLE_INVESTIGATED(Kind.LOOKUP),
    CHRONOZONE(Kind.LOOKUP),
    MATERIAL(Kind.LOOKUP),
    DATING_METHOD(Kind.LOOKUP),
    C14_LABORATORY(Kind.LOOKUP),
    COORDINATE_SYSTEM(Kind.LOOKUP),
    STATE_OF_PRESERVATION(Kind.LOOKUP),
    CLASSIFICATION_CONFER(Kind.LOOKUP),
    TAX_CODE(Kind.LOOKUP),
    REST_TYPE(Kind.LOOKUP),

    // Shared records
    INSTITUTION(Kind.SHARED),
    USER(Kind.SHARED),
    AUTHOR(Kind.SHARED),
    LITERATURE(Kind.SHARED),
    LABORATORY(Kind.SHARED),

    // Research data, parents before children
    RESEARCH_PROJECT(Kind.DATA),
    SITE(Kind.DATA),
    FEATURE(Kind.DATA),
    SAMPLE(Kind.DATA),
    FRACTION_ANALYZED(Kind.DATA),
    DENDROCHRONOLOGICAL_DATING(Kind.DATA),
    C14_DATING(Kind.DATA),
    OTHER_DATING(Kind.DATA),
    ABSOLUTE_DATING(Kind.DATA),
    RESULT(Kind.DATA);

    public enum Kind { LOOKUP, SHARED, DATA }

    private final Kind kind;

    EntityType(Kind kind) {
        this.kind = kind;
    }

    public Kind kind() {
        return kind;
    }

    public boolean isLookup() {
        return kind == Kind.LOOKUP;
    }
}
