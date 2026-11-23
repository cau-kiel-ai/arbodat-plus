package arbodat.plus.service;

import arbodat.plus.dto_migration.*;
import arbodat.plus.model.*;
import arbodat.plus.repository.*;

import arbodat.plus.service.migration_mapper.*;
import com.healthmarketscience.jackcess.Database;
import com.healthmarketscience.jackcess.DatabaseBuilder;
import com.healthmarketscience.jackcess.Table;
import com.healthmarketscience.jackcess.Row;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Example;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StopWatch;

import java.io.File;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;
import java.util.function.Function;

@Service
public class MigrationService {

    private static final Logger log = LoggerFactory.getLogger(MigrationService.class);

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


    @Autowired
    ResearchProjectRepository researchProjectRepository;

    @Autowired
    PlatformTransactionManager transactionManager;


    // Sequence and names of the tables to be migrated
    List<String> tableNames = new ArrayList<>(Arrays.asList("Projekte", "Befunde", "Proben", "Datierung", "Details"));

    // State of one migration call: the opened .mdb files, their rows grouped once, the label <-> id maps
    // and the looked up DANTE entities. Created per call, so concurrent migrations don't share any state
    // and nothing is left over after a failed migration.
    // Labels are compared case-insensitively like in Access: there a child row may refer to its site, feature
    // or sample in other letter case ('ok' / 'OK'), the keys and relationships treat them as equal.
    private static class MigrationContext {

        final Database db;
        final Database strukDataDB;

        // Selected site labels, spelled as in the table 'Projekte'
        private final Map<String, String> siteLabels = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);

        // Maps for label <-> id mapping
        final Map<String, UUID> siteLabelIdMap = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
        final Map<String, UUID> featureLabelIdMap = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
        final Map<String, UUID> sampleLabelIdMap = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);

        // Looked up DANTE entities (by uri or label), so every distinct value is queried only once
        private final Map<String, Optional<?>> lookupCache = new HashMap<>();

        // Rows of an ArboDat table grouped by 'Projekt' / by "siteLabel_featureLabel" ('Projekt' and 'Befu')
        private final Map<String, Map<String, List<Row>>> rowsBySite = new HashMap<>();
        private final Map<String, Map<String, List<Row>>> rowsBySiteAndFeature = new HashMap<>();

        MigrationContext(Database db, Database strukDataDB, Collection<String> siteLabels) {
            this.db = db;
            this.strukDataDB = strukDataDB;
            siteLabels.forEach(siteLabel -> this.siteLabels.putIfAbsent(siteLabel, siteLabel));
        }

        // Site label of a row, spelled as in the table 'Projekte' (if the site is selected)
        String siteLabelOf(Row row) {
            String siteLabel = row.getString("Projekt");
            return siteLabel == null ? null : siteLabels.getOrDefault(siteLabel, siteLabel);
        }

        @SuppressWarnings("unchecked")
        <T> Optional<T> cachedLookup(String type, String key, Function<String, Optional<T>> lookup) {
            if (key == null) {
                return Optional.empty();
            }
            return (Optional<T>) lookupCache.computeIfAbsent(type + "|" + key, k -> lookup.apply(key));
        }

        // Rows of the given sites (in table order), the table is read only once
        List<Row> rowsOfSites(String tableName, Set<String> siteLabels) throws IOException {
            if (!rowsBySite.containsKey(tableName)) {
                Map<String, List<Row>> grouped = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
                for (Row line : getTable(tableName)) {
                    // Rows without site can't belong to a selected site
                    if (line.getString("Projekt") != null) {
                        grouped.computeIfAbsent(line.getString("Projekt"), k -> new ArrayList<>()).add(line);
                    }
                }
                rowsBySite.put(tableName, grouped);
            }
            List<Row> rows = new ArrayList<>();
            for (String siteLabel : siteLabels) {
                rows.addAll(rowsBySite.get(tableName).getOrDefault(siteLabel, List.of()));
            }
            return rows;
        }

        // Replaces a scan of the whole table for every feature / sample
        Map<String, List<Row>> groupBySiteAndFeature(String tableName) throws IOException {
            if (!rowsBySiteAndFeature.containsKey(tableName)) {
                Map<String, List<Row>> grouped = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
                for (Row line : getTable(tableName)) {
                    String key = line.getString("Projekt") + "_" + line.getString("Befu");
                    grouped.computeIfAbsent(key, k -> new ArrayList<>()).add(line);
                }
                rowsBySiteAndFeature.put(tableName, grouped);
            }
            return rowsBySiteAndFeature.get(tableName);
        }

        // Removes the ids of a site, whose migration was rolled back
        void forgetSite(String siteLabel) {
            String prefix = siteLabel + "_";
            siteLabelIdMap.remove(siteLabel);
            featureLabelIdMap.keySet().removeIf(key -> key.regionMatches(true, 0, prefix, 0, prefix.length()));
            sampleLabelIdMap.keySet().removeIf(key -> key.regionMatches(true, 0, prefix, 0, prefix.length()));
        }

        private Table getTable(String tableName) throws IOException {
            Table table = db.getTable(tableName);
            if (table == null) {
                throw new IllegalArgumentException("table '" + tableName + "' doesn't exist");
            }
            return table;
        }
    }

    public MigrationResponse migrateData(String dataFilePath, String strukDataFilePath,
                                         List<ResearchProject> transferredResearchProjectList,
                                         List<String> siteLabelList) {

        // Init returned data
        MigrationResponse migrationResponse = new MigrationResponse();

        TransactionTemplate transactionTemplate = new TransactionTemplate(transactionManager);

        // Create research project(s) - remember the new ones, to remove them if no site could be migrated
        List<Boolean> newResearchProjects = transferredResearchProjectList.stream()
                .map(researchProject -> researchProject.getId() == null)
                .toList();
        List<ResearchProject> researchProjectList = transactionTemplate.execute(status ->
                researchProjectService.create(transferredResearchProjectList));

        StopWatch stopWatch = new StopWatch("migration");
        int migratedSites = 0;

        try (Database db = DatabaseBuilder.open(new File(dataFilePath));
             Database strukDataDB = DatabaseBuilder.open(new File(strukDataFilePath))) {

            MigrationContext ctx = new MigrationContext(db, strukDataDB, siteLabelList);

            // Every site with its features, samples, datings and results is migrated in its own transaction:
            // if something fails, only this site is rolled back and reported, the other sites are migrated
            for (String siteLabel : new LinkedHashSet<>(siteLabelList)) {
                stopWatch.start(siteLabel);
                MigrationResponse siteMigrationResponse = new MigrationResponse();
                try {
                    transactionTemplate.executeWithoutResult(status -> {
                        for (String tableName : tableNames) {
                            addResponseLists(siteMigrationResponse,
                                             migrateTables(ctx, tableName, researchProjectList, Set.of(siteLabel)));
                        }
                    });
                    addResponseLists(migrationResponse, siteMigrationResponse);
                    migratedSites++;
                } catch (RuntimeException e) {
                    log.error("Migration of site '{}' failed and was rolled back", siteLabel, e);
                    ctx.forgetSite(siteLabel);
                    migrationResponse.getFailedSiteList().add(new FailedSite(siteLabel,
                            e.getClass().getSimpleName() + (e.getMessage() != null ? ": " + e.getMessage() : "")));
                } finally {
                    stopWatch.stop();
                }
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Could not read the .mdb files: " + e.getMessage(), e);
        } finally {
            // No site migrated: remove the research projects created for this migration
            if (migratedSites == 0) {
                List<ResearchProject> created = new ArrayList<>();
                for (int i = 0; i < researchProjectList.size(); i++) {
                    if (newResearchProjects.get(i)) {
                        created.add(researchProjectList.get(i));
                    }
                }
                if (!created.isEmpty()) {
                    transactionTemplate.executeWithoutResult(status -> researchProjectRepository.deleteAll(created));
                }
            }
        }

        log.info(stopWatch.prettyPrint());

        return migrationResponse;
    }

    // Adds all lists of 'from' to 'to'
    private void addResponseLists(MigrationResponse to, MigrationResponse from) {
        to.getNonMatchingDanteAttributeList().addAll(from.getNonMatchingDanteAttributeList());
        to.getLiteratureList().addAll(from.getLiteratureList());
        to.getCoordinateList().addAll(from.getCoordinateList());
        to.getUserList().addAll(from.getUserList());
        to.getFractionAnalyzedList().addAll(from.getFractionAnalyzedList());
        to.getLabAndNumberList().addAll(from.getLabAndNumberList());
        to.getResultList().addAll(from.getResultList());

        to.getExistingSiteList().addAll(from.getExistingSiteList());
        to.getExistingFeatureList().addAll(from.getExistingFeatureList());
        to.getExistingSampleList().addAll(from.getExistingSampleList());
        to.getExistingAbsoluteDatingList().addAll(from.getExistingAbsoluteDatingList());
    }

    private MigrationResponse migrateTables(MigrationContext ctx,
                                            String tableName,
                                            List<ResearchProject> researchProjectList,
                                            Set<String> siteLabelList) {

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

        // Label <-> id maps of the current migration
        Map<String, UUID> siteLabelIdMap = ctx.siteLabelIdMap;
        Map<String, UUID> featureLabelIdMap = ctx.featureLabelIdMap;
        Map<String, UUID> sampleLabelIdMap = ctx.sampleLabelIdMap;

        try {

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

            try {
                Database strukDataDB = ctx.strukDataDB;
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
                throw new UncheckedIOException("Could not read 'ArchBotStrukDat.mdb': " + e.getMessage(), e);
            } // ----------------------------------------------------------------------------


            // Rows of the selected site(s) in the corresponding table of the .mdb file
            List<Row> rows = ctx.rowsOfSites(tableName, siteLabelList);

            // Rows of other tables, which are needed for every feature / sample
            Map<String, List<Row>> excavationYearsBySiteAndFeature = tableName.equals("Befunde")
                    ? ctx.groupBySiteAndFeature("Grabungsjahre") : Map.of();
            Map<String, List<Row>> featureRowsBySiteAndFeature = tableName.equals("Proben")
                    ? ctx.groupBySiteAndFeature("Befunde") : Map.of();

            // Migrate lines
            for (Row row : rows) {
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
                        //  rWert, hWert, üNN           -> CoordinateMigration (rWert = easting -> longitude, hWert = northing -> latitude)
                        //  ArchAusg                    -> archaeologicalExcavator
                        //  ArchBear                    -> archaeologicalEditor
                        //  Limes                       -> CoordinateMigration -> remarks
                        //  BotBear                     -> botanicalEditor
                        //  Aut, PublJahr               -> LiteratureMigration
                        //  okFustel                    -> undisturbed
                        //  AnmFustel                   -> remarks
                        //  Staat                       -> Address entity -> county
                        //  KoordSys                    -> CoordinateMigration (EPSG-Code needed)


                        String siteLabel = ctx.siteLabelOf(row);

                        // Site was selected
                        if (siteLabelList.contains(siteLabel)) {

                            // site handling
                            UUID siteId;

                            // Migrate, if site doesn't already exist OR not belongs to any transferred research project(s)
                            List<Site> sitesWithLabel = siteRepository.findAllByLabel(siteLabel);
                            if (sitesWithLabel.isEmpty() || sitesWithLabel.stream()
                                                            .noneMatch(site -> site.getResearchProjectList().stream()
                                                            .anyMatch(researchProjectList::contains))) {

                                // Build the new site completely, then insert it once
                                Site newSite = new Site();

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
                                Optional<NaturalUnit> naturalUnit = ctx.cachedLookup("naturalUnit", naturalUnitUri, naturalUnitRepository::findById);
                                naturalUnit.ifPresent(newSite::setNaturalUnit);

                                // Set address
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

                                // Set an altitude-only coordinate or TK and Limes as site remarks
                                boolean siteCoordinateToComplete = setSiteCoordinateOrRemarks(newSite, row);

                                // Insert the new site
                                newSite = siteRepository.save(newSite);
                                siteId = newSite.getId();

                                // Add site label + id to map
                                siteLabelIdMap.put(siteLabel, siteId);

                                // Natural unit without match
                                if (naturalUnit.isEmpty()) {
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

                                // Add coordinate info (with easting / northing) to coordinateList -------
                                if (siteCoordinateToComplete) {
                                    coordinateList.add(siteCoordinateMigration(row, siteId, siteLabel));
                                }

                                // Add literature info to literatureList ---------------------------------
                                String author = row.getString("Aut");
                                String publicationYear = row.getString("PublJahr");
                                if (author != null || publicationYear != null) {
                                    literatureList.add(new LiteratureMigration(siteId, siteLabel, author, publicationYear));
                                }
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
                                    Optional<NaturalUnit> naturalUnit = ctx.cachedLookup("naturalUnit", naturalUnitUri, naturalUnitRepository::findById);
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


                                // Coordinate (altitude-only directly, with easting / northing to coordinateList) ----
                                if (matchingSite.getCoordinate() == null) {
                                    if (setSiteCoordinateOrRemarks(matchingSite, row)) {
                                        coordinateList.add(siteCoordinateMigration(row, siteId, siteLabel));
                                    } else {
                                        siteRepository.save(matchingSite);
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


                        String siteLabel = ctx.siteLabelOf(row);

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

                                // Build the new feature completely, then insert it once
                                Feature newFeature = new Feature();

                                // Set feature attributes
                                newFeature.setLabel(featureLabel);
                                newFeature.setExcavationArea(row.getString("FlSchn"));
                                newFeature.setRemarksFeature(row.getString("Anmerkung"));
                                newFeature.setFeatureCondition(row.getBoolean("okBefu"));

                                // Set excavation years ---------------------------------------------------------
                                List<Integer> excavationYears = new ArrayList<>();

                                for (Row line : excavationYearsBySiteAndFeature.getOrDefault(uniqueFeatureString, List.of())) {
                                    Short year = line.getShort("Jahr");
                                    if (year != null) {
                                        excavationYears.add(year.intValue());
                                    }
                                }
                                newFeature.setExcavationYears(excavationYears);
                                // ------------------------------------------------------------------------------

                                // Set building context
                                Short buildingContextNumber = row.getShort("gebäud");
                                if (buildingContextNumber != null) {
                                    if (buildingContextNumber == 1) {
                                        newFeature.setBuildingContext(false);
                                    } else if (buildingContextNumber == 2) {
                                        newFeature.setBuildingContext(true);
                                    }
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
                                    Optional<SiteType> siteType = ctx.cachedLookup("siteType", siteTypeUri, siteTypeRepository::findById);
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
                                Optional<FeatureType> featureType = ctx.cachedLookup("featureType", featureTypeUri, featureTypeRepository::findById);
                                featureType.ifPresent(newFeature::setFeatureType);

                                // Set preservation condition (okErh is nullable in ArboDat)
                                Short preservationConditionNumber = row.getShort("okErh");
                                String preservationConditionLabel = null;
                                Optional<PreservationCondition> preservationCondition = Optional.empty();
                                if (preservationConditionNumber != null) {
                                    switch (preservationConditionNumber) {
                                        case 0 -> {preservationConditionLabel = "good";}
                                        case 1 -> {preservationConditionLabel = "medium";}
                                        case 2 -> {preservationConditionLabel = "bad";}
                                    }
                                    String preservationConditionUri = preservationConditionMapper.getUri(preservationConditionLabel);
                                    preservationCondition = ctx.cachedLookup("preservationCondition", preservationConditionUri, preservationConditionRepository::findById);
                                    preservationCondition.ifPresent(newFeature::setPreservationCondition);
                                }

                                // Insert the new feature
                                newFeature = featureRepository.save(newFeature);
                                featureId = newFeature.getId();

                                // Add "siteLabel_featureLabel" + id to map
                                featureLabelIdMap.put(uniqueFeatureString, featureId);

                                // Feature type / preservation condition without match
                                if (featureType.isEmpty()) {
                                    nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("feature",
                                                                                                    featureId,
                                                                                                    featureLabel,
                                                                                                    "featureType",
                                                                                                    featureTypeLabel));
                                }
                                if (preservationConditionNumber != null && preservationCondition.isEmpty()) {
                                    nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("feature",
                                                                                                    featureId,
                                                                                                    featureLabel,
                                                                                                    "preservationCondition",
                                                                                                    preservationConditionLabel));
                                }
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
                                        Optional<SiteType> siteType = ctx.cachedLookup("siteType", siteTypeUri, siteTypeRepository::findById);
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
                                    Optional<FeatureType> featureType = ctx.cachedLookup("featureType", featureTypeUri, featureTypeRepository::findById);
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
                                Short preservationConditionNumber = row.getShort("okErh");
                                if (matchingFeature.getPreservationCondition() == null && preservationConditionNumber != null) {
                                    // Set preservation condition
                                    String preservationConditionLabel = null;
                                    switch (preservationConditionNumber) {
                                        case 0 -> {preservationConditionLabel = "good";}
                                        case 1 -> {preservationConditionLabel = "medium";}
                                        case 2 -> {preservationConditionLabel = "bad";}
                                    }
                                    String preservationConditionUri = preservationConditionMapper.getUri(preservationConditionLabel);
                                    Optional<PreservationCondition> preservationCondition = ctx.cachedLookup("preservationCondition", preservationConditionUri, preservationConditionRepository::findById);
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


                        String siteLabel = ctx.siteLabelOf(row);

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
                                // Build the new sample completely, then insert it once
                                Sample newSample = new Sample();

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
                                List<String> botDetUserLabels = new ArrayList<>();
                                for (Row line : featureRowsBySiteAndFeature.getOrDefault(uniqueFeatureString, List.of())) {
                                    String botDetYear = line.getString("BestJa");
                                    if (botDetYear != null) {
                                        newSample.setBotanicalDeterminationYear(botDetYear);
                                    }
                                    String userLabel = line.getString("BotBest");
                                    if (userLabel != null) {
                                        botDetUserLabels.add(userLabel);
                                    }
                                }

                                // Set chronozone
                                String chronozoneLabel = row.getString("ChronoDat");
                                String chronozoneUri = chronozoneMapper.getUri(chronozoneLabel);
                                Optional<Chronozone> chronozone = ctx.cachedLookup("chronozone", chronozoneUri, chronozoneRepository::findById);
                                chronozone.ifPresent(newSample::setChronozone);
                                // Set archaeological dating
                                newSample.setArchaeologicalDating(row.getString("ArchDat"));
                                // Set cultural group
                                newSample.setCulturalGroup(row.getString("KultGr"));
                                
                                // Set sample type
                                String sampleTypeLabel = row.getString("ProbTyp");
                                String sampleTypeUri = sampleTypeMapper.getUri(sampleTypeLabel);
                                Optional<SampleType> sampleType = ctx.cachedLookup("sampleType", sampleTypeUri, sampleTypeRepository::findById);
                                sampleType.ifPresent(newSample::setSampleType);
                                // Set seedsAndFruits
                                String seedsAndFruitsLabel = row.getString("Inventar_SaFr");
                                String seedsAnsFruitsUri = sampleInvestigatedMapper.getUri(seedsAndFruitsLabel);
                                Optional<SampleInvestigated> seedsAndFruits = ctx.cachedLookup("sampleInvestigated", seedsAnsFruitsUri, sampleInvestigatedRepository::findById);
                                seedsAndFruits.ifPresent(newSample::setSeedsAndFruits);
                                // Set charcoalInvestigated
                                String charcoalInvestigatedLabel = row.getString("Inventar_HK");
                                String charcoalInvestigatedUri = sampleInvestigatedMapper.getUri(charcoalInvestigatedLabel);
                                Optional<SampleInvestigated> charcoalInvestigated = ctx.cachedLookup("sampleInvestigated", charcoalInvestigatedUri, sampleInvestigatedRepository::findById);
                                charcoalInvestigated.ifPresent(newSample::setCharcoalInvestigated);
                                // Set woodSubfossile
                                String woodSubfossileLabel = row.getString("Inventar_Holz_sf");
                                String woodSubfossileUri = sampleInvestigatedMapper.getUri(woodSubfossileLabel);
                                Optional<SampleInvestigated> woodSubfossile = ctx.cachedLookup("sampleInvestigated", woodSubfossileUri, sampleInvestigatedRepository::findById);
                                woodSubfossile.ifPresent(newSample::setWoodSubfossile);

                                // Set an altitude-only coordinate (without KoordX and KoordY)
                                boolean sampleCoordinateToComplete = setSampleAltitudeCoordinate(newSample, row);

                                // Insert the new sample
                                newSample = sampleRepository.save(newSample);
                                sampleId = newSample.getId();

                                // Add "siteLabel_featureLabel_sampleLabel" + id to map
                                sampleLabelIdMap.put(uniqueSampleString, sampleId);

                                // Add user info to userList
                                for (String userLabel : botDetUserLabels) {
                                    userList.add(new UserMigration("sample", sampleId, sampleLabel,
                                            userLabel, "botanicalDeterminationBy", siteLabel, featureLabel));
                                }

                                // Dante attributes without match
                                if (chronozone.isEmpty()) {
                                    nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("sample",
                                                                                                    sampleId,
                                                                                                    sampleLabel,
                                                                                                    "chronozone",
                                                                                                    chronozoneLabel));
                                }
                                if (sampleType.isEmpty()) {
                                    nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("sample",
                                                                                                    sampleId,
                                                                                                    sampleLabel,
                                                                                                    "sampleType",
                                                                                                    sampleTypeLabel));
                                }
                                if (seedsAndFruits.isEmpty()) {
                                    nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("sample",
                                                                                                    sampleId,
                                                                                                    sampleLabel,
                                                                                                    "seedsAndFruits",
                                                                                                    seedsAndFruitsLabel));
                                }
                                if (charcoalInvestigated.isEmpty()) {
                                    nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("sample",
                                                                                                    sampleId,
                                                                                                    sampleLabel,
                                                                                                    "charcoalInvestigated",
                                                                                                    charcoalInvestigatedLabel));
                                }
                                if (woodSubfossile.isEmpty()) {
                                    nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("sample",
                                                                                                    sampleId,
                                                                                                    sampleLabel,
                                                                                                    "woodSubfossile",
                                                                                                    woodSubfossileLabel));
                                }

                                // Add coordinate info (with KoordX / KoordY) to coordinateList
                                if (sampleCoordinateToComplete) {
                                    coordinateList.add(sampleCoordinateMigration(row, sampleId, sampleLabel, siteLabel, featureLabel));
                                }
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
                                    for (Row line : featureRowsBySiteAndFeature.getOrDefault(uniqueFeatureString, List.of())) {
                                        // Add user info to userList -------------------------------------------
                                        String userLabel = line.getString("BotBest");
                                        if (userLabel != null) {
                                            userList.add(new UserMigration("sample", sampleId, sampleLabel,
                                                    userLabel, "botanicalDeterminationBy", siteLabel, featureLabel));
                                        } // -------------------------------------------------------------------
                                    }
                                }

                                // Chronozone ------------------------------------------------------------
                                if (matchingSample.getChronozone() == null) {
                                    String chronozoneLabel = row.getString("ChronoDat");
                                    String chronozoneUri = chronozoneMapper.getUri(chronozoneLabel);
                                    Optional<Chronozone> chronozone = ctx.cachedLookup("chronozone", chronozoneUri, chronozoneRepository::findById);
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
                                // Sample type -----------------------------------------------------------
                                if (matchingSample.getSampleType() == null) {
                                    String sampleTypeLabel = row.getString("ProbTyp");
                                    String sampleTypeUri = sampleTypeMapper.getUri(sampleTypeLabel);
                                    Optional<SampleType> sampleType = ctx.cachedLookup("sampleType", sampleTypeUri, sampleTypeRepository::findById);
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
                                    Optional<SampleInvestigated> seedsAndFruits = ctx.cachedLookup("sampleInvestigated", seedsAnsFruitsUri, sampleInvestigatedRepository::findById);
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
                                    Optional<SampleInvestigated> charcoalInvestigated = ctx.cachedLookup("sampleInvestigated", charcoalInvestigatedUri, sampleInvestigatedRepository::findById);
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
                                    Optional<SampleInvestigated> woodSubfossile = ctx.cachedLookup("sampleInvestigated", woodSubfossileUri, sampleInvestigatedRepository::findById);
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

                                // Coordinate (altitude-only directly, with KoordX / KoordY to coordinateList) --
                                if (matchingSample.getCoordinate() == null) {
                                    if (setSampleAltitudeCoordinate(matchingSample, row)) {
                                        coordinateList.add(sampleCoordinateMigration(row, sampleId, sampleLabel, siteLabel, featureLabel));
                                    } else if (matchingSample.getCoordinate() != null) {
                                        sampleRepository.save(matchingSample);
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


                        String siteLabel = ctx.siteLabelOf(row);

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
                                // Build the new absolute dating completely, then insert it once
                                AbsoluteDating newAbsoluteDating = new AbsoluteDating();

                                // Assign absolute dating to sample
                                Optional<Sample> sample = sampleRepository.findById(sampleId);
                                sample.ifPresent(newAbsoluteDating::setSample);

                                // Set absolute dating attributes
                                newAbsoluteDating.setSubSample(subSample);

                                // Set material
                                String materialLabel = row.getString("Material");
                                Optional<Material> material = ctx.cachedLookup("materialLabel", materialLabel, materialRepository::findByLabel);
                                material.ifPresent(newAbsoluteDating::setMaterial);
                                // Set dating method
                                String datingMethodLabel = row.getString("Methode");
                                Optional<DatingMethod> datingMethod = ctx.cachedLookup("datingMethod",
                                        datingMethodMapper.getUri(datingMethodLabel), datingMethodRepository::findById);
                                datingMethod.ifPresent(newAbsoluteDating::setDatingMethod);

                                // Type of the sub-dating, for which lab and number are requested
                                String datingType;
                                // ToDo: Perhaps check whether there is anything else in the other fields
                                if ("C14-Datierung".equals(datingMethodLabel)) {
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

                                    datingType = "c14Dating";
                                } else if ("Dendrochronologie".equals(datingMethodLabel)) {
                                    // Create new dendro dating
                                    DendrochronologicalDating newDendroDating = new DendrochronologicalDating();
                                    newDendroDating.setDendrochronologicalAge(row.getString("Dendroalter"));
                                    newDendroDating.setWaneyEdge(row.getBoolean("Waldkante"));
                                    // Assign dendro dating to new absolute dating
                                    newAbsoluteDating.setDendrochronologicalDating(newDendroDating);

                                    datingType = "dendroDating";
                                } else {
                                    // Create new other dating
                                    OtherDating newOtherDating = new OtherDating();
                                    newOtherDating.setAgeDivers(row.getString("Alter andere"));
                                    // Assign dendro dating to new absolute dating
                                    newAbsoluteDating.setOtherDating(newOtherDating);

                                    datingType = "otherDating";
                                }

                                // Remarks: ArboDat remarks + material text without match + fields of other dating methods
                                // (they have no target in ArboDat+ and would be lost otherwise)
                                String remarks = row.getString("Anmerkungen");
                                if (materialLabel != null && material.isEmpty()) {
                                    remarks = appendRemark(remarks, "Material (ArboDat): " + materialLabel);
                                }
                                for (String line : notMigratedDatingFields(row, datingType)) {
                                    remarks = appendRemark(remarks, line);
                                }
                                newAbsoluteDating.setRemarks(remarks);

                                // Insert the new absolute dating (incl. its sub-dating)
                                newAbsoluteDating = absoluteDatingRepository.save(newAbsoluteDating);
                                absoluteDatingId = newAbsoluteDating.getId();

                                // Dante attributes without match
                                if (materialLabel != null && material.isEmpty()) {
                                    nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("absoluteDating",
                                            absoluteDatingId,
                                            subSample,
                                            "material",
                                            materialLabel));
                                }
                                if (datingMethodLabel != null && datingMethod.isEmpty()) {
                                    nonMatchingDanteAttributeList.add(new NonMatchingDanteAttribute("absoluteDating",
                                            absoluteDatingId,
                                            subSample,
                                            "datingMethod",
                                            datingMethodLabel));
                                }

                                labAndNumberList.add(new LabAndNumberMigration(absoluteDatingId,
                                                                               sampleLabel,
                                                                               subSample,
                                                                               datingType,
                                                                               row.getString("Labornummer"),
                                                                               "",-1,
                                                                               siteLabel,
                                                                               featureLabel));
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
                                        Optional<Material> material = ctx.cachedLookup("materialLabel", materialLabel, materialRepository::findByLabel);
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
                                        Optional<DatingMethod> datingMethod = ctx.cachedLookup("datingMethod", datingMethodUri, datingMethodRepository::findById);
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

                                if ("C14-Datierung".equals(datingMethodLabel)) {
                                    if (matchingAbsoluteDating.getC14Dating() != null
                                            && matchingAbsoluteDating.getC14Dating().getC14Laboratory() == null) {
                                        labAndNumberList.add(new LabAndNumberMigration(absoluteDatingId,
                                                sampleLabel,
                                                subSample,
                                                "c14Dating",
                                                row.getString("Labornummer"),
                                                "",-1,
                                                siteLabel,
                                                featureLabel));
                                    }
                                } else if ("Dendrochronologie".equals(datingMethodLabel)) {
                                    if (matchingAbsoluteDating.getDendrochronologicalDating() != null
                                            && matchingAbsoluteDating.getDendrochronologicalDating().getLaboratory() == null) {
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
                                    if (matchingAbsoluteDating.getOtherDating() != null
                                            && matchingAbsoluteDating.getOtherDating().getLaboratory() == null) {
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


                        String siteLabel = ctx.siteLabelOf(row);

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

                            newResultMigration.setSampleId(sampleId);
                            newResultMigration.setSampleLabel(sampleLabel);
                            newResultMigration.setFeatureId(featureLabelIdMap.get(siteLabel + "_" + featureLabel));
                            newResultMigration.setFeatureLabel(featureLabel);
                            newResultMigration.setSiteLabel(siteLabel);

                            // Set result attributes
                            newResult.setRestCount(row.getInt("rAnzahl"));
                            newResult.setRestWeight(row.getDouble("rGewicht"));
                            newResult.setEstimation(row.getBoolean("geschätzt"));
                            newResult.setRestFragment(row.getInt("rFrag"));
                            newResult.setMultiplier(row.getDouble("Multiplikator"));
                            newResult.setRemarksTaxonomy(row.getString("AnmFrakt"));

                            // Set entry date
                            LocalDateTime localDateTime = row.getLocalDateTime("EDatProb");
                            if (localDateTime != null) {
                                newResult.setEntryDate(Date.from(localDateTime.atZone(ZoneId.systemDefault()).toInstant()));
                            }

                            // Set TaxCode
                            Optional<TaxCode> taxCode = ctx.cachedLookup("taxCodeLabel", taxCodeLabel, taxCodeRepository::findByLabel);
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
                            Optional<StateOfPreservation> stateOfPreservation = ctx.cachedLookup("stateOfPreservation", stateOfPreservationUri, stateOfPreservationRepository::findById);
                            if (stateOfPreservation.isPresent()) {
                                String mappedStateOfPreservationLabel = stateOfPreservation.get().getLabel();
                                newResult.setStateOfPreservation(stateOfPreservation.get());
                            } else {
                                newResultMigration.setNonMatchingStateOfPreservation(stateOfPreservationLabel);
                            }
                            // Set rest type
                            String restTypeLabel = row.getString("RTyp");
                            String restTypeUri = restTypeMapper.getUri(restTypeLabel);
                            Optional<RestType> restType = ctx.cachedLookup("restType", restTypeUri, restTypeRepository::findById);
                            if (restType.isPresent()) {
                                String mappedRestTypeLabel = restType.get().getLabel();
                                newResult.setRestType(restType.get());
                            } else {
                                newResultMigration.setNonMatchingRestType(restTypeLabel);
                            }
                            // Set classificationConfer
                            String classificationConferLabel = row.getString("cf");
                            String classificationConferUri = classificationConferMapper.getUri(classificationConferLabel);
                            Optional<ClassificationConfer> classificationConfer = ctx.cachedLookup("classificationConfer", classificationConferUri, classificationConferRepository::findById);
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
            throw new UncheckedIOException("Could not read 'ArchBotDaten.mdb': " + e.getMessage(), e);
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


    // Value of a numeric ArboDat column, 0 (the default value in ArboDat) counts as not set.
    // Single (FLOAT) values are taken over by their decimal representation (45.083 stays 45.083).
    private static Double nonZeroValue(Row row, String column) {
        Object value = row.get(column);
        if (!(value instanceof Number number) || number.doubleValue() == 0) {
            return null;
        }
        return (value instanceof Float) ? Double.valueOf(value.toString()) : number.doubleValue();
    }

    // Appends a line to the remarks (not twice, e.g. when migrating again)
    private static String appendRemark(String remarks, String addition) {
        if (addition == null || addition.isEmpty()) {
            return remarks;
        }
        if (remarks == null || remarks.isBlank()) {
            return addition;
        }
        if (remarks.contains(addition)) {
            return remarks;
        }
        return remarks + "\n" + addition;
    }

    // TK and Limes of a site (Limes only if true: it's a yes/no field with default 'no' in ArboDat)
    private static String tkAndLimes(Row row) {
        List<String> remarks = new ArrayList<>();
        String tk = row.getString("TK");
        if (tk != null && !tk.isBlank()) {
            remarks.add("TK = " + tk);
        }
        if (Boolean.TRUE.equals(row.get("Limes"))) {
            remarks.add("Limes = true");
        }
        return String.join(", ", remarks);
    }

    // Coordinate of a site without easting and northing: an altitude-only coordinate is set directly, without
    // any coordinate value TK and Limes go to the site remarks.
    // Returns true, if the coordinate has to be completed in the migration (coordinate list).
    private static boolean setSiteCoordinateOrRemarks(Site site, Row row) {
        if (nonZeroValue(row, "rWert") != null || nonZeroValue(row, "hWert") != null) {
            return true;
        }
        String tkAndLimes = tkAndLimes(row);
        Double altitude = nonZeroValue(row, "üNN");
        if (altitude != null) {
            Coordinate coordinate = new Coordinate();
            coordinate.setAltitude(altitude);
            coordinate.setRemarksCoordinate(tkAndLimes.isEmpty() ? null : tkAndLimes);
            site.setCoordinate(coordinate);
        } else {
            site.setRemarksSite(appendRemark(site.getRemarksSite(), tkAndLimes));
        }
        return false;
    }

    // rWert (Rechtswert) is the easting (x -> longitude), hWert (Hochwert) the northing (y -> latitude)
    private static CoordinateMigration siteCoordinateMigration(Row row, UUID siteId, String siteLabel) {
        return new CoordinateMigration("site", siteId, siteLabel,
                nonZeroValue(row, "hWert"), nonZeroValue(row, "rWert"), null, nonZeroValue(row, "üNN"),
                row.getString("KoordSys"), tkAndLimes(row), null, null);
    }

    // Coordinate of a sample without KoordX and KoordY: an altitude-only coordinate is set directly,
    // Prob_üNN has priority, otherwise KoordZ is taken as altitude.
    // Returns true, if the coordinate has to be completed in the migration (coordinate list).
    private static boolean setSampleAltitudeCoordinate(Sample sample, Row row) {
        if (nonZeroValue(row, "KoordX") != null || nonZeroValue(row, "KoordY") != null) {
            return true;
        }
        Double koordZ = nonZeroValue(row, "KoordZ");
        Double altitude = nonZeroValue(row, "Prob_üNN");
        if (koordZ == null && altitude == null) {
            return false;
        }
        Coordinate coordinate = new Coordinate();
        if (altitude != null) {
            coordinate.setAltitude(altitude);
            if (koordZ != null) {
                coordinate.setRemarksCoordinate("KoordZ = " + koordZ);
            }
        } else {
            coordinate.setAltitude(koordZ);
            coordinate.setRemarksCoordinate("altitude taken from KoordZ");
        }
        sample.setCoordinate(coordinate);
        return false;
    }

    private static CoordinateMigration sampleCoordinateMigration(Row row, UUID sampleId, String sampleLabel,
                                                                 String siteLabel, String featureLabel) {
        return new CoordinateMigration("sample", sampleId, sampleLabel,
                nonZeroValue(row, "KoordY"), nonZeroValue(row, "KoordX"), nonZeroValue(row, "KoordZ"),
                nonZeroValue(row, "Prob_üNN"), "", "", siteLabel, featureLabel);
    }

    // Fields of the ArboDat dating, which are only taken over for one dating method
    private static final Map<String, List<String>> DATING_FIELDS_BY_TYPE = Map.of(
            "c14Dating", List.of("C14-Alter BP", "Standardab C14", "C14 cal", "13C PDB-Wert",
                                 "Standardab 13C PDB", "pMC-Wert", "Standardab PMC"),
            "dendroDating", List.of("Dendroalter", "Waldkante"),
            "otherDating", List.of("Alter andere"));

    // Non-empty fields of other dating methods than the one taken over, as remark lines
    private static List<String> notMigratedDatingFields(Row row, String datingType) {
        List<String> lines = new ArrayList<>();
        DATING_FIELDS_BY_TYPE.entrySet().stream()
                .filter(entry -> !entry.getKey().equals(datingType))
                .sorted(Map.Entry.comparingByKey())
                .flatMap(entry -> entry.getValue().stream())
                .forEach(column -> {
                    Object value = row.get(column);
                    boolean empty = value == null
                            || (value instanceof String text && text.isBlank())
                            || (value instanceof Number number && number.doubleValue() == 0)
                            || Boolean.FALSE.equals(value);
                    if (!empty) {
                        lines.add(column + " (ArboDat): " + value);
                    }
                });
        return lines;
    }

    private boolean isAddressEmpty(Address address) {
        return (address.getCountry() == null || address.getCountry().isEmpty()) &&
                (address.getCounty() == null || address.getCounty().isEmpty()) &&
                (address.getDistrict() == null || address.getDistrict().isEmpty()) &&
                (address.getTown() == null || address.getTown().isEmpty()) &&
                (address.getStreet_or_place() == null || address.getStreet_or_place().isEmpty());
    }
}