package arbodat.plus.controller;

import arbodat.plus.dataimport.Decisions;
import arbodat.plus.dataimport.ImportException;
import arbodat.plus.dataimport.ImportService;
import arbodat.plus.dataimport.PlanView;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Imports a JSON export (see ExportController) into this database, merging it with the data here.
 * Both endpoints take the file (multipart "file") and, optionally, the user's decisions so far
 * (multipart "decisions", JSON, see {@link Decisions}).
 */
@RestController
@RequestMapping("/data_import")
public class ImportController {

    private final ImportService importService;
    private final ObjectMapper mapper;

    public ImportController(ImportService importService, ObjectMapper mapper) {
        this.importService = importService;
        this.mapper = mapper;
    }

    /** What the import would do. Writes nothing. */
    @PostMapping(value = "/preview", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public PlanView preview(@RequestParam("file") MultipartFile file,
                            @RequestParam(value = "decisions", required = false) String decisions) throws IOException {
        try (InputStream in = file.getInputStream()) {
            return importService.preview(in, parse(decisions));
        }
    }

    /**
     * Runs the import, all or nothing. 409 (with the new preview as "plan") when the data changed
     * since the preview with decisions.planFingerprint; 422 when decisions are still missing.
     */
    @PostMapping(value = "/commit", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ImportService.CommitResult commit(@RequestParam("file") MultipartFile file,
                                             @RequestParam("decisions") String decisions) throws IOException {
        try (InputStream in = file.getInputStream()) {
            return importService.commit(in, parse(decisions));
        }
    }

    private Decisions parse(String json) {
        if (json == null || json.isBlank()) return Decisions.none();
        try {
            return mapper.readValue(json, Decisions.class);
        } catch (JsonProcessingException e) {
            throw ImportException.invalidDecisions("The decisions are not valid JSON: " + e.getOriginalMessage());
        }
    }

    @ExceptionHandler(ImportException.class)
    public ResponseEntity<Map<String, Object>> handleImportException(ImportException e) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("reason", e.reason());
        body.put("message", e.getMessage());
        if (e.plan() != null) body.put("plan", e.plan());
        return ResponseEntity.status(e.status()).body(body);
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, Object>> handleTooLarge(MaxUploadSizeExceededException e) {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body(Map.of("reason", "FILE_TOO_LARGE", "message", "The file is larger than the upload limit."));
    }
}
