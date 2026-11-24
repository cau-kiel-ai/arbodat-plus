package arbodat.plus;

import arbodat.plus.model.*;
import jakarta.persistence.EntityManager;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

/**
 * Test data with every exported field filled, persisted through JPA as the app does.
 * Covers: a site under two research projects, a site without one, every dating kind, results
 * linked to datings, and shared records that nothing references.
 */
public final class Fixtures {

    private Fixtures() {}

    public record Full(UUID rpA, UUID rpB, UUID site1, UUID orphanSite, UUID feature1, UUID sample1,
                       UUID adC14, UUID adDendro, UUID adOther, UUID result1, UUID result2,
                       UUID user1, UUID unreferencedUser, UUID literature1) {}

    public static Full full(EntityManager em) {
        // Lookups ---------------------------------------------------------------------------------
        License license = lookup(em, new License(), "https://example.org/license/cc-by");
        license.setLabel("CC BY 4.0");
        Taxonomy taxonomy = lookup(em, new Taxonomy(), "http://uri.gbv.de/terminology/arbodat_taxonomy/1");
        taxonomy.setLabel("Archaeobotany");
        SiteType siteTypeA = siteType(em, "http://uri.gbv.de/terminology/arbodat_site_type/settlement", "Settlement");
        SiteType siteTypeB = siteType(em, "http://uri.gbv.de/terminology/arbodat_site_type/burial", "Burial");
        NaturalUnit naturalUnit = lookup(em, new NaturalUnit(), "http://uri.gbv.de/terminology/arbodat_natural_unit/1");
        naturalUnit.setLabel("Floodplain");
        naturalUnit.setLabelDe("Aue");
        naturalUnit.setLabelFr("Plaine");
        naturalUnit.setNaturalMainGroup("Lowland");
        PreservationCondition preservation = lookup(em, new PreservationCondition(), "http://uri.gbv.de/terminology/arbodat_preservation_condition/1");
        preservation.setLabel("charred");
        preservation.setLabelDe("verkohlt");
        preservation.setLabelFr("carbonisé");
        FeatureType featureType = lookup(em, new FeatureType(), "http://uri.gbv.de/terminology/arbodat_feature_type/pit");
        featureType.setLabel("Pit");
        featureType.setLabelDe("Grube");
        featureType.setLabelFr("Fosse");
        SampleType sampleType = lookup(em, new SampleType(), "http://uri.gbv.de/terminology/arbodat_sample_type/bulk");
        sampleType.setLabel("Bulk");
        sampleType.setLabelDe("Volumen");
        sampleType.setLabelFr("Vrac");
        SampleInvestigated investigated = lookup(em, new SampleInvestigated(), "http://uri.gbv.de/terminology/arbodat_sample_investigated/yes");
        investigated.setLabel("yes");
        investigated.setLabelDe("ja");
        investigated.setLabelFr("oui");
        Chronozone chronozone = lookup(em, new Chronozone(), "http://uri.gbv.de/terminology/arbodat_chronozone/subboreal");
        chronozone.setLabel("Subboreal");
        Material material = lookup(em, new Material(), "http://uri.gbv.de/terminology/arbodat_dated_material/charcoal");
        material.setLabel("Charcoal");
        DatingMethod datingMethod = lookup(em, new DatingMethod(), "http://uri.gbv.de/terminology/arbodat_dating_method/c14");
        datingMethod.setLabel("C14");
        datingMethod.setLabelDe("C14");
        datingMethod.setLabelFr("C14");
        C14Laboratory c14Lab = lookup(em, new C14Laboratory(), "http://uri.gbv.de/terminology/nihk_c14_laboratory/kia");
        c14Lab.setLabel("Kiel");
        c14Lab.setNotation("KIA");
        CoordinateSystem coordinateSystem = lookup(em, new CoordinateSystem(), "http://uri.gbv.de/terminology/arbodat_coordinate_reference_system/4326");
        coordinateSystem.setLabel("WGS 84");
        coordinateSystem.setEpsg("4326");
        StateOfPreservation stateOfPreservation = lookup(em, new StateOfPreservation(), "http://uri.gbv.de/terminology/arbodat_result_condition/charred");
        stateOfPreservation.setLabel("charred");
        stateOfPreservation.setLabelDe("verkohlt");
        stateOfPreservation.setLabelFr("carbonisé");
        ClassificationConfer cf = lookup(em, new ClassificationConfer(), "http://uri.gbv.de/terminology/arbodat_classification_confer/cf");
        cf.setLabel("cf.");
        cf.setLabelDe("cf.");
        cf.setLabelFr("cf.");
        TaxCode taxCode = lookup(em, new TaxCode(), "http://uri.gbv.de/terminology/arbodat_taxonomy/triticum");
        taxCode.setLabel("Triticum");
        taxCode.setLabelDe("Weizen");
        taxCode.setLabelEn("Wheat");
        taxCode.setLabelFr("Blé");
        taxCode.setLabelIt("Frumento");
        taxCode.setTaxonomy("Poaceae");
        RestType restType = lookup(em, new RestType(), "http://uri.gbv.de/terminology/arbodat_rest_type/grain");
        restType.setLabel("grain");
        restType.setLabelDe("Korn");
        restType.setLabelFr("grain");
        restType.setStructuralConcept("seed");

        // Shared records --------------------------------------------------------------------------
        Institution institution = new Institution();
        institution.setLabel("Kiel University");
        institution.setRorId("https://ror.org/04v76ef78");
        em.persist(institution);
        Institution unreferencedInstitution = new Institution();
        unreferencedInstitution.setLabel("Unused Institute");
        em.persist(unreferencedInstitution);

        User user = new User();
        user.setFirstName("Anna");
        user.setMiddleName("M.");
        user.setLastName("Müller");
        user.setMailAddress("anna@example.org");
        user.setOrcid("0000-0002-1825-0097");
        user.setInstitutionList(new HashSet<>(Set.of(institution)));
        em.persist(user);
        User unreferencedUser = new User();
        unreferencedUser.setFirstName("Ben");
        unreferencedUser.setLastName("Unused");
        em.persist(unreferencedUser);

        Author authorA = author(em, "Ada", "Lovelace");
        Author authorB = author(em, "Charles", "Babbage");
        Author unreferencedAuthor = author(em, "Nobody", "Unused");

        Literature literature = new Literature();
        literature.setTitle("Charred grain from Haithabu");
        literature.setPublicationYear(1999);
        literature.setDoi("10.1000/xyz123");
        literature.setShortCitation("Lovelace 1999");
        literature.setLongCitation("Lovelace, A. & Babbage, C. (1999): Charred grain from Haithabu.");
        literature.setLitAbstract("An abstract.");
        literature.setAuthorList(new HashSet<>(Set.of(authorA, authorB)));
        em.persist(literature);
        Literature unreferencedLiterature = new Literature();
        unreferencedLiterature.setTitle("Unused book");
        unreferencedLiterature.setAuthorList(new HashSet<>(Set.of(unreferencedAuthor)));
        em.persist(unreferencedLiterature);

        Laboratory laboratory = new Laboratory();
        laboratory.setLabel("Dendro Lab Hamburg");
        em.persist(laboratory);
        Laboratory unreferencedLaboratory = new Laboratory();
        unreferencedLaboratory.setLabel("Unused Lab");
        em.persist(unreferencedLaboratory);

        // Research projects -----------------------------------------------------------------------
        ResearchProject rpA = new ResearchProject();
        rpA.setProjectName("Project A");
        rpA.setFunder("DFG");
        rpA.setAuthorisationNumber("AZ-1");
        rpA.setLicense(license);
        em.persist(rpA);
        ResearchProject rpB = new ResearchProject();
        rpB.setProjectName("Project B");
        em.persist(rpB);

        // Sites -----------------------------------------------------------------------------------
        Site site = new Site();
        site.setLabel("Haithabu");
        site.setActivityNumbers(new ArrayList<>(List.of("AN-1", "AN-2")));
        site.setLabelAbbreviation("HH");
        site.setSiteNumber("SN-42");
        site.setTaxonomy(taxonomy);
        site.setSiteTypeList(new HashSet<>(Set.of(siteTypeA, siteTypeB)));
        site.setSiteTypeUncertain(true);
        site.setNaturalUnit(naturalUnit);
        site.setUndisturbed(false);
        site.setInstitutionList(new HashSet<>(Set.of(institution)));
        site.setSiteDirectors(new HashSet<>(Set.of(user)));
        site.setArchaeologists(new HashSet<>(Set.of(user)));
        site.setBotanists(new HashSet<>());
        site.setCoordinate(coordinate(coordinateSystem, 9.56, 54.49));
        Address address = new Address();
        address.setCountry("Germany");
        address.setCounty("Schleswig-Holstein");
        address.setDistrict("Schleswig-Flensburg");
        address.setParish("Busdorf");
        address.setTown("Busdorf");
        address.setStreet_or_place("Haddebyer Noor");
        site.setAddress(address);
        site.setRemarksSite("Viking age trading place");
        site.setResearchProjectList(new HashSet<>(Set.of(rpA, rpB)));
        em.persist(site);

        Site orphanSite = new Site();
        orphanSite.setLabel("Orphan site");
        orphanSite.setSiteTypeList(new HashSet<>());
        orphanSite.setInstitutionList(new HashSet<>());
        orphanSite.setSiteDirectors(new HashSet<>());
        orphanSite.setArchaeologists(new HashSet<>());
        orphanSite.setBotanists(new HashSet<>());
        em.persist(orphanSite);

        literature.setSiteList(new HashSet<>(Set.of(site)));

        // Features and samples --------------------------------------------------------------------
        Feature feature = new Feature();
        feature.setSite(site);
        feature.setLabel("Pit 7");
        feature.setExcavationYears(new ArrayList<>(List.of(1998, 1999)));
        feature.setExcavationArea("Area 3");
        feature.setBuildingContext(true);
        feature.setBuildingContextDescription("Inside house 2");
        feature.setFeatureCondition(true);
        feature.setRemarksFeature("Well preserved");
        feature.setPreservationCondition(preservation);
        feature.setFeatureType(featureType);
        em.persist(feature);

        Feature orphanSiteFeature = new Feature();
        orphanSiteFeature.setSite(orphanSite);
        orphanSiteFeature.setLabel("Orphan feature");
        em.persist(orphanSiteFeature);
        Sample orphanSiteSample = new Sample();
        orphanSiteSample.setFeature(orphanSiteFeature);
        orphanSiteSample.setLabel("Orphan sample");
        orphanSiteSample.setBotanicalDeterminationBy(new HashSet<>());
        em.persist(orphanSiteSample);

        Sample sample = new Sample();
        sample.setFeature(feature);
        sample.setLabel("S-1");
        sample.setStratum("III");
        sample.setLayer("4");
        sample.setSector("B");
        sample.setPlanum("2");
        sample.setDepthFrom(1.25);
        sample.setDepthTo(1.5);
        sample.setCoordinate(coordinate(coordinateSystem, 9.561, 54.491));
        sample.setBotanicalDeterminationBy(new HashSet<>(Set.of(user)));
        sample.setBotanicalDeterminationYear("2001");
        sample.setSampleType(sampleType);
        sample.setSampleStorage(true);
        sample.setMicroRemain(false);
        sample.setSeedsAndFruits(investigated);
        sample.setWoodSubfossile(investigated);
        sample.setCharcoalInvestigated(investigated);
        sample.setTotalWeight(12.5);
        sample.setWeightUndetermined(0.75);
        sample.setSampleVolume(10.0);
        sample.setVolumeDetermination("dry");
        sample.setChronozone(chronozone);
        sample.setArchaeologicalDating("Viking age");
        sample.setCulturalGroup("Norse");
        sample.setAbsoluteDatingFrom(800);
        sample.setAbsoluteDatingTo(1050);
        sample.setRemarksSample("Sample remarks");
        em.persist(sample);

        FractionAnalyzed fraction = new FractionAnalyzed();
        fraction.setSample(sample);
        fraction.setFractionAnalyzed("all");
        fraction.setOrgOrMin("org");
        fraction.setSieveSize(0.5);
        fraction.setStandardMultiplier(1.0);
        em.persist(fraction);
        sample.setFractionAnalyzedList(new HashSet<>(Set.of(fraction)));

        // Absolute datings ------------------------------------------------------------------------
        C14Dating c14 = new C14Dating();
        c14.setC14Laboratory(c14Lab);
        c14.setNumber("KIA-1234");
        c14.setC14AgeBp(1100);
        c14.setC14StdDev(30);
        c14.setC14CalibrationBcAd2s("880-990 AD");
        c14.setDeltaC13(-24.5);
        c14.setDeltaC13Uncertainty(0.2);
        c14.setPmc(87.1);
        c14.setPmcUncertainty(0.3);
        AbsoluteDating adC14 = absoluteDating(em, sample, "a", material, datingMethod);
        adC14.setC14Dating(c14);

        DendrochronologicalDating dendro = new DendrochronologicalDating();
        dendro.setLaboratory(laboratory);
        dendro.setNumber("D-7");
        dendro.setDendrochronologicalAge("950 AD");
        dendro.setWaneyEdge(true);
        AbsoluteDating adDendro = absoluteDating(em, sample, "b", material, datingMethod);
        adDendro.setDendrochronologicalDating(dendro);

        OtherDating other = new OtherDating();
        other.setLaboratory(laboratory);
        other.setNumber("O-1");
        other.setAgeDivers("OSL 1000 ± 50");
        AbsoluteDating adOther = absoluteDating(em, sample, "c", null, null);
        adOther.setOtherDating(other);

        literature.setAbsoluteDatingList(new HashSet<>(Set.of(adC14)));

        // Results ---------------------------------------------------------------------------------
        Result result1 = new Result();
        result1.setSample(sample);
        result1.setEntryDate(Timestamp.from(Instant.parse("2024-05-01T10:15:30.123Z")));
        result1.setFractionAnalyzed("all");
        result1.setOrgOrMin("org");
        result1.setSieveSize(0.5);
        result1.setMultiplier(2.0);
        result1.setRestCount(12);
        result1.setRestFragment(3);
        result1.setRestWeight(0.42);
        result1.setEstimation(false);
        result1.setTaxCode(taxCode);
        result1.setClassificationConfer(cf);
        result1.setRestType(restType);
        result1.setStateOfPreservation(stateOfPreservation);
        result1.setRemarksTaxonomy("Taxonomy remarks");
        result1.setAbsoluteDatingList(new HashSet<>(Set.of(adC14, adDendro)));
        em.persist(result1);

        // A result whose natural key has nulls (no cf, no rest type, no state of preservation).
        Result result2 = new Result();
        result2.setSample(sample);
        result2.setTaxCode(taxCode);
        result2.setOrgOrMin("min");
        result2.setRestCount(1);
        em.persist(result2);

        em.flush();
        return new Full(rpA.getId(), rpB.getId(), site.getId(), orphanSite.getId(), feature.getId(), sample.getId(),
                adC14.getId(), adDendro.getId(), adOther.getId(), result1.getId(), result2.getId(),
                user.getId(), unreferencedUser.getId(), literature.getId());
    }

    private static <L> L lookup(EntityManager em, L entity, String uri) {
        try {
            entity.getClass().getMethod("setId", String.class).invoke(entity, uri);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
        em.persist(entity);
        return entity;
    }

    private static SiteType siteType(EntityManager em, String uri, String label) {
        SiteType siteType = lookup(em, new SiteType(), uri);
        siteType.setLabel(label);
        siteType.setLabelDe(label + " (de)");
        siteType.setLabelFr(label + " (fr)");
        siteType.setStructuralConcept("Concept");
        return siteType;
    }

    private static Author author(EntityManager em, String firstName, String lastName) {
        Author author = new Author();
        author.setFirstName(firstName);
        author.setMiddleName("X.");
        author.setLastName(lastName);
        em.persist(author);
        return author;
    }

    private static Coordinate coordinate(CoordinateSystem coordinateSystem, double lon, double lat) {
        Coordinate coordinate = new Coordinate();
        coordinate.setCoordinateSystem(coordinateSystem);
        coordinate.setLongitude(lon);
        coordinate.setLatitude(lat);
        coordinate.setAltitude(3.0);
        coordinate.setLongitudeWgs84(lon);
        coordinate.setLatitudeWgs84(lat);
        coordinate.setRemarksCoordinate("GPS");
        return coordinate;
    }

    private static AbsoluteDating absoluteDating(EntityManager em, Sample sample, String subSample,
                                                 Material material, DatingMethod datingMethod) {
        AbsoluteDating ad = new AbsoluteDating();
        ad.setSample(sample);
        ad.setSubSample(subSample);
        ad.setRemarks("Dating " + subSample);
        ad.setMaterial(material);
        ad.setDatingMethod(datingMethod);
        em.persist(ad);
        return ad;
    }
}
