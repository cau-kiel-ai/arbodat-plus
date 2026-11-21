package arbodat.plus.dataimport;

import java.util.List;

/**
 * What happens to one imported record.
 * <ul>
 *   <li>CREATE: inserted as a new record, normally keeping its id ({@code targetId}).</li>
 *   <li>MATCH: merged into the existing record {@code targetId}.</li>
 *   <li>AMBIGUOUS: several existing records fit ({@code candidates}); the user has to choose.</li>
 *   <li>PENDING: depends on an ambiguous parent; decided once that is.</li>
 * </ul>
 */
final class Resolution {

    enum Action { CREATE, MATCH, AMBIGUOUS, PENDING }

    /** ID: same id; KEY: same label (or other natural key); CHOICE: picked by the user. */
    enum MatchedBy { ID, KEY, CHOICE }

    final Action action;
    final Object targetId;
    final MatchedBy matchedBy;
    final String reason;
    List<Object> candidates = List.of();

    private Resolution(Action action, Object targetId, MatchedBy matchedBy, String reason) {
        this.action = action;
        this.targetId = targetId;
        this.matchedBy = matchedBy;
        this.reason = reason;
    }

    static Resolution create(Object id) {
        return new Resolution(Action.CREATE, id, null, null);
    }

    static Resolution match(Object targetId, MatchedBy by) {
        return new Resolution(Action.MATCH, targetId, by, null);
    }

    /** reason: MULTIPLE_MATCHES or TARGET_CLAIMED_TWICE. */
    static Resolution ambiguous(String reason, List<Object> candidates) {
        Resolution r = new Resolution(Action.AMBIGUOUS, null, null, reason);
        r.candidates = candidates;
        return r;
    }

    static Resolution pending() {
        return new Resolution(Action.PENDING, null, null, null);
    }

    boolean resolved() {
        return action == Action.CREATE || action == Action.MATCH;
    }

    Resolution withCandidates(List<Object> candidates) {
        this.candidates = candidates;
        return this;
    }
}
