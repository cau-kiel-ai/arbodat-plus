package arbodat.plus.controller;

import arbodat.plus.service.ExportFilter;
import arbodat.plus.service.ExportService;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.util.List;
import java.util.UUID;
import java.util.zip.GZIPOutputStream;

@RestController
@RequestMapping("/data_export")
public class ExportController {

    private final ExportService exportService;

    public ExportController(ExportService exportService) {
        this.exportService = exportService;
    }

    @GetMapping
    public ResponseEntity<StreamingResponseBody> exportData(
            @RequestParam(name = "export_file_name", required = false) String exportFileName,
            @RequestParam(name = "research_projects", required = false) List<UUID> researchProjects,
            @RequestParam(name = "sites", required = false) List<UUID> sites,
            @RequestParam(name = "features", required = false) List<UUID> features,
            @RequestParam(name = "samples", required = false) List<UUID> samples
    ) {

        ExportFilter filter = ExportFilter.of(researchProjects, sites, features, samples);

        StreamingResponseBody body = out -> {
            try (GZIPOutputStream gzip = new GZIPOutputStream(out, 8192)) {
                exportService.writeExport(gzip, filter);
            }
        };

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_ENCODING, "gzip")
                .contentType(MediaType.APPLICATION_JSON)
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + exportFileName + ".json\""
                )
                .body(body);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<String> handleInvalidFilter(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(ex.getMessage());
    }
}
