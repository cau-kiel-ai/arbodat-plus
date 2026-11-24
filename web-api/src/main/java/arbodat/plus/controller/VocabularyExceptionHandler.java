package arbodat.plus.controller;

import arbodat.plus.service.Vocabularies;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** A vocabulary term of a wrong or unknown vocabulary is refused (400), whichever controller tried to create it. */
@RestControllerAdvice
public class VocabularyExceptionHandler {

    @ExceptionHandler(Vocabularies.UnknownVocabularyTermException.class)
    public ResponseEntity<String> handleUnknownTerm(Vocabularies.UnknownVocabularyTermException e) {
        return ResponseEntity.badRequest().body(e.getMessage());
    }
}
