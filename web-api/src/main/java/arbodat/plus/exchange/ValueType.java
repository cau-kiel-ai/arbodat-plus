package arbodat.plus.exchange;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonNode;

import java.io.IOException;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Date;
import java.util.Objects;

/**
 * How one kind of scalar value is written to JSON, read back and compared.
 * "Empty" (null or a blank string) means "no value": an import never overwrites anything with it.
 */
public abstract class ValueType<V> {

    public static final ValueType<String> STRING = new ValueType<>("string") {
        @Override
        public void write(JsonGenerator gen, String value) throws IOException {
            gen.writeString(value);
        }

        @Override
        public String read(JsonNode node) {
            if (!node.isTextual()) throw new IllegalArgumentException("expected a string");
            return node.textValue();
        }

        @Override
        public boolean isEmpty(String value) {
            return value == null || value.isBlank();
        }
    };

    public static final ValueType<Boolean> BOOLEAN = new ValueType<>("boolean") {
        @Override
        public void write(JsonGenerator gen, Boolean value) throws IOException {
            gen.writeBoolean(value);
        }

        @Override
        public Boolean read(JsonNode node) {
            if (!node.isBoolean()) throw new IllegalArgumentException("expected true or false");
            return node.booleanValue();
        }
    };

    public static final ValueType<Integer> INTEGER = new ValueType<>("integer") {
        @Override
        public void write(JsonGenerator gen, Integer value) throws IOException {
            gen.writeNumber(value);
        }

        @Override
        public Integer read(JsonNode node) {
            if (!node.isIntegralNumber() || !node.canConvertToInt()) throw new IllegalArgumentException("expected a whole number");
            return node.intValue();
        }
    };

    public static final ValueType<Double> DOUBLE = new ValueType<>("number") {
        @Override
        public void write(JsonGenerator gen, Double value) throws IOException {
            gen.writeNumber(value);
        }

        @Override
        public Double read(JsonNode node) {
            if (!node.isNumber()) throw new IllegalArgumentException("expected a number");
            return node.doubleValue();
        }
    };

    /** A point in time, written as an ISO-8601 instant ("2024-05-01T10:15:30Z"). */
    public static final ValueType<Date> INSTANT = new ValueType<>("instant") {
        @Override
        public void write(JsonGenerator gen, Date value) throws IOException {
            gen.writeString(value.toInstant().toString());
        }

        @Override
        public Date read(JsonNode node) {
            if (!node.isTextual()) throw new IllegalArgumentException("expected an ISO-8601 instant");
            try {
                return Date.from(Instant.parse(node.textValue()));
            } catch (DateTimeParseException e) {
                throw new IllegalArgumentException("expected an ISO-8601 instant");
            }
        }

        // java.sql.Timestamp (loaded) vs java.util.Date (read): compare the instant only.
        @Override
        public boolean same(Date a, Date b) {
            return a.getTime() == b.getTime();
        }

        @Override
        public Object display(Date value) {
            return value == null ? null : value.toInstant().toString();
        }
    };

    private final String name;

    private ValueType(String name) {
        this.name = name;
    }

    public abstract void write(JsonGenerator gen, V value) throws IOException;

    /** Reads a non-null JSON value; throws IllegalArgumentException with a short reason otherwise. */
    public abstract V read(JsonNode node);

    public boolean isEmpty(V value) {
        return value == null;
    }

    public boolean same(V a, V b) {
        return Objects.equals(a, b);
    }

    /** The value as shown in the import preview (a JSON scalar). */
    public Object display(V value) {
        return value;
    }

    @Override
    public String toString() {
        return name;
    }
}
