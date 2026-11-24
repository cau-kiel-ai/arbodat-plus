package arbodat.plus.service;

import org.junit.jupiter.api.Test;

import java.time.Year;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** Excavation years: from 1700 to the current year, each once, without empty entries. */
class ExcavationYearsTest {

    private final int thisYear = Year.now().getValue();

    @Test
    void validYearsAreFrom1700ToTheCurrentYear() {
        assertTrue(ExcavationYears.isValid(1700));
        assertTrue(ExcavationYears.isValid(thisYear));
        assertFalse(ExcavationYears.isValid(1699));
        assertFalse(ExcavationYears.isValid(thisYear + 1));
        assertFalse(ExcavationYears.isValid(19));
        assertFalse(ExcavationYears.isValid(null));
    }

    @Test
    void eachYearOnceInOrderWithoutEmptyEntries() {
        assertEquals(List.of(2013, 2014), ExcavationYears.checked(Arrays.asList(2014, null, 2013, 2014)));
        assertEquals(List.of(), ExcavationYears.checked(null));
    }

    @Test
    void anInvalidYearIsRefusedWithAReadableReason() {
        ExcavationYears.InvalidExcavationYearException e = assertThrows(ExcavationYears.InvalidExcavationYearException.class,
                () -> ExcavationYears.checked(Arrays.asList(2013, 1650, 3025)));
        assertEquals("Invalid excavation years 1650, 3025: an excavation year must be between 1700 and " + thisYear + ".",
                e.getMessage());
        // The migration keeps the valid ones and reports the others
        assertEquals(List.of(2013), ExcavationYears.valid(Arrays.asList(2013, 1650, 3025)));
        assertEquals(List.of(1650, 3025), ExcavationYears.invalid(Arrays.asList(2013, 1650, null, 3025, 1650)));
    }
}
