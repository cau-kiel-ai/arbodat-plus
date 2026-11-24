package arbodat.plus.controller;

import com.fasterxml.jackson.databind.JsonMappingException;
import com.fasterxml.jackson.databind.exc.InvalidFormatException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.stream.Collectors;

/**
 * A request body with a value of the wrong type is refused (400) with the field and the value, e.g.
 * "altitude: '12,5a' is not a number", so the frontend can show it at the field, whichever controller it was.
 */
@RestControllerAdvice
public class RequestBodyExceptionHandler {

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<String> handleNotReadable(HttpMessageNotReadableException e) {
        if (e.getCause() instanceof InvalidFormatException invalid) {
            return ResponseEntity.badRequest().body(message(invalid));
        }
        return ResponseEntity.badRequest().body("The request could not be read.");
    }

    static String message(InvalidFormatException e) {
        String field = e.getPath().stream()
                .map(reference -> reference.getFieldName() != null ? reference.getFieldName() : "[" + reference.getIndex() + "]")
                .collect(Collectors.joining(".")).replace(".[", "[");
        Class<?> type = e.getTargetType();
        String expected = type != null && (Number.class.isAssignableFrom(type) || (type.isPrimitive() && type != boolean.class))
                ? "a number" : "a valid " + (type == null ? "value" : type.getSimpleName());
        return (field.isEmpty() ? "" : field + ": ") + "'" + e.getValue() + "' is not " + expected;
    }
}
