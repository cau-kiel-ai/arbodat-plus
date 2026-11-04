package arbodat.plus.controller;

import arbodat.plus.dto_migration.MigrationResponse;
import arbodat.plus.model.ResearchProject;
import arbodat.plus.service.MigrationService;
import com.healthmarketscience.jackcess.Database;
import com.healthmarketscience.jackcess.DatabaseBuilder;
import com.healthmarketscience.jackcess.Row;
import com.healthmarketscience.jackcess.Table;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@RestController
@RequestMapping("/migration")
public class MigrationController {

    private static final Logger log = LoggerFactory.getLogger(MigrationController.class);

    @Autowired
    private MigrationService migrationService;

    /**
     * Endpoint for upload .mdb file to get its site list.
     *
     * @param file .mdb file (data)
     * @return List of site labels.
     */
    @PostMapping("/getSites")
    public List<String> getSites(@RequestParam MultipartFile file) throws Exception {

        List<String> sites = new ArrayList<>();

        // Save .mdb file as tempFile on server
        File dataFile = File.createTempFile("uploadedData", ".mdb");
        try {
            file.transferTo(dataFile);

            // open site table in .mdb file
            try (Database db = DatabaseBuilder.open(dataFile)) {
                Table table = db.getTable("Projekte");
                if (table == null) {
                    throw new IllegalArgumentException("table 'Projekte' doesn't exist");
                }

                // iterate through table
                for (Row row : table) {
                    sites.add(row.getString("Projekt")); // add siteLabel
                }
            }
        } finally {
            // Delete tempFile
            dataFile.delete();
        }
        return sites;
    }

    /**
     * Endpoint for data migration from ArboDat.
     *
     * @param files .mdb file (data, strukData)
     * @param researchProjectList list of research project objects
     * @param siteList list of site labels
     * @return migrationResponse (NonMatchingDanteAttribute,
     *                            LiteratureMigration,
     *                            CoordinateMigration,
     *                            UserMigration,
     *                            FractionAnalyzedMigration,
     *                            LabAndNumberMigration,
     *                            existingSiteList,
     *                            existingFeatureList,
     *                            existingSampleList,
     *                            existingAbsoluteDatingList)
     */
    @PostMapping
    public MigrationResponse migrateData(@RequestPart MultipartFile[] files,
                                         @RequestPart List<ResearchProject> researchProjectList,
                                         @RequestPart List<String> siteList) throws Exception {

        // Save .mdb files as tempFiles on server
        File dataFile = File.createTempFile("uploadedData", ".mdb");
        File strukDataFile = File.createTempFile("uploadedStrukData", ".mdb");
        MigrationResponse migrationResponse;

        try {
            files[0].transferTo(dataFile);
            files[1].transferTo(strukDataFile);

            // Call MigrationService with path to the tempFile and all other transferred parameters
            migrationResponse = migrationService.migrateData(dataFile.getAbsolutePath(),
                                                             strukDataFile.getAbsolutePath(),
                                                             researchProjectList,
                                                             siteList);
        } finally {
            // Delete tempFiles
            dataFile.delete();
            strukDataFile.delete();
        }

        // For Testing
        // System.out.println(migrationResponse);
        return migrationResponse;
    }

    /**
     * Returns the reason of a failed request to the frontend, instead of an empty result.
     */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<String> handleInvalidInput(IllegalArgumentException e) {
        log.error("Migration request rejected", e);
        return ResponseEntity.badRequest().body(e.getMessage());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<String> handleFailure(Exception e) {
        log.error("Migration failed", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(e.getClass().getSimpleName() + ": " + e.getMessage());
    }

//    @PostMapping
//    public String parseJSON (JSON) {
    // ToDo: Dies ist eine parsing function -> danach die schon bestehenden controller vom import nutzen

        // One entry covers ALL rows with the same attribute and nonMatchingLabel.
        // JSONs:
        // const data = {
        //         attribute: attribute,
        //         nonMatchingLabel: nonMatchingLabel,
        //         itemIds: [itemId, ...]
        // };

        // 'itemIds'    'attribute'
        // -----------------------------------
        // site:        siteType
        //              naturalUnit

        // feature:     featureType
        //              preservationCondition

        // sample:      sampleType
        //              chronozone
        //              archaeologicalDating
        //              culturalGroup
        //              seedsAndFruits
        //              charcoalInvestigated
        //              woodSubfossile

        // abs.Dating:  material
        //              datingMethod

        // result:      cf
        //              restType
        //              stateOfPreservation

        // ToDo: update 'attribute' vom jedem item aus 'itemIds' mit 'nonMatchingLabel'


        // JSONs with Items:      --------------------------------------------------------
        // One entry covers all rows with the same nonMatching_* value(s); every row has its own element in 'items'.

        // const data = {
        //          itemType: "result",
        //          nonMatching_taxCode: { nonMatching_taxCode: label, taxonomy: taxonomy } *(optional)
        //          nonMatching_cf                  *(optional)
        //          nonMatching_restType            *(optional)
        //          nonMatching_stateOfPreservation *(optional)
        //          items: [result, ...]   // sample only contains the id
        // };
        // ToDO: result items gibt es noch nicht -> sollen neu angelegt werden.

        //    data = {
        //        itemType: "coordinateSite",
        //        nonMatching_coordinateSystem: nonMatchingLabel,
        //        items: [{ siteId:         siteId,
        //                  latitude:       latitude,
        //                  longitude:      longitude,
        //                  altitude:       altitude,
        //                  latitudeWgs84:  latitudeWgs84,
        //                  longitudeWgs84: longitudeWgs84,
        //                  remarks:        remarks
        //                }, ...]
        //    };
        //    data = {
        //        itemType: "coordinateSample",
        //        nonMatching_coordinateSystem: nonMatchingLabel,
        //        items: [{ sampleId: sampleId, ...same fields as above }, ...]
        //    }
        // ToDO: coordinate items gibt es noch nicht -> sollen neu angelegt
        //       und mit site/sample verknüpft werden (gibt es schon controller in site und sample!)

        //    data = {
        //        itemType: "C14Dating",
        //        nonMatching_C14LabCode: newC14LabCode,
        //        items: [{ absoluteDatingId: absoluteDatingId, number: number }, ...]
        //    }
        // ToDo: update absoluteDating.C14Dating mit 'C14LabCode' + 'number' (für jedes item)

//    }
}