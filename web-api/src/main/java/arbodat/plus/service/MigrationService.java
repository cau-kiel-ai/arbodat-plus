package arbodat.plus.service;

import arbodat.plus.dto_migration.*;
import arbodat.plus.model.*;
import arbodat.plus.repository.*;

import arbodat.plus.service.migration_mapper.*;
import com.healthmarketscience.jackcess.Database;
import com.healthmarketscience.jackcess.DatabaseBuilder;
import com.healthmarketscience.jackcess.Table;
import com.healthmarketscience.jackcess.Row;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Example;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;

@Service
public class MigrationService {

    @Autowired
    ResearchProjectService researchProjectService;

    @Autowired
    SiteTypeMapper siteTypeMapper;

    @Autowired
    NaturalUnitMapper naturalUnitMapper;

    @Autowired
    FeatureTypeMapper featureTypeMapper;

    @Autowired
    PreservationConditionMapper preservationConditionMapper;

    @Autowired
    ChronozoneMapper chronozoneMapper;

    @Autowired
    SampleTypeMapper sampleTypeMapper;

    @Autowired
    SampleInvestigatedMapper sampleInvestigatedMapper;

    @Autowired
    DatingMethodMapper datingMethodMapper;

    @Autowired
    ClassificationConferMapper classificationConferMapper;

    @Autowired
    RestTypeMapper restTypeMapper;

    @Autowired
    StateOfPreservationMapper stateOfPreservationMapper;

    @Autowired
    SiteRepository siteRepository;

    @Autowired
    NaturalUnitRepository naturalUnitRepository;

    @Autowired
    AddressRepository addressRepository;

    @Autowired
    FeatureRepository featureRepository;

    @Autowired
    SiteTypeRepository siteTypeRepository;

    @Autowired
    FeatureTypeRepository featureTypeRepository;

    @Autowired
    PreservationConditionRepository preservationConditionRepository;

    @Autowired
    SampleRepository sampleRepository;

    @Autowired
    ChronozoneRepository chronozoneRepository;

//    @Autowired
//    ArchaeologicalDatingRepository archaeologicalDatingRepository;
//
//    @Autowired
//    CulturalGroupRepository culturalGroupRepository;

    @Autowired
    SampleTypeRepository sampleTypeRepository;

    @Autowired
    SampleInvestigatedRepository sampleInvestigatedRepository;

    @Autowired
    AbsoluteDatingRepository absoluteDatingRepository;

    @Autowired
    MaterialRepository materialRepository;

    @Autowired
    DatingMethodRepository datingMethodRepository;

    @Autowired
    StateOfPreservationRepository stateOfPreservationRepository;

    @Autowired
    RestTypeRepository restTypeRepository;

    @Autowired
    TaxCodeRepository taxCodeRepository;

    @Autowired
    ClassificationConferRepository classificationConferRepository;


    // Sequence and names of the tables to be migrated
    List<String> tableNames = new ArrayList<>(Arrays.asList("Projekte", "Befunde", "Proben", "Datierung", "Details"));

    // Init maps for label <-> id mapping
    private Map<String, UUID> siteLabelIdMap = new HashMap<>();
    private Map<String, UUID> featureLabelIdMap = new HashMap<>();
    private Map<String, UUID> sampleLabelIdMap = new HashMap<>();

    public MigrationResponse migrateData(String dataFilePath, String strukDataFilePath,
                                         List<ResearchProject> transferredResearchProjectList,
                                         List<String> siteLabelList) {

        // Init returned data
        MigrationResponse migrationResponse = new MigrationResponse();

        // Create research project(s)
        List<ResearchProject> researchProjectList = researchProjectService.
                                                        create(transferredResearchProjectList);

        // Migrate all tables to the corresponding sites for the research project(s)
        for (String tableName : tableNames) {
            MigrationResponse tableMigrationResponse = migrateTables(dataFilePath, strukDataFilePath,
                                                                     tableName,
                                                                     researchProjectList,
                                                                     siteLabelList);

            // Add all table migration response lists ----------------------------------
            migrationResponse.getNonMatchingDanteAttributeList().addAll(tableMigrationResponse.getNonMatchingDanteAttributeList());
            migrationResponse.getLiteratureList().addAll(tableMigrationResponse.getLiteratureList());
            migrationResponse.getCoordinateList().addAll(tableMigrationResponse.getCoordinateList());
            migrationResponse.getUserList().addAll(tableMigrationResponse.getUserList());
            migrationResponse.getFractionAnalyzedList().addAll(tableMigrationResponse.getFractionAnalyzedList());
            migrationResponse.getLabAndNumberList().addAll(tableMigrationResponse.getLabAndNumberList());
            migrationResponse.getResultList().addAll(tableMigrationResponse.getResultList());

            migrationResponse.getExistingSiteList().addAll(tableMigrationResponse.getExistingSiteList());
            migrationResponse.getExistingFeatureList().addAll(tableMigrationResponse.getExistingFeatureList());
            migrationResponse.getExistingSampleList().addAll(tableMigrationResponse.getExistingSampleList());
            migrationResponse.getExistingAbsoluteDatingList().addAll(tableMigrationResponse.getExistingAbsoluteDatingList());
            // -------------------------------------------------------------------------
        }

        // Reset maps
        siteLabelIdMap.clear();
        featureLabelIdMap.clear();
        sampleLabelIdMap.clear();

        return migrationResponse;
    }

    private MigrationResponse migrateTables(String dataFilePath, String strukDataFilePath,
                                            String tableName,
                                            List<ResearchProject> researchProjectList,
                                            List<String> siteLabelList) {

        // Init returned data
        MigrationResponse tableMigrationResponse = new MigrationResponse();
        // ---------------------- Contains the following lists: -----------------------------
        // List for non-matching dante attributes
        List<NonMatchingDanteAttribute> nonMatchingDanteAttributeList = new ArrayList<>();
        // List for literature (user and site context)
        List<LiteratureMigration> literatureList = new ArrayList<>();
        // List for coordinates of sites and samples
        List<CoordinateMigration> coordinateList = new ArrayList<>();
        // List for users which bot. det. a sample
        List<UserMigration> userList = new ArrayList<>();
        // List for fraction analyzed
        List<FractionAnalyzedMigration> fractionAnalyzedList = new ArrayList<>();
        // List for lab and number of absolute dating
        List<LabAndNumberMigration> labAndNumberList = new ArrayList<>();
        // List for result
        List<Map.Entry<String, List<ResultMigration>>> resultList = new ArrayList<>();

        // List for existing sites (same label and match of research project(s))
        List<ExistingSite> existingSiteList = new ArrayList<>();
        // List for existing features (same label and match of site)
        List<ExistingFeature> existingFeatureList = new ArrayList<>();
        // List for existing samples (same label and match of feature)
        List<ExistingSample> existingSampleList = new ArrayList<>();
        // List for existing samples (same label and match of feature)
        List<ExistingAbsoluteDating> existingAbsoluteDatingList = new ArrayList<>();
        // ----------------------------------------------------------------------------------

        try (Database db = DatabaseBuilder.open(new File(dataFilePath))) {

            // Map fraction, if it's modified in ArboDat2018 --------------------------------
            boolean modifiedFraction_ORG2_0 = false;
            String fraction_ORG2_0 = null;
            boolean modifiedFraction_ORG1_0 = false;
            String fraction_ORG1_0 = null;
            boolean modifiedFraction_ORG0_5 = false;
            String fraction_ORG0_5 = null;
            boolean modifiedFraction_ORG0_25 = false;
            String fraction_ORG0_25 = null;
            boolean modifiedFraction_MIN2_0 = false;
            String fraction_MIN2_0 = null;
            boolean modifiedFraction_MIN1_0 = false;
            String fraction_MIN1_0 = null;
            boolean modifiedFraction_MIN0_5 = false;
            String fraction_MIN0_5 = null;
            boolean modifiedFraction_MIN0_25 = false;
            String fraction_MIN0_25 = null;

            try (Database strukDataDB = DatabaseBuilder.open(new File(strukDataFilePath))) {
                if (tableName.equals("Proben")) {
                    Table fractionsTable = strukDataDB.getTable("Fraktionen");
                    if (fractionsTable == null) {
                        throw new IllegalArgumentException("table 'Fraktionen' doesn't exist");
                    } else {
                        for (Row line : fractionsTable) {
                            Integer number = Integer.valueOf(line.getShort("Nummer"));
                            String fraction = line.getString("Fraktion");
                            switch (number) {
                                case 5:
                                    fraction_ORG2_0 = fraction;
                                    if (!fraction.equals("ORG 2,0")) {
                                        modifiedFraction_ORG2_0 = true;
                                    }
                                    break;

                                case 10:
                                    fraction_ORG1_0 = fraction;
                                    if (!fraction.equals("ORG 1,0")) {
                                        modifiedFraction_ORG1_0 = true;
                                    }
                                    break;

                                case 20:
                                    fraction_ORG0_5 = fraction;
                                    if (!fraction.equals("ORG 0,5")) {
                                        modifiedFraction_ORG0_5 = true;
                                    }
                                    break;

                                case 30:
                                    fraction_ORG0_25 = fraction;
                                    if (!fraction.equals("ORG 0,25")) {
                                        modifiedFraction_ORG0_25 = true;
                                    }
                                    break;

                                case 35:
                                    fraction_MIN2_0 = fraction;
                                    if (!fraction.equals("MIN 2,0")) {
                                        modifiedFraction_MIN2_0 = true;
                                    }
                                    break;

                                case 40:
                                    fraction_MIN1_0 = fraction;
                                    if (!fraction.equals("MIN 1,0")) {
                                        modifiedFraction_MIN1_0 = true;
                                    }
                                    break;

                                case 50:
                                    fraction_MIN0_5 = fraction;
                                    if (!fraction.equals("MIN 0,5")) {
                                        modifiedFraction_MIN0_5 = true;
                                    }
                                    break;

                                case 60:
                                    fraction_MIN0_25 = fraction;
                                    if (!fraction.equals("MIN 0,25")) {
                                        modifiedFraction_MIN0_25 = true;
                                    }
                                    break;

                            }
                        }
                    }
                }
            } catch (IOException e) {
                e.printStackTrace();
            } // ----------------------------------------------------------------------------


            // Get corresponding table from .mdb file
            Table table = db.getTable(tableName);
            if (table == null) {
                throw new IllegalArgumentException("table '" + tableName + "' doesn't exist");
            }

            // Migrate lines
            for (Row row : table) {
                switch (tableName) {
                    case "Projekte" -> {

                        //  ArboDat(Access)             ArboDat+
                        // -----------------------------------------------------------------------------
                        //  Projekt*                    -> label
                        //  Fustel                      -> labelAbbreviation
                        //  Ort, Kreis, Land, FlurStr   -> Address entity -> town, district, country, streetOrPlace
                        //  EVNr                        -> site_number
                        //  NaturE                      -> NaturalUnit entity -> label (Dante)
                        //  TK                          -> CoordinateMigration -> remarks
                        //  rWert, hWert, üNN           -> CoordinateMigration
                        //  ArchAusg                    -> archaeologicalExcavator
                        //  ArchBear                    -> archaeologicalEditor
                        //  Limes                       -> CoordinateMigration -> remarks
                        //  BotBear                     -> botanicalEditor
                        //  Aut, PublJahr               -> LiteratureMigration
                        //  okFustel                    -> undisturbed
                        //  AnmFustel                   -> remarks
                        //  Staat                       -> Address entity -> county
                        //  KoordSys                    -> CoordinateMigration (EPSG-Code needed)


                        String siteLabel = row.getString("Projekt");

                        // Site was selected
                        if (siteLabelList.contains(siteLabel)) {

                            // site handling
                            UUID siteId;

                            // Migrate, if site doesn't already exist OR not belongs to any transferred research project(s)
                            List<Site> sitesWithLabel = siteRepository.findAllByLabel(siteLabel);
                            if (sitesWithLabel.isEmpty() || sitesWithLabel.stream()
                                                            .noneMatch(site -> site.getResearchProjectList().stream()
                                                            .anyMatch(researchProjectList::contains))) {

                                // Insert a new site
                                Site newSite = siteRepository.save(new Site());
                                siteId = newSite.getId();

                                // Add site label + id to map
                                siteLabelIdMap.put(siteLabel, siteId);

                                // Assign site to research project(s)
                                newSite.getResearchProjectList().addAll(new HashSet<>(researchProjectList));

                                // Set site attributes
                                newSite.setLabel(siteLabel);
                                newSite.setLabelAbbreviation(row.getString("Fustel"));
                                newSite.setSiteNumber(row.getString("EVNr"));
                                newSite.setUndisturbed(row.getBoolean("okFustel"));
                                newSite.setRemarksSite(row.getString("AnmFustel"));

                                // Set natural unit
                                String naturalUnitLabel = row.getString("NaturE");
                                String naturalUnitUri = naturalUnitMapper.getUri(naturalUnitLabel);
                                Optional<NaturalUnit> naturalUnit = (naturalUnitUri != null) ? naturalUnitRepository.findById(naturalUnitUri)
                                        : Optional.empty();
                                if (naturalUnit.isPresent()) {
                                    newSite.setNaturalUnit(naturalUnit.get());
                                } else {
                                    nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("site",
                                            siteId,
                                            siteLabel,
                                            "naturalUnit",
                                            naturalUnitLabel));
                                }

                                // Add user info to userList ---------------------------------------------
                                String userLabel = row.getString("ArchAusg");
                                if (userLabel != null) {
                                    userList.add(new UserMigration("site", siteId, siteLabel,
                                                                   userLabel, "siteDirector", null, null));
                                }
                                userLabel = row.getString("ArchBear");
                                if (userLabel != null) {
                                    userList.add(new UserMigration("site", siteId, siteLabel,
                                            userLabel, "archaeologist", null, null));
                                }
                                userLabel = row.getString("BotBear");
                                if (userLabel != null) {
                                    userList.add(new UserMigration("site", siteId, siteLabel,
                                            userLabel, "botanist", null, null));
                                }

                                // Add coordinate info to coordinateList ---------------------------------
                                Double latitude = row.getDouble("rWert");
                                Double longitude = row.getDouble("hWert");
                                Double altitude = row.getDouble("üNN");
                                String coordinateSystem = row.getString("KoordSys");

                                // Set remarks
                                String remarks = "";
                                // TK
                                String tk = row.getString("TK");
                                if (tk != null) {
                                    remarks = remarks.concat("TK = " + tk);
                                }
                                // Limes
                                Boolean limes = (Boolean) row.get("Limes");
                                if (limes != null) {
                                    if (limes) {
                                        if (remarks.isEmpty()) {
                                            remarks = remarks.concat("Limes = true");
                                        } else {
                                            remarks = remarks.concat(", Limes = true");
                                        }
                                    } else {
                                        if (remarks.isEmpty()) {
                                            remarks = remarks.concat("Limes = false");
                                        } else {
                                            remarks = remarks.concat(", Limes = false");
                                        }
                                    }
                                }
                                if (latitude != null || longitude != null || altitude != null || !remarks.isEmpty()) {
                                    coordinateList.add(new CoordinateMigration("site", siteId, siteLabel,
                                            latitude, longitude, null, altitude, coordinateSystem, remarks, null, null));
                                }

                                // Set address -----------------------------------------------------------
                                Address newAddress = new Address();

                                newAddress.setCountry(row.getString("Land"));
                                newAddress.setCounty(row.getString("Staat"));
                                newAddress.setDistrict(row.getString("Kreis"));
                                newAddress.setTown(row.getString("Ort"));
                                newAddress.setStreet_or_place(row.getString("FlurStr"));

                                if (!isAddressEmpty(newAddress)) {
                                    // TODO:
//                                    // Check if such an address already exists
//                                    Example<Address> example = Example.of(newAddress);
//                                    List<Address> matches = addressRepository.findAll(example);
//                                    // if no, use the new one
//                                    if (matches.isEmpty()) {
                                        newSite.setAddress(newAddress);
//                                        // else, use exiting one
//                                    } else {
//                                        newSite.setAddress(matches.get(0));
//                                    }
                                }

                                // Add literature info to literatureList ---------------------------------
                                String author = row.getString("Aut");
                                String publicationYear = row.getString("PublJahr");
                                if (author != null || publicationYear != null) {
                                    literatureList.add(new LiteratureMigration(siteId, siteLabel, author, publicationYear));
                                }

                                // Update newSite
                                siteRepository.save(newSite);
                            }

                            else {
                                // Find matched site in repository to assign features to it
                                Site matchingSite = sitesWithLabel.stream()
                                        .filter(site -> site.getResearchProjectList().stream().anyMatch(researchProjectList::contains)).findFirst()
                                        .orElseThrow(() -> new IllegalStateException("No matching site found, although if condition ensures this"));

                                // Get id
                                siteId = matchingSite.getId();

                                // Add site label + id list to map
                                siteLabelIdMap.put(siteLabel, siteId);

                                // Get difference of transferred research projects and the research projects of the existing site
                                List<ResearchProject> differenceOfResearchProjects = researchProjectService.
                                        getDifference(researchProjectList, new ArrayList<>(matchingSite.getResearchProjectList()));

                                // Add this difference
                                matchingSite.getResearchProjectList().addAll(differenceOfResearchProjects);
                                siteRepository.save(matchingSite);


                                // Get research project names
                                List<String> researchProjectNames = matchingSite.getResearchProjectList().stream()
                                        .map(ResearchProject::getProjectName)
                                        .toList();

                                // Get added research projects names
                                List<String> addedResearchProjectNames = differenceOfResearchProjects.stream()
                                                                         .map(ResearchProject::getProjectName)
                                                                         .toList();

                                existingSiteList.add(new ExistingSite(siteLabel, siteId, researchProjectNames, addedResearchProjectNames));


                            // Check whether the attributes have not yet been set by previous migration attempts ----------

                                // Natural unit ------------------------------------------
                                if (matchingSite.getNaturalUnit() == null) {
                                    // Set natural unit
                                    String naturalUnitLabel = row.getString("NaturE");
                                    String naturalUnitUri = naturalUnitMapper.getUri(naturalUnitLabel);
                                    Optional<NaturalUnit> naturalUnit = (naturalUnitUri != null) ? naturalUnitRepository.findById(naturalUnitUri)
                                            : Optional.empty();
                                    if (naturalUnit.isPresent()) {
                                        matchingSite.setNaturalUnit(naturalUnit.get());
                                        siteRepository.save(matchingSite);
                                    } else {
                                        nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("site",
                                                siteId,
                                                siteLabel,
                                                "naturalUnit",
                                                naturalUnitLabel));
                                    }
                                }

                                // Add user info to userList ---------------------------------------------
                                if (matchingSite.getSiteDirectors() == null || matchingSite.getSiteDirectors().isEmpty()) {
                                    String userLabel = row.getString("ArchAusg");
                                    if (userLabel != null) {
                                        userList.add(new UserMigration("site", siteId, siteLabel,
                                                userLabel, "siteDirector", null, null));
                                    }
                                }
                                if (matchingSite.getArchaeologists() == null || matchingSite.getArchaeologists().isEmpty()) {
                                    String userLabel = row.getString("ArchBear");
                                    if (userLabel != null) {
                                        userList.add(new UserMigration("site", siteId, siteLabel,
                                                userLabel, "archaeologist", null, null));
                                    }
                                }
                                if (matchingSite.getBotanists() == null || matchingSite.getBotanists().isEmpty()) {
                                    String userLabel = row.getString("BotBear");
                                    if (userLabel != null) {
                                        userList.add(new UserMigration("site", siteId, siteLabel,
                                                userLabel, "botanist", null, null));
                                    }
                                }


                                // Add coordinate info to coordinateList ------------------------
                                if (matchingSite.getCoordinate() == null) {
                                    Double latitude = row.getDouble("rWert");
                                    Double longitude = row.getDouble("hWert");
                                    Double altitude = row.getDouble("üNN");
                                    String coordinateSystem = row.getString("KoordSys");
                                    // Set remarks
                                    String remarks = "";
                                    // TK
                                    String tk = row.getString("TK");
                                    if (tk != null) {
                                        remarks = remarks.concat("TK = " + tk);
                                    }
                                    // Limes
                                    Boolean limes = (Boolean) row.get("Limes");
                                    if (limes != null) {
                                        if (limes) {
                                            if (remarks.isEmpty()) {
                                                remarks = remarks.concat("Limes = true");
                                            } else {
                                                remarks = remarks.concat(", Limes = true");
                                            }
                                        } else {
                                            if (remarks.isEmpty()) {
                                                remarks = remarks.concat("Limes = false");
                                            } else {
                                                remarks = remarks.concat(", Limes = false");
                                            }
                                        }
                                    }
                                    if (latitude != null || longitude != null || altitude != null || !remarks.isEmpty()) {
                                        coordinateList.add(new CoordinateMigration("site", siteId, siteLabel,
                                                latitude, longitude, null, altitude, coordinateSystem, remarks, null, null));
                                    }
                                }

                                // Literature ------------------------------------------------------------
                                if (matchingSite.getLiteratureList() == null || matchingSite.getLiteratureList().isEmpty()) {
                                    // Add literature info to literatureList
                                    String author = row.getString("Aut");
                                    String publicationYear = row.getString("PublJahr");
                                    if (author != null || publicationYear != null) {
                                        literatureList.add(new LiteratureMigration(siteId, siteLabel, author, publicationYear));
                                    }
                                }
                            // -----------------------------------------------------------------------------------------
                            }
                        }
                    }
                    case "Befunde" -> {

                        //  ArboDat(Access)             ArboDat+
                        // ---------------------------------------------------------------------------
                        //  Projekt*                    -> Site entity -> label
                        //  Befu*                       -> label
                        //  FlSchn                      -> excavationArea
                        //  BefuTyp                     -> FeatureType entity -> label (Dante)
                        //  FustelTyp                   -> Site entity -> SiteType entity -> label (Dante)
                        //  FuTypVermut                 -> Site entity -> siteTypeUncertain
                        //  gebäud                      -> buildingContext
                        //  okBefu                      -> featureCondition
                        //  okErh                       -> PreservationCondition entity -> label
                        //  BotBest                     -> Sample entity -> botanicalDeterminationBy
                        //  BestJa                      -> Sample entity -> botanicalDeterminationYear
                        //  Anmerkung                   -> remarksFeature


                        String siteLabel = row.getString("Projekt");

                        // Site of feature was selected
                        if (siteLabelList.contains(siteLabel)) {

                            // site handling
                            UUID siteId = siteLabelIdMap.get(siteLabel);

                            // feature handling
                            String featureLabel = row.getString("Befu");
                            String uniqueFeatureString = siteLabel + "_" + featureLabel;
                            UUID featureId;

                            // Migrate, if feature doesn't already exist OR not belongs to the given site
                            List<Feature> featuresWithLabel = featureRepository.findAllByLabel(featureLabel);
                            if (featuresWithLabel.isEmpty() || featuresWithLabel.stream()
                                                               .noneMatch(feature -> feature.getSite().getId().equals(siteId))) {

                                // Insert a new feature
                                Feature newFeature = featureRepository.save(new Feature());
                                featureId = newFeature.getId();

                                // Add "siteLabel_featureLabel" + id to map
                                featureLabelIdMap.put(uniqueFeatureString, featureId);

                                // Set feature attributes
                                newFeature.setLabel(featureLabel);
                                newFeature.setExcavationArea(row.getString("FlSchn"));
                                newFeature.setRemarksFeature(row.getString("Anmerkung"));
                                newFeature.setFeatureCondition(row.getBoolean("okBefu"));

                                // Set excavation years ---------------------------------------------------------
                                List<Integer> excavationYears = new ArrayList<>();

                                Table excavationYearsTable = db.getTable("Grabungsjahre");
                                if (excavationYearsTable == null) {
                                    throw new IllegalArgumentException("table 'Grabungsjahre' doesn't exist");
                                }
                                for (Row line : excavationYearsTable) {
                                    String site_ = line.getString("Projekt");
                                    String feature_ = line.getString("Befu");

                                    Short year = line.getShort("Jahr");
                                    if (year != null && Objects.equals(site_, siteLabel) && Objects.equals(feature_, featureLabel)) {
                                        excavationYears.add(year.intValue());
                                    }
                                }
                                newFeature.setExcavationYears(excavationYears);
                                // ------------------------------------------------------------------------------

                                // Set building context
                                Short buildingContextNumber = row.getShort("gebäud");
                                if (buildingContextNumber == 1) {
                                    newFeature.setBuildingContext(false);
                                } else if (buildingContextNumber == 2) {
                                    newFeature.setBuildingContext(true);
                                }

                                // Assign feature to site
                                Optional<Site> optionalSite = siteRepository.findById(siteId);
                                if (optionalSite.isPresent()) {
                                    Site site = optionalSite.get();
                                    newFeature.setSite(site);
                                    // Set site type uncertain only if it's not uncertain
                                    if (site.getSiteTypeUncertain() == null || !site.getSiteTypeUncertain()) {
                                        site.setSiteTypeUncertain(row.getBoolean("FuTypVermut"));
                                    }
                                    // Set site type
                                    String siteTypeLabel = row.getString("FustelTyp");
                                    String siteTypeUri = siteTypeMapper.getUri(siteTypeLabel);
                                    Optional<SiteType> siteType = (siteTypeUri != null) ? siteTypeRepository.findById(siteTypeUri)
                                            : Optional.empty();
                                    if (siteType.isPresent()) {
                                        site.getSiteTypeList().add(siteType.get());
                                    } else {
                                        boolean found = false;
                                        for (NonMatchingDanteAttribute entry : nonMatchingDanteAttributeList) {
                                            if (entry.getAttribute().equals("siteType") && entry.getId().equals(siteId) && entry.getLabel().equals(siteLabel)) {
                                                found = true;
                                                if (!entry.getNonMatchingLabel().contains(siteTypeLabel)) {
                                                    entry.setNonMatchingLabel(entry.getNonMatchingLabel() + ", " + siteTypeLabel);
                                                }
                                                break;
                                            }
                                        }
                                        if (!found) {
                                            nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("site",
                                                    siteId,
                                                    siteLabel,
                                                    "siteType",
                                                    siteTypeLabel));
                                        }
                                    }
                                    siteRepository.save(site);
                                }

                                // Set feature type
                                String featureTypeLabel = row.getString("BefuTyp");
                                String featureTypeUri = featureTypeMapper.getUri(featureTypeLabel);
                                Optional<FeatureType> featureType = (featureTypeUri != null) ? featureTypeRepository.findById(featureTypeUri)
                                        : Optional.empty();
                                if (featureType.isPresent()) {
                                    newFeature.setFeatureType(featureType.get());
                                } else {
                                    nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("feature",
                                                                                                    featureId,
                                                                                                    featureLabel,
                                                                                                    "featureType",
                                                                                                    featureTypeLabel));
                                }
                                // Set preservation condition
                                Short preservationConditionNumber = row.getShort("okErh");
                                String preservationConditionLabel = null;
                                switch (preservationConditionNumber) {
                                    case 0 -> {preservationConditionLabel = "good";}
                                    case 1 -> {preservationConditionLabel = "medium";}
                                    case 2 -> {preservationConditionLabel = "bad";}
                                }
                                String preservationConditionUri = preservationConditionMapper.getUri(preservationConditionLabel);
                                Optional<PreservationCondition> preservationCondition = (preservationConditionUri != null)
                                        ? preservationConditionRepository.findById(preservationConditionUri)
                                        : Optional.empty();
                                if (preservationCondition.isPresent()) {
                                    newFeature.setPreservationCondition(preservationCondition.get());
                                } else {
                                    nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("feature",
                                                                                                    featureId,
                                                                                                    featureLabel,
                                                                                                    "preservationCondition",
                                                                                                    preservationConditionLabel));
                                }

                                // Update newFeature
                                featureRepository.save(newFeature);
                            }

                            else {
                                // Find matched feature in repository to assign samples to it
                                Feature matchingFeature = featuresWithLabel.stream()
                                        .filter(feature -> feature.getSite().getId().equals(siteId)).findFirst()
                                        .orElseThrow(() -> new IllegalArgumentException("No matching feature found, although if condition ensures this"));

                                featureId = matchingFeature.getId();

                                // Add "siteLabel_featureLabel" + id to map
                                featureLabelIdMap.put(uniqueFeatureString, featureId);

                                existingFeatureList.add(new ExistingFeature(featureLabel, featureId, siteLabel));


                            // Check whether the attributes have not yet been set by previous migration attempts ----------

                                // Site type -------------------------------------------------------------
                                Optional<Site> optionalSite = siteRepository.findById(siteId);
                                if (optionalSite.isPresent()) {
                                    Site site = optionalSite.get();
                                    if (site.getSiteTypeList() == null || site.getSiteTypeList().isEmpty()) {
                                        // Set site type
                                        String siteTypeLabel = row.getString("FustelTyp");
                                        String siteTypeUri = siteTypeMapper.getUri(siteTypeLabel);
                                        Optional<SiteType> siteType = (siteTypeUri != null) ? siteTypeRepository.findById(siteTypeUri)
                                                : Optional.empty();
                                        if (siteType.isPresent()) {
                                            site.getSiteTypeList().add(siteType.get());
                                            siteRepository.save(site);
                                        } else {
                                            boolean found = false;
                                            for (NonMatchingDanteAttribute entry : nonMatchingDanteAttributeList) {
                                                if (entry.getAttribute().equals("siteType") && entry.getId().equals(siteId) && entry.getLabel().equals(siteLabel)) {
                                                    found = true;
                                                    if (!entry.getNonMatchingLabel().contains(siteTypeLabel)) {
                                                        entry.setNonMatchingLabel(entry.getNonMatchingLabel() + ", " + siteTypeLabel);
                                                    }
                                                    break;
                                                }
                                            }
                                            if (!found) {
                                                nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("site",
                                                        siteId,
                                                        siteLabel,
                                                        "siteType",
                                                        siteTypeLabel));
                                            }
                                        }
                                    }
                                }

                                // Feature type
                                if (matchingFeature.getFeatureType() == null) {
                                    // Set feature type
                                    String featureTypeLabel = row.getString("BefuTyp");
                                    String featureTypeUri = featureTypeMapper.getUri(featureTypeLabel);
                                    Optional<FeatureType> featureType = (featureTypeUri != null) ? featureTypeRepository.findById(featureTypeUri)
                                            : Optional.empty();
                                    if (featureType.isPresent()) {
                                        matchingFeature.setFeatureType(featureType.get());
                                        featureRepository.save(matchingFeature);
                                    } else {
                                        nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("feature",
                                                featureId,
                                                featureLabel,
                                                "featureType",
                                                featureTypeLabel));
                                    }
                                }

                                // Preservation condition
                                if (matchingFeature.getPreservationCondition() == null) {
                                    // Set preservation condition
                                    Short preservationConditionNumber = row.getShort("okErh");
                                    String preservationConditionLabel = null;
                                    switch (preservationConditionNumber) {
                                        case 0 -> {preservationConditionLabel = "good";}
                                        case 1 -> {preservationConditionLabel = "medium";}
                                        case 2 -> {preservationConditionLabel = "bad";}
                                    }
                                    String preservationConditionUri = preservationConditionMapper.getUri(preservationConditionLabel);
                                    Optional<PreservationCondition> preservationCondition = (preservationConditionUri != null)
                                            ? preservationConditionRepository.findById(preservationConditionUri)
                                            : Optional.empty();
                                    if (preservationCondition.isPresent()) {
                                        matchingFeature.setPreservationCondition(preservationCondition.get());
                                        featureRepository.save(matchingFeature);
                                    } else {
                                        nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("feature",
                                                featureId,
                                                featureLabel,
                                                "preservationCondition",
                                                preservationConditionLabel));
                                    }
                                }
                            // -----------------------------------------------------------------------------------------
                            }
                        }
                    }
                    case "Proben" -> {

                        //  ArboDat(Access)             ArboDat+
                        // --------------------------------------------------------------------
                        //  Projekt*                    -> Site entity -> label
                        //  Befu*                       -> Feature entity -> label
                        //  ProbNr*                     -> label
                        //  Strat(tum)                  -> stratum
                        //  Schi(cht)                   -> layer
                        //  Quadr(ant)                  -> sector
                        //  Plan(um)                    -> planum
                        //  TiefeVon                    -> depthFrom
                        //  TiefeBis                    -> depthTo
                        //  Trocken                     -> volumeDetermination
                        //  ChronoDat                   -> Chronozone entity -> label (Dante)
                        //  Vorfu (Vorratsfund)         -> sampleStorage
                        //  ArchDat                     -> ArchaeologicalDating entity -> label (Dante)
                        //  KultGr                      -> CulturalGroup entity -> label (Dante)
                        //  ProbTyp                     -> SampleType entity -> label (Dante)
                        //  ProbVol                     -> sampleVolume
                        //  ORG2_0                      -> FractionAnalyzed entity
                        //  ORG1_0                      -> FractionAnalyzed entity
                        //  ORG0_5                      -> FractionAnalyzed entity
                        //  ORG0_25                     -> FractionAnalyzed entity
                        //  MIN2_0                      -> FractionAnalyzed entity
                        //  MIN1_0                      -> FractionAnalyzed entity
                        //  MIN0_5                      -> FractionAnalyzed entity
                        //  MIN0_25                     -> FractionAnalyzed entity
                        //  SedProb                     -> microremainSample
                        //  GesamtgewichtHK             -> totalWeight
                        //  GewichtHK_unbestimmt        -> weightUndetermined
                        //  AnmProb                     -> remarksSample
                        //  Prob_üNN                    -> Coordinate entity -> altitude
                        //  KoordX                      -> Coordinate entity -> longitude
                        //  KoordY                      -> Coordinate entity -> latitude
                        //  KoordZ                      (-> Coordinate entity -> altitude)
                        //  Inventar_SaFr               -> seedsAndFruits       (SampleInvestigated Dante)
                        //  Inventar_HK                 -> charcoalInvestigated (SampleInvestigated Dante)
                        //  Inventar_Holz_sf            -> woodSubfossile       (SampleInvestigated Dante)


                        String siteLabel = row.getString("Projekt");

                        // Site of sample was selected
                        if (siteLabelList.contains(siteLabel)) {

                            // feature handling
                            String featureLabel = row.getString("Befu");
                            String uniqueFeatureString = siteLabel + "_" + featureLabel;
                            UUID featureId = featureLabelIdMap.get(uniqueFeatureString);

                            // sample handling
                            String sampleLabel = row.getString("ProbNr");
                            String uniqueSampleString = siteLabel + "_" + featureLabel+ "_" + sampleLabel;
                            UUID sampleId;

                            // Migrate, if sample doesn't already exist OR not belongs to the given feature
                            List<Sample> samplesWithLabel = sampleRepository.findAllByLabel(sampleLabel);
                            if (samplesWithLabel.isEmpty() || samplesWithLabel.stream()
                                                              .noneMatch(sample -> sample.getFeature().getId().equals(featureId))) {
                                // Insert a new sample
                                Sample newSample = sampleRepository.save(new Sample());
                                sampleId = newSample.getId();

                                // Add "siteLabel_featureLabel_sampleLabel" + id to map
                                sampleLabelIdMap.put(uniqueSampleString, sampleId);

                                // Assign sample to feature
                                Optional<Feature> feature = featureRepository.findById(featureId);
                                feature.ifPresent(newSample::setFeature);

                                // Set sample attributes
                                newSample.setLabel(sampleLabel);
                                newSample.setStratum(row.getString("Strat"));
                                newSample.setLayer(row.getString("Schi"));
                                newSample.setSector(row.getString("Quadr"));
                                newSample.setPlanum(row.getString("Plan"));
                                newSample.setSampleStorage(row.getBoolean("Vorfu"));
                                newSample.setMicroRemain(row.getBoolean("SedProb"));
                                newSample.setRemarksSample(row.getString("AnmProb"));
                                // depthFrom
                                Object depthFromValue = row.get("TiefeVon");
                                Double depthFrom = (depthFromValue instanceof Number) ? ((Number) depthFromValue).doubleValue() : null;
                                newSample.setDepthFrom(depthFrom);
                                // depthTo
                                Object depthToValue = row.get("TiefeBis");
                                Double depthTo = (depthToValue instanceof Number) ? ((Number) depthToValue).doubleValue() : null;
                                newSample.setDepthTo(depthTo);
                                // sampleVolume
                                Object sampleVolumeValue = row.get("ProbVol");
                                Double sampleVolume = (sampleVolumeValue instanceof Number) ? ((Number) sampleVolumeValue).doubleValue() : null;
                                newSample.setSampleVolume(sampleVolume);
                                // totalWeight
                                Object totalWeightValue = row.get("GesamtgewichtHK");
                                Double totalWeight = (totalWeightValue instanceof Number) ? ((Number) totalWeightValue).doubleValue() : null;
                                newSample.setTotalWeight(totalWeight);
                                // weightUndetermined
                                Object weightUndeterminedValue = row.get("GewichtHK_unbestimmt");
                                Double weightUndetermined = (weightUndeterminedValue instanceof Number) ? ((Number) weightUndeterminedValue).doubleValue() : null;
                                newSample.setWeightUndetermined(weightUndetermined);

                                // Set dryOrWet
                                if (row.getBoolean("Trocken")) {
                                    newSample.setVolumeDetermination("dry");
                                } else {
                                    newSample.setVolumeDetermination("wet");
                                }

                                // Set botanical determination year and get bot.Det.By (user)
                                Table featureTable = db.getTable("Befunde");
                                if (featureTable == null) {
                                    throw new IllegalArgumentException("table 'Befunde' doesn't exist");
                                }
                                for (Row line : featureTable) {
                                    String site_ = line.getString("Projekt");
                                    String feature_ = line.getString("Befu");

                                    if (Objects.equals(site_, siteLabel) && Objects.equals(feature_, featureLabel)) {
                                        String botDetYear = line.getString("BestJa");
                                        if (botDetYear != null) {
                                            newSample.setBotanicalDeterminationYear(botDetYear);
                                        }
                                        // Add user info to userList ---------------------------------------------
                                        String userLabel = line.getString("BotBest");
                                        if (userLabel != null) {
                                            userList.add(new UserMigration("sample", sampleId, sampleLabel,
                                                    userLabel, "botanicalDeterminationBy", siteLabel, featureLabel));
                                        } // ---------------------------------------------------------------------
                                    }
                                }

                                // Set chronozone
                                String chronozoneLabel = row.getString("ChronoDat");
                                String chronozoneUri = chronozoneMapper.getUri(chronozoneLabel);
                                Optional<Chronozone> chronozone = (chronozoneUri != null) ? chronozoneRepository.findById(chronozoneUri)
                                        : Optional.empty();
                                if (chronozone.isPresent()) {
                                    newSample.setChronozone(chronozone.get());
                                } else {
                                    nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("sample",
                                                                                                    sampleId,
                                                                                                    sampleLabel,
                                                                                                    "chronozone",
                                                                                                    chronozoneLabel));
                                }
//                                // Set archaeological dating
                                newSample.setArchaeologicalDating(row.getString("ArchDat"));
//                                String archaeologicalDatingLabel = row.getString("ArchDat");
//                                Optional<ArchaeologicalDating> archaeologicalDating
//                                        = archaeologicalDatingRepository.findByLabel(archaeologicalDatingLabel);
//                                if (archaeologicalDating.isPresent()) {
//                                    newSample.setArchaeologicalDating(archaeologicalDating.get());
//                                } else {
//                                    nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("sample",
//                                                                                                    sampleId,
//                                                                                                    sampleLabel,
//                                                                                                    "archaeologicalDating",
//                                                                                                    archaeologicalDatingLabel));
//                                }
//                                // Set cultural group
                                newSample.setCulturalGroup(row.getString("KultGr"));
//                                String culturalGroupLabel = row.getString("KultGr");
//                                if (culturalGroupLabel != null) {
//                                    Optional<CulturalGroup> culturalGroup = culturalGroupRepository.findByLabel(culturalGroupLabel);
//                                    if (culturalGroup.isPresent()) {
//                                        newSample.setCulturalGroup(culturalGroup.get());
//                                    } else {
//                                        nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("sample",
//                                                sampleId,
//                                                sampleLabel,
//                                                "culturalGroup",
//                                                culturalGroupLabel));
//                                    }
//                                }
                                // Set sample type
                                String sampleTypeLabel = row.getString("ProbTyp");
                                String sampleTypeUri = sampleTypeMapper.getUri(sampleTypeLabel);
                                Optional<SampleType> sampleType = (sampleTypeUri != null) ? sampleTypeRepository.findById(sampleTypeUri)
                                        : Optional.empty();
                                if (sampleType.isPresent()) {
                                    newSample.setSampleType(sampleType.get());
                                } else {
                                    nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("sample",
                                                                                                    sampleId,
                                                                                                    sampleLabel,
                                                                                                    "sampleType",
                                                                                                    sampleTypeLabel));
                                }
                                // Set seedsAndFruits
                                String seedsAndFruitsLabel = row.getString("Inventar_SaFr");
                                String seedsAnsFruitsUri = sampleInvestigatedMapper.getUri(seedsAndFruitsLabel);
                                Optional<SampleInvestigated> seedsAndFruits = (seedsAnsFruitsUri != null ) ? sampleInvestigatedRepository.findById(seedsAnsFruitsUri)
                                        : Optional.empty();
                                if (seedsAndFruits.isPresent()) {
                                    newSample.setSeedsAndFruits(seedsAndFruits.get());
                                } else {
                                    nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("sample",
                                                                                                    sampleId,
                                                                                                    sampleLabel,
                                                                                                    "seedsAndFruits",
                                                                                                    seedsAndFruitsLabel));
                                }
                                // Set charcoalInvestigated
                                String charcoalInvestigatedLabel = row.getString("Inventar_HK");
                                String charcoalInvestigatedUri = sampleInvestigatedMapper.getUri(charcoalInvestigatedLabel);
                                Optional<SampleInvestigated> charcoalInvestigated = (charcoalInvestigatedUri != null ) ? sampleInvestigatedRepository.findById(charcoalInvestigatedUri)
                                        : Optional.empty();
                                if (charcoalInvestigated.isPresent()) {
                                    newSample.setCharcoalInvestigated(charcoalInvestigated.get());
                                } else {
                                    nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("sample",
                                                                                                    sampleId,
                                                                                                    sampleLabel,
                                                                                                    "charcoalInvestigated",
                                                                                                    charcoalInvestigatedLabel));
                                }
                                // Set woodSubfossile
                                String woodSubfossileLabel = row.getString("Inventar_Holz_sf");
                                String woodSubfossileUri = sampleInvestigatedMapper.getUri(woodSubfossileLabel);
                                Optional<SampleInvestigated> woodSubfossile = (woodSubfossileUri != null ) ? sampleInvestigatedRepository.findById(woodSubfossileUri)
                                        : Optional.empty();
                                if (woodSubfossile.isPresent()) {
                                    newSample.setWoodSubfossile(woodSubfossile.get());
                                } else {
                                    nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("sample",
                                                                                                    sampleId,
                                                                                                    sampleLabel,
                                                                                                    "woodSubfossile",
                                                                                                    woodSubfossileLabel));
                                }

                                // Add coordinate info to coordinateList
                                Double latitude = row.getDouble("KoordY");
                                Double longitude = row.getDouble("KoordX");
                                Double zCoordinate = row.getDouble("KoordZ");
                                // altitude
                                Object altitudeValue = row.get("Prob_üNN");
                                Double altitude = (altitudeValue instanceof Number) ? ((Number) altitudeValue).doubleValue() : null;

                                if (latitude != null || longitude != null || zCoordinate != null || altitude != null) {
                                    coordinateList.add(new CoordinateMigration("sample", sampleId, sampleLabel,
                                            latitude, longitude, zCoordinate, altitude, "", "", siteLabel, featureLabel));
                                }

                                // Update newSample
                                sampleRepository.save(newSample);
                            }

                            else {
                                // Find matched sample in repository to assign absoluteDatings to it
                                Sample matchingSample = samplesWithLabel.stream()
                                        .filter(sample -> sample.getFeature().getId().equals(featureId)).findFirst()
                                        .orElseThrow(() -> new IllegalArgumentException("No matching sample found, although if condition ensures this"));

                                sampleId = matchingSample.getId();

                                // Add feature label + id to map
                                sampleLabelIdMap.put(uniqueSampleString, sampleId);

                                existingSampleList.add(new ExistingSample(sampleLabel,sampleId, featureLabel, siteLabel));


                            // Check whether the attributes have not yet been set by previous migration attempts ----------

                                // BotanicalDeterminationBy (user) ---------------------------------------
                                if (matchingSample.getBotanicalDeterminationBy() == null || matchingSample.getBotanicalDeterminationBy().isEmpty()) {
                                    Table featureTable = db.getTable("Befunde");
                                    if (featureTable == null) {
                                        throw new IllegalArgumentException("table 'Befunde' doesn't exist");
                                    }
                                    for (Row line : featureTable) {
                                        String site_ = line.getString("Projekt");
                                        String feature_ = line.getString("Befu");

                                        if (Objects.equals(site_, siteLabel) && Objects.equals(feature_, featureLabel)) {
                                            // Add user info to userList -------------------------------------------
                                            String userLabel = line.getString("BotBest");
                                            if (userLabel != null) {
                                                userList.add(new UserMigration("sample", sampleId, sampleLabel,
                                                        userLabel, "botanicalDeterminationBy", siteLabel, featureLabel));
                                            } // -------------------------------------------------------------------
                                        }
                                    }
                                }

                                // Chronozone ------------------------------------------------------------
                                if (matchingSample.getChronozone() == null) {
                                    String chronozoneLabel = row.getString("ChronoDat");
                                    String chronozoneUri = chronozoneMapper.getUri(chronozoneLabel);
                                    Optional<Chronozone> chronozone = (chronozoneUri != null) ? chronozoneRepository.findById(chronozoneUri)
                                            : Optional.empty();
                                    if (chronozone.isPresent()) {
                                        matchingSample.setChronozone(chronozone.get());
                                        sampleRepository.save(matchingSample);
                                    } else {
                                        nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("sample",
                                                sampleId,
                                                sampleLabel,
                                                "chronozone",
                                                chronozoneLabel));
                                    }
                                }
//                                // Archaeological dating -------------------------------------------------
//                                if (matchingSample.getArchaeologicalDating() == null) {
//                                    String archaeologicalDatingLabel = row.getString("ArchDat");
//                                    Optional<ArchaeologicalDating> archaeologicalDating
//                                            = archaeologicalDatingRepository.findByLabel(archaeologicalDatingLabel);
//                                    if (archaeologicalDating.isPresent()) {
//                                        matchingSample.setArchaeologicalDating(archaeologicalDating.get());
//                                        sampleRepository.save(matchingSample);
//                                    } else {
//                                        nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("sample",
//                                                sampleId,
//                                                sampleLabel,
//                                                "archaeologicalDating",
//                                                archaeologicalDatingLabel));
//                                    }
//                                }
//                                // Cultural group --------------------------------------------------------
//                                if (matchingSample.getCulturalGroup() == null) {
//                                    String culturalGroupLabel = row.getString("KultGr");
//                                    if (culturalGroupLabel != null) {
//                                        Optional<CulturalGroup> culturalGroup = culturalGroupRepository.findByLabel(culturalGroupLabel);
//                                        if (culturalGroup.isPresent()) {
//                                            matchingSample.setCulturalGroup(culturalGroup.get());
//                                            sampleRepository.save(matchingSample);
//                                        } else {
//                                            nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("sample",
//                                                    sampleId,
//                                                    sampleLabel,
//                                                    "culturalGroup",
//                                                    culturalGroupLabel));
//                                        }
//                                    }
//                                }
                                // Sample type -----------------------------------------------------------
                                if (matchingSample.getSampleType() == null) {
                                    String sampleTypeLabel = row.getString("ProbTyp");
                                    String sampleTypeUri = sampleTypeMapper.getUri(sampleTypeLabel);
                                    Optional<SampleType> sampleType = (sampleTypeUri != null) ? sampleTypeRepository.findById(sampleTypeUri)
                                            : Optional.empty();
                                    if (sampleType.isPresent()) {
                                        matchingSample.setSampleType(sampleType.get());
                                        sampleRepository.save(matchingSample);
                                    } else {
                                        nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("sample",
                                                sampleId,
                                                sampleLabel,
                                                "sampleType",
                                                sampleTypeLabel));
                                    }
                                }
                                // SeedsAndFruits --------------------------------------------------------
                                if (matchingSample.getSeedsAndFruits() == null) {
                                    String seedsAndFruitsLabel = row.getString("Inventar_SaFr");
                                    String seedsAnsFruitsUri = sampleInvestigatedMapper.getUri(seedsAndFruitsLabel);
                                    Optional<SampleInvestigated> seedsAndFruits = (seedsAnsFruitsUri != null ) ? sampleInvestigatedRepository.findById(seedsAnsFruitsUri)
                                            : Optional.empty();
                                    if (seedsAndFruits.isPresent()) {
                                        matchingSample.setSeedsAndFruits(seedsAndFruits.get());
                                        sampleRepository.save(matchingSample);
                                    } else {
                                        nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("sample",
                                                sampleId,
                                                sampleLabel,
                                                "seedsAndFruits",
                                                seedsAndFruitsLabel));
                                    }
                                }
                                // CharcoalInvestigated --------------------------------------------------
                                if (matchingSample.getCharcoalInvestigated() == null) {
                                    String charcoalInvestigatedLabel = row.getString("Inventar_HK");
                                    String charcoalInvestigatedUri = sampleInvestigatedMapper.getUri(charcoalInvestigatedLabel);
                                    Optional<SampleInvestigated> charcoalInvestigated = (charcoalInvestigatedUri != null ) ? sampleInvestigatedRepository.findById(charcoalInvestigatedUri)
                                            : Optional.empty();
                                    if (charcoalInvestigated.isPresent()) {
                                        matchingSample.setCharcoalInvestigated(charcoalInvestigated.get());
                                        sampleRepository.save(matchingSample);
                                    } else {
                                        nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("sample",
                                                sampleId,
                                                sampleLabel,
                                                "charcoalInvestigated",
                                                charcoalInvestigatedLabel));
                                    }
                                }
                                // WoodSubfossile --------------------------------------------------------
                                if (matchingSample.getWoodSubfossile() == null) {
                                    String woodSubfossileLabel = row.getString("Inventar_HK");
                                    String woodSubfossileUri = sampleInvestigatedMapper.getUri(woodSubfossileLabel);
                                    Optional<SampleInvestigated> woodSubfossile = (woodSubfossileUri != null ) ? sampleInvestigatedRepository.findById(woodSubfossileUri)
                                            : Optional.empty();
                                    if (woodSubfossile.isPresent()) {
                                        matchingSample.setWoodSubfossile(woodSubfossile.get());
                                        sampleRepository.save(matchingSample);
                                    } else {
                                        nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("sample",
                                                sampleId,
                                                sampleLabel,
                                                "woodSubfossile",
                                                woodSubfossileLabel));
                                    }
                                }

                                // Coordinate ------------------------------------------------------------
                                if (matchingSample.getCoordinate() == null) {
                                    Double latitude = row.getDouble("KoordY");
                                    Double longitude = row.getDouble("KoordX");
                                    Double zCoordinate = row.getDouble("KoordZ");
                                    // altitude
                                    Object altitudeValue = row.get("Prob_üNN");
                                    Double altitude = (altitudeValue instanceof Number) ? ((Number) altitudeValue).doubleValue() : null;

                                    if (latitude != null || longitude != null || zCoordinate != null || altitude != null) {
                                        coordinateList.add(new CoordinateMigration("sample", sampleId, sampleLabel,
                                                latitude, longitude, zCoordinate, altitude, "", "", siteLabel, featureLabel));
                                    }
                                }

                            // -----------------------------------------------------------------------------------------
                            }

                            // Add fraction analyzed to fractionAnalyzedList -------------------------
                            // Org 2.0
                            String fractionAnalyzed = row.getString("ORG2_0");
                            if (fractionAnalyzed != null) {

                                // Map fractionAnalyzed: 'ja' 'nein' 'teils' -> 'yes' 'no' 'partly'
                                if (fractionAnalyzed.equals("ja")) {
                                    fractionAnalyzed = "yes";
                                }
                                if (fractionAnalyzed.equals("nein")) {
                                    fractionAnalyzed = "no";
                                }
                                if (fractionAnalyzed.equals("teils")) {
                                    fractionAnalyzed = "partly";
                                }

                                // Set orgOrMin and sieveSize, if fraction is not modified
                                String orgOrMin;
                                Double sieveSize;
                                if (!modifiedFraction_ORG2_0) {
                                    orgOrMin = "org";
                                    sieveSize = 2.0;
                                } else {
                                    orgOrMin = null;
                                    sieveSize = null;
                                }

                                fractionAnalyzedList.add(new FractionAnalyzedMigration(
                                        siteLabel,
                                        sampleId,
                                        sampleLabel,
                                        fractionAnalyzed,
                                        modifiedFraction_ORG2_0,
                                        fraction_ORG2_0,
                                        orgOrMin,
                                        sieveSize,
                                        featureLabel));
                            }
                            // Org 1.0
                            fractionAnalyzed = row.getString("ORG1_0");
                            if (fractionAnalyzed != null) {
                                // Map fractionAnalyzed: 'ja' 'nein' 'teils' -> 'yes' 'no' 'partly'
                                if (fractionAnalyzed.equals("ja")) {
                                    fractionAnalyzed = "yes";
                                }
                                if (fractionAnalyzed.equals("nein")) {
                                    fractionAnalyzed = "no";
                                }
                                if (fractionAnalyzed.equals("teils")) {
                                    fractionAnalyzed = "partly";
                                }

                                // Set orgOrMin and sieveSize, if fraction is not modified
                                String orgOrMin;
                                Double sieveSize;
                                if (!modifiedFraction_ORG1_0) {
                                    orgOrMin = "org";
                                    sieveSize = 1.0;
                                } else {
                                    orgOrMin = null;
                                    sieveSize = null;
                                }

                                fractionAnalyzedList.add(new FractionAnalyzedMigration(
                                        siteLabel,
                                        sampleId,
                                        sampleLabel,
                                        fractionAnalyzed,
                                        modifiedFraction_ORG1_0,
                                        fraction_ORG1_0,
                                        orgOrMin,
                                        sieveSize,
                                        featureLabel));
                            }
                            // Org 0.5
                            fractionAnalyzed = row.getString("ORG0_5");
                            if (fractionAnalyzed != null) {
                                // Map fractionAnalyzed: 'ja' 'nein' 'teils' -> 'yes' 'no' 'partly'
                                if (fractionAnalyzed.equals("ja")) {
                                    fractionAnalyzed = "yes";
                                }
                                if (fractionAnalyzed.equals("nein")) {
                                    fractionAnalyzed = "no";
                                }
                                if (fractionAnalyzed.equals("teils")) {
                                    fractionAnalyzed = "partly";
                                }

                                // Set orgOrMin and sieveSize, if fraction is not modified
                                String orgOrMin;
                                Double sieveSize;
                                if (!modifiedFraction_ORG0_5) {
                                    orgOrMin = "org";
                                    sieveSize = 0.5;
                                } else {
                                    orgOrMin = null;
                                    sieveSize = null;
                                }

                                fractionAnalyzedList.add(new FractionAnalyzedMigration(
                                        siteLabel,
                                        sampleId,
                                        sampleLabel,
                                        fractionAnalyzed,
                                        modifiedFraction_ORG0_5,
                                        fraction_ORG0_5,
                                        orgOrMin,
                                        sieveSize,
                                        featureLabel));
                            }
                            // Org 0.25
                            fractionAnalyzed = row.getString("ORG0_25");
                            if (fractionAnalyzed != null) {
                                // Map fractionAnalyzed: 'ja' 'nein' 'teils' -> 'yes' 'no' 'partly'
                                if (fractionAnalyzed.equals("ja")) {
                                    fractionAnalyzed = "yes";
                                }
                                if (fractionAnalyzed.equals("nein")) {
                                    fractionAnalyzed = "no";
                                }
                                if (fractionAnalyzed.equals("teils")) {
                                    fractionAnalyzed = "partly";
                                }

                                // Set orgOrMin and sieveSize, if fraction is not modified
                                String orgOrMin;
                                Double sieveSize;
                                if (!modifiedFraction_ORG0_25) {
                                    orgOrMin = "org";
                                    sieveSize = 0.25;
                                } else {
                                    orgOrMin = null;
                                    sieveSize = null;
                                }

                                fractionAnalyzedList.add(new FractionAnalyzedMigration(
                                        siteLabel,
                                        sampleId,
                                        sampleLabel,
                                        fractionAnalyzed,
                                        modifiedFraction_ORG0_25,
                                        fraction_ORG0_25,
                                        orgOrMin,
                                        sieveSize,
                                        featureLabel));
                            }
                            // Min 2.0
                            fractionAnalyzed = row.getString("MIN2_0");
                            if (fractionAnalyzed != null) {
                                // Map fractionAnalyzed: 'ja' 'nein' 'teils' -> 'yes' 'no' 'partly'
                                if (fractionAnalyzed.equals("ja")) {
                                    fractionAnalyzed = "yes";
                                }
                                if (fractionAnalyzed.equals("nein")) {
                                    fractionAnalyzed = "no";
                                }
                                if (fractionAnalyzed.equals("teils")) {
                                    fractionAnalyzed = "partly";
                                }

                                // Set orgOrMin and sieveSize, if fraction is not modified
                                String orgOrMin;
                                Double sieveSize;
                                if (!modifiedFraction_MIN2_0) {
                                    orgOrMin = "min";
                                    sieveSize = 2.0;
                                } else {
                                    orgOrMin = null;
                                    sieveSize = null;
                                }

                                fractionAnalyzedList.add(new FractionAnalyzedMigration(
                                        siteLabel,
                                        sampleId,
                                        sampleLabel,
                                        fractionAnalyzed,
                                        modifiedFraction_MIN2_0,
                                        fraction_MIN2_0,
                                        orgOrMin,
                                        sieveSize,
                                        featureLabel));
                            }
                            // Min 1.0
                            fractionAnalyzed = row.getString("MIN1_0");
                            if (fractionAnalyzed != null) {
                                // Map fractionAnalyzed: 'ja' 'nein' 'teils' -> 'yes' 'no' 'partly'
                                if (fractionAnalyzed.equals("ja")) {
                                    fractionAnalyzed = "yes";
                                }
                                if (fractionAnalyzed.equals("nein")) {
                                    fractionAnalyzed = "no";
                                }
                                if (fractionAnalyzed.equals("teils")) {
                                    fractionAnalyzed = "partly";
                                }

                                // Set orgOrMin and sieveSize, if fraction is not modified
                                String orgOrMin;
                                Double sieveSize;
                                if (!modifiedFraction_MIN1_0) {
                                    orgOrMin = "min";
                                    sieveSize = 1.0;
                                } else {
                                    orgOrMin = null;
                                    sieveSize = null;
                                }

                                fractionAnalyzedList.add(new FractionAnalyzedMigration(
                                        siteLabel,
                                        sampleId,
                                        sampleLabel,
                                        fractionAnalyzed,
                                        modifiedFraction_MIN1_0,
                                        fraction_MIN1_0,
                                        orgOrMin,
                                        sieveSize,
                                        featureLabel));
                            }
                            // Min 0.5
                            fractionAnalyzed = row.getString("MIN0_5");
                            if (fractionAnalyzed != null) {
                                // Map fractionAnalyzed: 'ja' 'nein' 'teils' -> 'yes' 'no' 'partly'
                                if (fractionAnalyzed.equals("ja")) {
                                    fractionAnalyzed = "yes";
                                }
                                if (fractionAnalyzed.equals("nein")) {
                                    fractionAnalyzed = "no";
                                }
                                if (fractionAnalyzed.equals("teils")) {
                                    fractionAnalyzed = "partly";
                                }

                                // Set orgOrMin and sieveSize, if fraction is not modified
                                String orgOrMin;
                                Double sieveSize;
                                if (!modifiedFraction_MIN0_5) {
                                    orgOrMin = "min";
                                    sieveSize = 0.5;
                                } else {
                                    orgOrMin = null;
                                    sieveSize = null;
                                }

                                fractionAnalyzedList.add(new FractionAnalyzedMigration(
                                        siteLabel,
                                        sampleId,
                                        sampleLabel,
                                        fractionAnalyzed,
                                        modifiedFraction_MIN0_5,
                                        fraction_MIN0_5,
                                        orgOrMin,
                                        sieveSize,
                                        featureLabel));
                            }
                            // Min 0.25
                            fractionAnalyzed = row.getString("MIN0_25");
                            if (fractionAnalyzed != null) {
                                // Map fractionAnalyzed: 'ja' 'nein' 'teils' -> 'yes' 'no' 'partly'
                                if (fractionAnalyzed.equals("ja")) {
                                    fractionAnalyzed = "yes";
                                }
                                if (fractionAnalyzed.equals("nein")) {
                                    fractionAnalyzed = "no";
                                }
                                if (fractionAnalyzed.equals("teils")) {
                                    fractionAnalyzed = "partly";
                                }

                                // Set orgOrMin and sieveSize, if fraction is not modified
                                String orgOrMin;
                                Double sieveSize;
                                if (!modifiedFraction_MIN0_25) {
                                    orgOrMin = "min";
                                    sieveSize = 0.25;
                                } else {
                                    orgOrMin = null;
                                    sieveSize = null;
                                }

                                fractionAnalyzedList.add(new FractionAnalyzedMigration(
                                        siteLabel,
                                        sampleId,
                                        sampleLabel,
                                        fractionAnalyzed,
                                        modifiedFraction_MIN0_25,
                                        fraction_MIN0_25,
                                        orgOrMin,
                                        sieveSize,
                                        featureLabel));
                            }
                            // -----------------------------------------------------------------------
                        }
                    }
                    case "Datierung" -> {

                        //  ArboDat(Access)             ArboDat+
                        // ------------------------------------------------------------------------------------------
                        //  Projekt*                    -> Site entity -> label
                        //  Befu*                       -> Feature entity -> label
                        //  ProbNr*                     -> Sample entity -> label
                        //  Unterprobe*                 -> subSample
                        //  Labornummer                 -> Laboratory entity -> label + DendrochronologicalDating entity -> number
                        //                                                            + OtherDating entity -> number
                        //                              -> C14Laboratory entity -> labCode + C14Dating entity -> number
                        //  Material                    -> Material entity -> label (Dante)
                        //  Methode                     -> DatingMethod -> label (Dante)
                        //  Waldkante                   -> DendrochronologicalDating entity -> waneyEdge
                        //  Dendroalter                 -> DendrochronologicalDating entity -> dendrochronologicalAge
                        //  Alter andere                -> OtherDating entity -> ageDivers
                        //  C14-Alter BP                -> C14Dating entity -> c14AgeBp
                        //  Standardab C14              -> C14Dating entity -> c14c14StdDev
                        //  C14 cal                     -> C14Dating entity -> c14CalibrationBcAd2s
                        //  13C PDB-Wert                -> C14Dating entity -> deltaC13
                        //  Standardab 13C PDB          -> C14Dating entity -> deltaC13Uncertainty
                        //  pMC-Wert                    -> C14Dating entity -> pmc
                        //  Standardab PMC              -> C14Dating entity -> pmcUncertainty
                        //  Anmerkungen                 -> remarks


                        String siteLabel = row.getString("Projekt");

                        // Site of absolute dating was selected
                        if (siteLabelList.contains(siteLabel)) {

                            // feature handling
                            String featureLabel = row.getString("Befu");

                            // sample handling
                            String sampleLabel = row.getString("ProbNr");
                            String uniqueSampleString = siteLabel + "_" + featureLabel+ "_" + sampleLabel;
                            UUID sampleId = sampleLabelIdMap.get(uniqueSampleString);

                            // absoluteDating handling
                            String subSample = row.getString("Unterprobe");
                            UUID absoluteDatingId;


                            // Migrate, if absolute dating doesn't already exist OR not belongs to the given sample
                            List<AbsoluteDating> absoluteDatingWithSubSampleLabel = absoluteDatingRepository.findAllBySubSample(subSample);
                            if (absoluteDatingWithSubSampleLabel.isEmpty() || absoluteDatingWithSubSampleLabel.stream()
                                                                              .noneMatch(absoluteDating -> absoluteDating.getSample().getId().equals(sampleId))) {
                                // Insert a new absolute dating
                                AbsoluteDating newAbsoluteDating = absoluteDatingRepository.save(new AbsoluteDating());
                                absoluteDatingId = newAbsoluteDating.getId();

                                // Assign absolute dating to sample
                                Optional<Sample> sample = sampleRepository.findById(sampleId);
                                sample.ifPresent(newAbsoluteDating::setSample);

                                // Set absolute dating attributes
                                newAbsoluteDating.setSubSample(subSample);
                                newAbsoluteDating.setRemarks(row.getString("Anmerkungen"));

                                // Set material
                                String materialLabel = row.getString("Material");
                                if (materialLabel != null) {
                                    Optional<Material> material = materialRepository.findByLabel(materialLabel);
                                    if (material.isPresent()) {
                                        newAbsoluteDating.setMaterial(material.get());
                                    } else {
                                        nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("absoluteDating",
                                                absoluteDatingId,
                                                subSample,
                                                "material",
                                                materialLabel));
                                    }
                                }
                                // Set dating method
                                String datingMethodLabel = row.getString("Methode");
                                if(datingMethodLabel != null) {
                                    String datingMethodUri = datingMethodMapper.getUri(datingMethodLabel);
                                    Optional<DatingMethod> datingMethod = (datingMethodUri != null) ? datingMethodRepository.findById(datingMethodUri)
                                            : Optional.empty();
                                    if (datingMethod.isPresent()) {
                                        newAbsoluteDating.setDatingMethod(datingMethod.get());
                                    } else {
                                        nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("absoluteDating",
                                                absoluteDatingId,
                                                subSample,
                                                "datingMethod",
                                                datingMethodLabel));
                                    }
                                }
                                // ToDo: Perhaps check whether there is anything else in the other fields
                                if (datingMethodLabel.equals("C14-Datierung")) {
                                    // Create new C14 dating
                                    C14Dating newC14Dating = new C14Dating();
                                    newC14Dating.setC14AgeBp(row.getInt("C14-Alter BP"));
                                    newC14Dating.setC14StdDev(row.getInt("Standardab C14"));
                                    newC14Dating.setC14CalibrationBcAd2s(row.getString("C14 cal"));
                                    newC14Dating.setDeltaC13(row.getDouble("13C PDB-Wert"));
                                    newC14Dating.setDeltaC13Uncertainty(row.getDouble("Standardab 13C PDB"));
                                    newC14Dating.setPmc(row.getDouble("pMC-Wert"));
                                    newC14Dating.setPmcUncertainty(row.getDouble("Standardab PMC"));
                                    // Assign C14 dating to new absolute dating
                                    newAbsoluteDating.setC14Dating(newC14Dating);

                                    labAndNumberList.add(new LabAndNumberMigration(absoluteDatingId,
                                                                                   sampleLabel,
                                                                                   subSample,
                                                                                   "c14Dating",
                                                                                   row.getString("Labornummer"),
                                                                                   "",-1,
                                                                                   siteLabel,
                                                                                   featureLabel));
                                } else if (datingMethodLabel.equals("Dendrochronologie")) {
                                    // Create new dendro dating
                                    DendrochronologicalDating newDendroDating = new DendrochronologicalDating();
                                    newDendroDating.setDendrochronologicalAge(row.getString("Dendroalter"));
                                    newDendroDating.setWaneyEdge(row.getBoolean("Waldkante"));
                                    // Assign dendro dating to new absolute dating
                                    newAbsoluteDating.setDendrochronologicalDating(newDendroDating);

                                    labAndNumberList.add(new LabAndNumberMigration(absoluteDatingId,
                                                                                   sampleLabel,
                                                                                   subSample,
                                                                                   "dendroDating",
                                                                                   row.getString("Labornummer"),
                                                                                   "",-1,
                                                                                   siteLabel,
                                                                                   featureLabel));
                                } else {
                                    // Create new other dating
                                    OtherDating newOtherDating = new OtherDating();
                                    newOtherDating.setAgeDivers(row.getString("Alter andere"));
                                    // Assign dendro dating to new absolute dating
                                    newAbsoluteDating.setOtherDating(newOtherDating);

                                    labAndNumberList.add(new LabAndNumberMigration(absoluteDatingId,
                                                                                   sampleLabel,
                                                                                   subSample,
                                                                                   "otherDating",
                                                                                   row.getString("Labornummer"),
                                                                                   "",-1,
                                                                                   siteLabel,
                                                                                   featureLabel));
                                }

                                // Update newAbsoluteDating
                                absoluteDatingRepository.save(newAbsoluteDating);
                            }

                            else {
                                // Find matched absolute dating in repository
                                AbsoluteDating matchingAbsoluteDating = absoluteDatingWithSubSampleLabel.stream()
                                        .filter(dating -> dating.getSample().getId().equals(sampleId)).findFirst()
                                        .orElseThrow(() -> new IllegalArgumentException("No matching absolute dating found, although if condition ensures this"));

                                absoluteDatingId = matchingAbsoluteDating.getId();

                                existingAbsoluteDatingList.add(new ExistingAbsoluteDating(subSample, absoluteDatingId, sampleLabel, featureLabel, siteLabel));


                            // Check whether the attributes have not yet been set by previous migration attempts ----------

                                // Material --------------------------------------------------------------
                                if (matchingAbsoluteDating.getMaterial() == null) {
                                    String materialLabel = row.getString("Material");
                                    if (materialLabel != null) {
                                        Optional<Material> material = materialRepository.findByLabel(materialLabel);
                                        if (material.isPresent()) {
                                            matchingAbsoluteDating.setMaterial(material.get());
                                            absoluteDatingRepository.save(matchingAbsoluteDating);
                                        } else {
                                            nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("absoluteDating",
                                                    absoluteDatingId,
                                                    subSample,
                                                    "material",
                                                    materialLabel));
                                        }
                                    }
                                }

                                String datingMethodLabel = row.getString("Methode");

                                // Dating method ---------------------------------------------------------
                                if (matchingAbsoluteDating.getDatingMethod() == null) {
                                    if(datingMethodLabel != null) {
                                        String datingMethodUri = datingMethodMapper.getUri(datingMethodLabel);
                                        Optional<DatingMethod> datingMethod = (datingMethodUri != null) ? datingMethodRepository.findById(datingMethodUri)
                                                : Optional.empty();
                                        if (datingMethod.isPresent()) {
                                            matchingAbsoluteDating.setDatingMethod(datingMethod.get());
                                            absoluteDatingRepository.save(matchingAbsoluteDating);
                                        } else {
                                            nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("absoluteDating",
                                                    absoluteDatingId,
                                                    subSample,
                                                    "datingMethod",
                                                    datingMethodLabel));
                                        }
                                    }
                                }

                                // ToDo: Perhaps check whether there is anything else in the other fields
                                if (datingMethodLabel.equals("C14-Datierung")) {
                                    if (matchingAbsoluteDating.getC14Dating().getC14Laboratory() == null) {
                                        labAndNumberList.add(new LabAndNumberMigration(absoluteDatingId,
                                                sampleLabel,
                                                subSample,
                                                "c14Dating",
                                                row.getString("Labornummer"),
                                                "",-1,
                                                siteLabel,
                                                featureLabel));
                                    }
                                } else if (datingMethodLabel.equals("Dendrochronologie")) {
                                    if (matchingAbsoluteDating.getDendrochronologicalDating().getLaboratory() == null) {
                                        labAndNumberList.add(new LabAndNumberMigration(absoluteDatingId,
                                                sampleLabel,
                                                subSample,
                                                "dendroDating",
                                                row.getString("Labornummer"),
                                                "",-1,
                                                siteLabel,
                                                featureLabel));
                                    }
                                } else {
                                    if (matchingAbsoluteDating.getOtherDating().getLaboratory() == null) {
                                        labAndNumberList.add(new LabAndNumberMigration(absoluteDatingId,
                                                sampleLabel,
                                                subSample,
                                                "otherDating",
                                                row.getString("Labornummer"),
                                                "",-1,
                                                siteLabel,
                                                featureLabel));;
                                    }
                                }

                            // -----------------------------------------------------------------------------------------
                            }
                        }
                    }
                    case "Details" -> {

                        //  ArboDat(Access)             ArboDat+
                        // ---------------------------------------------------------------------------------------------
                        //  Projekt*                    -> Site entity -> label
                        //  Befu*                       -> Feature entity -> label
                        //  ProbNr*                     -> Sample entity -> label
                        //  PCODE*                      -> TaxCode entity -> label (Dante)
                        //  Fraktion*                   -> fractionAnalyzed, orgOrMin, sieveSize
                        //  cf*                         -> classificationConfer entity -> label (Dante)
                        //  RTyp*                       -> RestTyp entity -> label (Dante)
                        //  Zust*                       -> StateOfPreservation entity -> label (Dante)
                        //  rAnzahl                     -> restCount
                        //  rGewicht                    -> restWeight
                        //  geschätzt                   -> estimation
                        //  rFrag                       -> restFragment
                        //  Multiplikator               -> multiplier
                        //  FAnzahl                     (not required) is calculated in frontend
                        //  FFragmente                  (not required) is calculated in frontend
                        //  FGewicht                    (not required) is calculated in frontend
                        //  EDatProb                    -> entryDate
                        //  AnmFrakt                    -> remarksTaxonomy


                        String siteLabel = row.getString("Projekt");

                        // Site of result was selected
                        if (siteLabelList.contains(siteLabel)) {

                            // feature handling
                            String featureLabel = row.getString("Befu");

                            // sample handling
                            String sampleLabel = row.getString("ProbNr");
                            String uniqueSampleString = siteLabel + "_" + featureLabel+ "_" + sampleLabel;
                            UUID sampleId = sampleLabelIdMap.get(uniqueSampleString);

                            // TaxCode
                            String taxCodeLabel = row.getString("PCODE");


                            // ToDo: - Abfangen, wenn result bereits existiert:
                            //         PK: sampleId (site, feature, sample),
                            //             taxCode, fraction(orgOrMin + sieveSize), cf, restType, stateOfPreservation


                            // Create a new result
                            ResultMigration newResultMigration = new ResultMigration();
                            Result newResult = new Result();

                            // Assign result to sample
                            Optional<Sample> sample = sampleRepository.findById(sampleId);
                            sample.ifPresent(newResult::setSample);

                            // Set result attributes
                            newResult.setRestCount(row.getInt("rAnzahl"));
                            newResult.setRestWeight(row.getDouble("rGewicht"));
                            newResult.setEstimation(row.getBoolean("geschätzt"));
                            newResult.setRestFragment(row.getInt("rFrag"));
                            newResult.setMultiplier(row.getDouble("Multiplikator"));
                            newResult.setRemarksTaxonomy(row.getString("AnmFrakt"));

                            // Set entry date
                            LocalDateTime localDateTime = row.getLocalDateTime("EDatProb");
                            Date entryDate = Date.from(localDateTime.atZone(ZoneId.systemDefault()).toInstant());
                            newResult.setEntryDate(entryDate);

                            // Set TaxCode
                            Optional<TaxCode> taxCode = taxCodeRepository.findByLabel(taxCodeLabel);
                            if (taxCode.isPresent()) {
                                newResult.setTaxCode(taxCode.get());
                            } else {
                                newResultMigration.setNonMatchingTaxCode(taxCodeLabel);
                            }

                            // Set fraction analyzed
                            Double multiplier = row.getDouble("Multiplikator");
                            newResult.setMultiplier(multiplier);
                            boolean modifiedFraction = false;
                            String fraction = row.getString("Fraktion");
                            String orgOrMin;
                            Double sieveSize;
                            switch (fraction) {
                                case "ORG 2,0" -> {
                                    orgOrMin = "org";
                                    sieveSize = 2.0;
                                }
                                case "ORG 1,0" -> {
                                    orgOrMin = "org";
                                    sieveSize = 1.0;
                                }
                                case "ORG 0,5" -> {
                                    orgOrMin = "org";
                                    sieveSize = 0.5;
                                }
                                case "ORG 0,25" -> {
                                    orgOrMin = "org";
                                    sieveSize = 0.25;
                                }
                                case "MIN 2,0" -> {
                                    orgOrMin = "min";
                                    sieveSize = 2.0;
                                }
                                case "MIN 1,0" -> {
                                    orgOrMin = "min";
                                    sieveSize = 1.0;
                                }
                                case "MIN 0,5" -> {
                                    orgOrMin = "min";
                                    sieveSize = 0.5;
                                }
                                case "MIN 0,25" -> {
                                    orgOrMin = "min";
                                    sieveSize = 0.25;
                                }
                                default -> {
                                    modifiedFraction = true;
                                    orgOrMin = null;
                                    sieveSize = null;
                                }
                            }
                            newResultMigration.setFractionAnalyzed(new FractionAnalyzedMigration(siteLabel,
                                                                                                 sampleId,
                                                                                                 sampleLabel,
                                                                                                 null,
                                                                                                 modifiedFraction,
                                                                                                 fraction,
                                                                                                 orgOrMin,
                                                                                                 sieveSize,
                                                                                                 featureLabel));

                            // Set stateOfPreservation
                            String stateOfPreservationLabel = row.getString("Zust");
                            String stateOfPreservationUri = stateOfPreservationMapper.getUri(stateOfPreservationLabel);
                            Optional<StateOfPreservation> stateOfPreservation = (stateOfPreservationUri != null)
                                                                                ? stateOfPreservationRepository.findById(stateOfPreservationUri)
                                                                                : Optional.empty();
                            if (stateOfPreservation.isPresent()) {
                                String mappedStateOfPreservationLabel = stateOfPreservation.get().getLabel();
                                newResult.setStateOfPreservation(stateOfPreservation.get());
                            } else {
                                newResultMigration.setNonMatchingStateOfPreservation(stateOfPreservationLabel);
                            }
                            // Set rest type
                            String restTypeLabel = row.getString("RTyp");
                            String restTypeUri = restTypeMapper.getUri(restTypeLabel);
                            Optional<RestType> restType = (restTypeUri != null) ? restTypeRepository.findById(restTypeUri)
                                                                                : Optional.empty();
                            if (restType.isPresent()) {
                                String mappedRestTypeLabel = restType.get().getLabel();
                                newResult.setRestType(restType.get());
                            } else {
                                newResultMigration.setNonMatchingRestType(restTypeLabel);
                            }
                            // Set classificationConfer
                            String classificationConferLabel = row.getString("cf");
                            String classificationConferUri = classificationConferMapper.getUri(classificationConferLabel);
                            Optional<ClassificationConfer> classificationConfer = (classificationConferUri != null)
                                    ? classificationConferRepository.findById(classificationConferUri)
                                    : Optional.empty();
                            if (classificationConfer.isPresent()) {
                                String mappedClassificationConferLabel = classificationConfer.get().getLabel();
                                newResult.setClassificationConfer(classificationConfer.get());
                            } else {
                                newResultMigration.setNonMatchingClassificationConfer(classificationConferLabel);
                            }


                            newResultMigration.setResult(newResult);

                            // Check if siteLabel already exists in resultList
                            boolean found = false;
                            for (Map.Entry<String, List<ResultMigration>> entry : resultList) {
                                if (entry.getKey().equals(siteLabel)) {
                                    // Then add 'newResultMigration'
                                    entry.getValue().add(newResultMigration);
                                    found = true;
                                    break;
                                }
                            }
                            // Else create new entry with siteLabel and add 'newResultMigration'
                            if (!found) {
                                List<ResultMigration> newList = new ArrayList<>();
                                newList.add(newResultMigration);
                                resultList.add(new AbstractMap.SimpleEntry<>(siteLabel, newList));
                            }
                        }
                    }
                }
            }
        } catch (IOException e) {
            e.printStackTrace();
        }

        // Set lists in migration response -----------------------------------------------
        tableMigrationResponse.setNonMatchingDanteAttributeList(nonMatchingDanteAttributeList);
        tableMigrationResponse.setLiteratureList(literatureList);
        tableMigrationResponse.setCoordinateList(coordinateList);
        tableMigrationResponse.setUserList(userList);
        tableMigrationResponse.setFractionAnalyzedList(fractionAnalyzedList);
        tableMigrationResponse.setLabAndNumberList(labAndNumberList);
        tableMigrationResponse.setResultList(resultList);

        tableMigrationResponse.setExistingSiteList(existingSiteList);
        tableMigrationResponse.setExistingFeatureList(existingFeatureList);
        tableMigrationResponse.setExistingSampleList(existingSampleList);
        tableMigrationResponse.setExistingAbsoluteDatingList(existingAbsoluteDatingList);
        // -------------------------------------------------------------------------------

        return tableMigrationResponse;
    }


    private boolean isAddressEmpty(Address address) {
        return (address.getCountry() == null || address.getCountry().isEmpty()) &&
                (address.getCounty() == null || address.getCounty().isEmpty()) &&
                (address.getDistrict() == null || address.getDistrict().isEmpty()) &&
                (address.getTown() == null || address.getTown().isEmpty()) &&
                (address.getStreet_or_place() == null || address.getStreet_or_place().isEmpty());
    }
}