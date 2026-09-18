package arbodat.plus.controller;

import arbodat.plus.dto_migration.MigrationResponse;
import arbodat.plus.model.ResearchProject;
import arbodat.plus.service.MigrationService;
import com.healthmarketscience.jackcess.Database;
import com.healthmarketscience.jackcess.DatabaseBuilder;
import com.healthmarketscience.jackcess.Row;
import com.healthmarketscience.jackcess.Table;
import org.springframework.beans.factory.annotation.Autowired;
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

        try {
            // Save .mdb file as tempFile on server
            File dataFile = File.createTempFile("uploadedData", ".mdb");
            file.transferTo(dataFile);

            // open site table in .mdb file
            Database db = DatabaseBuilder.open(new File(dataFile.getAbsolutePath()));
            Table table = db.getTable("Projekte");
            if (table == null) {
                throw new IllegalArgumentException("table 'Projekte' doesn't exist");
            }

            // iterate through table
            for (Row row : table) {
                sites.add(row.getString("Projekt")); // add siteLabel
            }

            // Delete tempFile
            dataFile.delete();

        } catch (Exception e) {
            e.printStackTrace();
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

        // Init migration response
        MigrationResponse migrationResponse = new MigrationResponse();

        try {
            // Save .mdb files as tempFiles on server
            File dataFile = File.createTempFile("uploadedData", ".mdb");
            files[0].transferTo(dataFile);

            File strukDataFile = File.createTempFile("uploadedStrukData", ".mdb");
            files[1].transferTo(strukDataFile);

            // Call MigrationService with path to the tempFile and all other transferred parameters
            migrationResponse =  migrationService.migrateData(dataFile.getAbsolutePath(),
                                                              strukDataFile.getAbsolutePath(),
                                                              researchProjectList,
                                                              siteList);

            // Delete tempFiles
            dataFile.delete();
            strukDataFile.delete();

        } catch (Exception e) {
            e.printStackTrace();
        }

        // For Testing
        // System.out.println(migrationResponse);
        return migrationResponse;
    }

//    @PostMapping
//    public String parseJSON (JSON) {
    // ToDo: Dies ist eine parsing function -> danach die schon bestehenden controller vom import nutzen

        // JSONs:
        // const data = {
        //         attribute: attribute,
        //         nonMatchingLabel: nonMatchingLabel,
        //         itemId: itemId
        // };

        // 'itemId'     'attribute'
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

        // ToDo: update 'attribute' vom item mithilfe von 'itemId' mit 'nonMatchingLabel'


        // JSONs with Item:       --------------------------------------------------------

        // const data = {
        //          itemType: "result",
        //          auxiliaryId: item.id,
        //          item: item.result,
        //          nonMatching_taxCode: nonMatchingLabel
        //          nonMatching_cf                  *(optional)
        //          nonMatching_restType            *(optional)
        //          nonMatching_stateOfPreservation *(optional)
        // };
        // ToDO: result item gibt es noch nicht -> soll neu angelegt werden. 'auxiliaryId' kann ignoriert werden.

        //    data = {
        //        itemType: "coordinateSite",
        //        siteId: item.id,
        //        item: { latitude:  latitude,
        //                longitude: longitude,
        //                altitude:  altitude,
        //                remarks:   remarks
        //               },
        //        nonMatching_coordinateSystem: nonMatchingLabel
        //    };
        //    data = {
        //        itemType: "coordinateSample",
        //        sampleId: item.id,
        //        item: { latitude:  latitude,
        //                longitude: longitude,
        //                altitude:  altitude,
        //                remarks:   remarks
        //               },
        //        nonMatching_coordinateSystem: nonMatchingLabel
        //    }
        // ToDO: coordinate item gibt es noch nicht -> soll neu angelegt
        //       und mit site/sample verknüpft werden (gibt es schon controller in site und sample!)

        //    data = {
        //        itemType: "C14Dating",
        //        absoluteDatingId: item.absoluteDatingId,
        //        number: number,
        //        nonMatching_C14LabCode: newC14LabCode
        //    }
        // ToDo: update absoluteDating.C14Dating mit 'C14LabCode' + 'number'

//    }
}