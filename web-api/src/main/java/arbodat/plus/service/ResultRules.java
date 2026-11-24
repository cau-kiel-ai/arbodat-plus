package arbodat.plus.service;

import arbodat.plus.model.Result;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Rules of a result row from ArboDat 2018: a result needs a quantity (count, fragments or weight; -1 as count
 * is the ArboDat convention for "present, not counted") and its entry date can't be in the future.
 * The input form and the explorer are refused (ResultRuleException); the migration creates the results of
 * ArboDat anyway (Access only enforced the quantity in its form) and reports the violations.
 */
public final class ResultRules {

    public static final String NO_QUANTITY = "A result needs a count, fragments or a weight.";
    public static final String FUTURE_ENTRY_DATE = "The entry date of a result can't be in the future.";

    private ResultRules() {}

    public static List<String> violations(Result result) {
        List<String> violations = new ArrayList<>();
        if (!isSet(result.getRestCount()) && !isSet(result.getRestFragment()) && !isSet(result.getRestWeight())) {
            violations.add(NO_QUANTITY);
        }
        // A day of tolerance: the input form sends the date at 00:00 UTC, which may be ahead of the server
        if (result.getEntryDate() != null
                && result.getEntryDate().toInstant().isAfter(Instant.now().plus(Duration.ofDays(1)))) {
            violations.add(FUTURE_ENTRY_DATE);
        }
        return violations;
    }

    public static void check(Result result) {
        List<String> violations = violations(result);
        if (!violations.isEmpty()) {
            throw new ResultRuleException(String.join(" ", violations));
        }
    }

    private static boolean isSet(Number value) {
        return value != null && value.doubleValue() != 0;
    }

    public static class ResultRuleException extends RuntimeException {
        public ResultRuleException(String message) {
            super(message);
        }
    }
}
