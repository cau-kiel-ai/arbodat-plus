package arbodat.plus.service;

import java.time.Year;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Objects;

/**
 * Excavation years of a feature: from 1700 to the current year (ArboDat 2018: 1901 to the current year, extended
 * for older excavations), each year once, without empty entries.
 */
public final class ExcavationYears {

    public static final int MIN = 1700;

    private ExcavationYears() {}

    public static boolean isValid(Object year) {
        return year instanceof Integer y && y >= MIN && y <= Year.now().getValue();
    }

    // The valid years, each once, in ascending order
    public static List<Integer> valid(Collection<Integer> years) {
        if (years == null) return new ArrayList<>();
        // Mutable: the list is the JPA element collection of the feature
        return new ArrayList<>(years.stream().filter(ExcavationYears::isValid).distinct().sorted().toList());
    }

    // The years which aren't valid (empty entries don't count, they are just left out)
    public static List<Integer> invalid(Collection<Integer> years) {
        if (years == null) return List.of();
        return years.stream().filter(Objects::nonNull).filter(year -> !isValid(year)).distinct().toList();
    }

    // The years, each once, in ascending order; refused if one of them isn't valid
    public static List<Integer> checked(Collection<Integer> years) {
        List<Integer> invalid = invalid(years);
        if (!invalid.isEmpty()) {
            throw new InvalidExcavationYearException("Invalid excavation year" + (invalid.size() == 1 ? " " : "s ")
                    + invalid.stream().map(String::valueOf).reduce((a, b) -> a + ", " + b).orElse("")
                    + ": an excavation year must be between " + MIN + " and " + Year.now().getValue() + ".");
        }
        return valid(years);
    }

    public static class InvalidExcavationYearException extends RuntimeException {
        public InvalidExcavationYearException(String message) {
            super(message);
        }
    }
}
