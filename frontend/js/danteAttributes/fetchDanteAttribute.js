
// researchProject ------------------------
let cachedLicenses = [];
let cachedLicenses_loaded = false;

// site -----------------------------------
let cachedTaxonomies = [];
let cachedTaxonomies_loaded = false;

let cachedSiteTypes = [];
let cachedSiteTypes_loaded = false;

let cachedNaturalUnits = [];
let cachedNaturalUnits_loaded = false;

// coordinate -----------------------------
let cachedCoordinateSystems = [];
let cachedCoordinateSystems_loaded = false;

// feature --------------------------------
let cachedFeatureTypes = [];
let cachedFeatureTypes_loaded = false;

let cachedPreservationConditions = [];
let cachedPreservationConditions_loaded = false;

// sample ---------------------------------
let cachedSampleTypes = [];
let cachedSampleTypes_loaded = false;

let cachedChronozones = [];
let cachedChronozones_loaded = false;

let cachedSampleInvestigated = [];
let cachedSampleInvestigated_loaded = false;

// absoluteDating -------------------------
let cachedMaterials = [];
let cachedMaterials_loaded = false;

let cachedDatingMethods = [];
let cachedDatingMethods_loaded = false;

// C14Dating ------------------------------
let cachedC14Laboratories = [];
let cachedC14Laboratories_loaded = false;

// result ---------------------------------
let cachedStateOfPreservation = [];
let cachedStateOfPreservation_loaded = false;

let cachedRestTypes = [];
let cachedRestTypes_loaded = false;

let cachedClassificationConfers = [];
let cachedClassificationConfers_loaded = false;

let cachedTaxCodesForURI = new Map(); //   Key       value
                                      // {"uri" => [taxCodes]}
// ----------------------------------------


async function fetchDanteAttribute(attribute) {

    // Set URL based on attribute if (attribute_loaded == false)
    //                            else return
    let url = "";
    switch (attribute) {

        // researchProject --------------------------
        case ("license"):
            if (cachedLicenses_loaded == false) {
                url = "https://api.dante.gbv.de/voc/license/top?properties=narrower,notation"
                break;
            } else {
                return;
            }

        // site -------------------------------------
        case "taxonomy":
            if (cachedTaxonomies_loaded == false) {
                url = "https://api.dante.gbv.de/voc/arbodat_taxonomy/top"
                break;
            } else {
                return;
            }

        case ("siteType"):
            if (cachedSiteTypes_loaded == false) {
                url = "https://api.dante.gbv.de/search?voc=arbodat_site_type&query=*&properties=ancestors,altLabel";
                break;
            } else {
                return;
            }

        case "naturalUnit":
            if (cachedNaturalUnits_loaded == false) {
                url = "https://api.dante.gbv.de/search?voc=arbodat_natural_unit&query=*&properties=ancestors,altLabel";
                break;
            } else {
                return;
            }

        // coordinate -------------------------------
        case "coordinateSystem":
            if (cachedCoordinateSystems_loaded == false) {
                url = "https://api.dante.gbv.de/voc/arbodat_coordinate_reference_system/top?properties=narrower,notation";
                break;
            } else {
                return;
            }

        // feature --------------------------------------
        case ("featureType"):
            if (cachedFeatureTypes_loaded == false) {
                url = "https://api.dante.gbv.de/voc/arbodat_feature_type/top?properties=narrower,altLabel";
                break;
            } else {
                return;
            }

        case ("preservationCondition"):
            if (cachedPreservationConditions_loaded == false) {
                url = "https://api.dante.gbv.de/voc/arbodat_preservation_condition/top?properties=narrower,altLabel";
                break;
            } else {
                return;
            }

        // sample ---------------------------------------
        case ("sampleType"):
            if (cachedSampleTypes_loaded == false) {
                url = "https://api.dante.gbv.de/voc/arbodat_sample_type/top?properties=narrower,altLabel";
                break;
            } else {
                return;
            }

        case ("chronozone"):
            if (cachedChronozones_loaded == false) {                
                url = "https://api.dante.gbv.de/voc/arbodat_chronozone/top?properties=narrower";
                break;
            } else {
                return;
            }

        // sampleInvestigated
        case ("sampleInvestigated"):
        case ("seedsAndFruits"):
        case ("charcoalInvestigated"):
        case ("woodSubfossile"):
            if (cachedSampleInvestigated_loaded == false) {
                url = "https://api.dante.gbv.de/voc/arbodat_sample_investigated/top?properties=narrower,altLabel";
                break;
            } else {
                return;
            }

        // absoluteDating -------------------------------
        case ("material"):
            if (cachedMaterials_loaded == false) {
                url = "https://api.dante.gbv.de/voc/arbodat_dated_material/top?properties=narrower";
                break;
            } else {
                return;
            }

        case ("datingMethod"):
            if (cachedDatingMethods_loaded == false) {
                url = "https://api.dante.gbv.de/voc/arbodat_dating_method/top?properties=narrower,altLabel";
                break;
            } else {
                return;
            }

        // C14Dating ------------------------------------
        case "c14Laboratory":
            if (cachedC14Laboratories_loaded == false) {
                url = "https://api.dante.gbv.de/voc/nihk_c14_laboratory/top?properties=notation,narrower";
                break;
            } else {
                return;
            }

        // result ---------------------------------------
        case ("stateOfPreservation"):
            if (cachedStateOfPreservation_loaded == false) {
                url = "https://api.dante.gbv.de/voc/arbodat_result_condition/top?properties=narrower,altLabel";
                break;
            } else {
                return;
            }

        case ("restType"):
            if (cachedRestTypes_loaded == false) {
                url = "https://api.dante.gbv.de/search?voc=arbodat_rest_type&query=*&properties=ancestors,altLabel";
                break;
            } else {
                return;
            }

        case ("classificationConfer"):
            if (cachedClassificationConfers_loaded == false) {
                url = "https://api.dante.gbv.de/voc/arbodat_classification_confer/top?properties=narrower,altLabel";
                break;
            } else {
                return;
            }
        // ----------------------------------------------
                    
        default:
            console.error("Unknown attribute");
            return;
    }

    // Send GET request and cache vocabulary of attribute
    try {        
        const response = await axios.get(url);

        // - Cache Atributes
        // - add local entries
        // - remove rejected entries
        // - set 'attribute_loaded' = true
        switch (attribute) {

            // research project -------------------------
            case ("license"):
                cachedLicenses = response.data;
                cachedLicenses_loaded = true;
                break;
            
            // site -------------------------------------
            case "taxonomy":
                cachedTaxonomies = response.data;
                cachedTaxonomies_loaded = true;
                break;  

            case ("siteType"):
                // Remove rejected entries ------------------------------------
                cachedSiteTypes = response.data.filter(entry =>
                    // not chosen
                    entry.uri !== "http://uri.gbv.de/terminology/arbodat_site_type/5a73f09f-7e21-4746-84c0-336ab0669f90" &&
                    // unknown
                    entry.uri !== "http://uri.gbv.de/terminology/arbodat_site_type/a1b9947c-431f-42cb-964c-4245f5280251"
                );

                // Add local entries ------------------------------------------
                unknown_entry =   {
                    uri: "ArboDat+_siteType_unknown",
                    prefLabel: {en: "unknown type of site"},
                    altLabel: {
                        de: ["Fundstellentyp unbekannt"],
                        fr: ["Type de site inconnu"]
                    },
                    type: ["http://www.w3.org/2004/02/skos/core#Concept"]
                }
                notChosen_entry =   {
                    uri: "ArboDat+_siteType_notChosen",
                    prefLabel: {en: "not chosen"},
                    altLabel: {
                        de: ["nicht gewählt"],
                        fr: ["Non Choisi"]
                    },
                    type: ["http://www.w3.org/2004/02/skos/core#Concept"]
                }
                otherAnthropogenicDeposit_entry =   {
                    uri: "ArboDat+_siteType_otherAnthropogenicDeposit",
                    prefLabel: {en: "other anthropogenic deposit"},
                    altLabel: {
                        de: ["sonstige anthropogene Ablagerung"],
                        fr: ["Autres dépôts anthropogènes"]
                    },
                    type: ["http://www.w3.org/2004/02/skos/core#Concept"]
                }
                otherNaturalSediment_entry =   {
                    uri: "ArboDat+_siteType_otherNaturalSediment",
                    prefLabel: {en: "other natural sediment"},
                    altLabel: {
                        de: ["sonstige natürliche Ablagerung"],
                        fr: ["Autres dépôts naturels"]
                    },
                    type: ["http://www.w3.org/2004/02/skos/core#Concept"]
                }
                otherRuralSetting_entry =   {
                    uri: "ArboDat+_siteType_otherRuralSetting",
                    prefLabel: {en: "other rural setting"},
                    altLabel: {
                        de: ["sonstige ländliche Einrichtung"],
                        fr: ["Autre établissement rural"]
                    },
                    type: ["http://www.w3.org/2004/02/skos/core#Concept"]
                }
                otherSettlement_entry =   {
                    uri: "ArboDat+_siteType_otherSettlement",
                    prefLabel: {en: "other settlement"},
                    altLabel: {
                        de: ["sonstige Siedlung"],
                        fr: ["Autre habitat de plein air"]
                    },
                    type: ["http://www.w3.org/2004/02/skos/core#Concept"]
                }
                otherPlaceOfCult_entry =   {
                    uri: "ArboDat+_siteType_otherPlaceOfCult",
                    prefLabel: {en: "other place of cult"},
                    altLabel: {
                        de: ["sonstiger Kultplatz (inkl. Brandopferplatz)"],
                        fr: ["Autre endroit ou lieu de culte"]
                    },
                    type: ["http://www.w3.org/2004/02/skos/core#Concept"]
                }

                cachedSiteTypes.push(unknown_entry);
                cachedSiteTypes.push(notChosen_entry);
                cachedSiteTypes.push(otherAnthropogenicDeposit_entry);
                cachedSiteTypes.push(otherNaturalSediment_entry);
                cachedSiteTypes.push(otherRuralSetting_entry);
                cachedSiteTypes.push(otherSettlement_entry);
                cachedSiteTypes.push(otherPlaceOfCult_entry);
                // ------------------------------------------------------------

                cachedSiteTypes_loaded = true;
                break;

            case "naturalUnit":
                cachedNaturalUnits = response.data;

                // Add local entries ------------------------------------------
                unknown_entry =   {
                                    uri: "ArboDat+_naturalUnit_unknown",
                                    prefLabel: { zxx: "unknown" },
                                    altLabel: { zxx: [
                                        "unbekannt",
                                        "Inconnu"
                                    ]},
                                    type: [ "http://www.w3.org/2004/02/skos/core#Concept" ]
                                  }
                notChosen_entry = {
                                    uri: "ArboDat+_naturalUnit_notChosen",
                                    prefLabel: { zxx: "not chosen" },
                                    altLabel: { zxx: [
                                        "nicht gewählt",
                                        "Non Choisi"                                        
                                    ]},
                                    type: [ "http://www.w3.org/2004/02/skos/core#Concept" ]
                                   }

                cachedNaturalUnits.push(unknown_entry);
                cachedNaturalUnits.push(notChosen_entry);
                // ------------------------------------------------------------

                cachedNaturalUnits_loaded = true;
                break;

            // coordinate -------------------------------
            case "coordinateSystem":
                cachedCoordinateSystems = response.data;
                cachedCoordinateSystems_loaded = true;
                break;
            
            // feature ----------------------------------
            case ("featureType"):
                cachedFeatureTypes = response.data;

                // Add local entries ------------------------------------------
                unknown_entry =   {
                                    uri:       "ArboDat+_featureType_unknown",
                                    prefLabel: {en: "unknown type of feature"},
                                    altLabel: {
                                        de: ["Befundtyp unbekannt"],
                                        fr: ["Contexte inconnu"]
                                    },
                                    type: ["http://www.w3.org/2004/02/skos/core#Concept"]
                                   }
                notChosen_entry = {
                                    uri:       "ArboDat+_featureType_notChosen",
                                    prefLabel: {en: "not chosen"},
                                    altLabel: {
                                        de: ["nicht gewählt"],
                                        fr: ["Non Choisi"]
                                    },
                                    type: ["http://www.w3.org/2004/02/skos/core#Concept"]
                                   }
                otherTypeOfFeature_entry =   {
                                    uri:       "ArboDat+_featureType_otherTypeOfFeature",
                                    prefLabel: {en: "other type of feature"},
                                    altLabel: {
                                        de: ["sonstiger Befundtyp"],
                                        fr: ["Autre type de contexte"]
                                    },
                                    type: ["http://www.w3.org/2004/02/skos/core#Concept"]
                                   }
                otherRitualFeature_entry = {
                                    uri:       "ArboDat+_featureType_otherRitualFeature",
                                    prefLabel: {en: "other ritual feature"},
                                    altLabel: {
                                        de: ["sonstiger ritueller Befund"],
                                        fr: ["Autre contexte rituel/culte"]
                                    },
                                    type: ["http://www.w3.org/2004/02/skos/core#Concept"]
                                   }

                cachedFeatureTypes.push(unknown_entry);
                cachedFeatureTypes.push(notChosen_entry);
                cachedFeatureTypes.push(otherTypeOfFeature_entry);
                cachedFeatureTypes.push(otherRitualFeature_entry);
                // ------------------------------------------------------------

                cachedFeatureTypes_loaded = true;
                break;

            case ("preservationCondition"):
                cachedPreservationConditions = response.data;
                cachedPreservationConditions_loaded = true;
                break;
            
            // sample -----------------------------------
            case ("sampleType"):
                cachedSampleTypes = response.data;

                // Add local entries ------------------------------------------
                unknown_entry =   {
                                    uri:       "ArboDat+_sampleType_unknown",
                                    prefLabel: {en: "unknown"},
                                    altLabel: {
                                        de: ["unbekannt"],
                                        fr: ["Inconnu"]
                                    },
                                    type: ["http://www.w3.org/2004/02/skos/core#Concept"]
                                   }
                others_entry = {
                                    uri:       "ArboDat+_sampleType_others",
                                    prefLabel: {en: "others"},
                                    altLabel: {
                                        de: ["Sonstiges"],
                                        fr: ["Autres"]
                                    },
                                    type: ["http://www.w3.org/2004/02/skos/core#Concept"]
                                   }

                cachedSampleTypes.push(unknown_entry);
                cachedSampleTypes.push(others_entry);
                // ------------------------------------------------------------

                cachedSampleTypes_loaded = true;
                break;

            case ("chronozone"):
                cachedChronozones = response.data;

                // Add local entries ------------------------------------------
                unknown_entry =   {
                                    uri:       "ArboDat+_chronozone_unknown",
                                    prefLabel: {en: "Chronozone unknown"},
                                    altLabel: {
                                        de: ["unbekannt"],
                                        fr: ["Inconnu"]
                                    },
                                    type: ["http://www.w3.org/2004/02/skos/core#Concept"]
                                   }
                notChosen_entry = {
                                    uri:       "ArboDat+_chronozone_notChosen",
                                    prefLabel: {en: "not chosen"},
                                    type: ["http://www.w3.org/2004/02/skos/core#Concept"]
                                   }

                cachedChronozones.push(unknown_entry);
                cachedChronozones.push(notChosen_entry);
                // ------------------------------------------------------------

                cachedChronozones_loaded = true;
                break;

            // sampleInvestigated
            case ("sampleInvestigated"):
            case ("seedsAndFruits"):
            case ("charcoalInvestigated"):
            case ("woodSubfossile"):
                cachedSampleInvestigated = response.data;

                // Add local entries ------------------------------------------
                unknown_entry =   {
                                    uri:       "ArboDat+_sampleInvestigated_unknown",
                                    prefLabel: {en: "unknown"},
                                    altLabel: {
                                        de: ["unbekannt"],
                                        // fr: ["Inconnu"]
                                    },
                                    type: ["http://www.w3.org/2004/02/skos/core#Concept"]
                                   }

                cachedSampleInvestigated.push(unknown_entry);
                // ------------------------------------------------------------

                cachedSampleInvestigated_loaded = true;
                break;
            
            // absoluteDating ---------------------------
            case ("material"):
                cachedMaterials = response.data;
                cachedMaterials_loaded = true;
                break;

            case ("datingMethod"):
                cachedDatingMethods = response.data;

                // Add local entries ------------------------------------------
                unknown_entry =   {
                                    uri:       "ArboDat+_datingMethod_unknown",
                                    prefLabel: {en: "unknown"},
                                    altLabel: {
                                        de: ["unbekannt"],
                                        fr: ["inconnu"]
                                    },
                                    type: ["http://www.w3.org/2004/02/skos/core#Concept"]
                                   }
                other_entry = {
                                    uri:       "ArboDat+_datingMethod_other",
                                    prefLabel: {en: "other"},
                                    altLabel: {
                                        de: ["sonstige"],
                                        fr: ["autre"]
                                    },
                                    type: ["http://www.w3.org/2004/02/skos/core#Concept"]
                                   }

                cachedDatingMethods.push(unknown_entry);
                cachedDatingMethods.push(other_entry);
                // ------------------------------------------------------------

                cachedDatingMethods_loaded = true;
                break;

            // C14Dating --------------------------------            
            case "c14Laboratory":
                cachedC14Laboratories = response.data;
                cachedC14Laboratories_loaded = true;
                break;

            // result -----------------------------------
            case ("stateOfPreservation"):
                cachedStateOfPreservation = response.data;

                // Add local entries ------------------------------------------
                unknown_entry =   {
                                    uri:       "ArboDat+_stateOfPreservation_unknown",
                                    prefLabel: {en: "unknown"},
                                    altLabel: {
                                        de: ["unbekannt"],
                                        fr: ["inconnu"]
                                    },
                                    type: ["http://www.w3.org/2004/02/skos/core#Concept"]
                                   }
                notChosen_entry = {
                                    uri:       "ArboDat+_stateOfPreservation_notChosen",
                                    prefLabel: {en: "not chosen"},
                                    altLabel: {
                                        de: ["nicht gewählt"],
                                        fr: ["Non Choisi"]
                                    },
                                    type: ["http://www.w3.org/2004/02/skos/core#Concept"]
                                   }

                cachedStateOfPreservation.push(unknown_entry);
                cachedStateOfPreservation.push(notChosen_entry);
                // ------------------------------------------------------------

                cachedStateOfPreservation_loaded = true;
                break;

            case ("restType"):
                cachedRestTypes = response.data;
                
                // Add local entries ------------------------------------------
                unknown_entry =   {
                    uri: "ArboDat+_restType_unknown",
                    prefLabel: {en: "unknown"},
                    altLabel: {
                        de: ["unbekannt"],
                        fr: ["inconnu"]
                    },
                    type: ["http://www.w3.org/2004/02/skos/core#Concept"]
                }
                notChosen_entry =   {
                    uri: "ArboDat+_restType_notChosen",
                    prefLabel: {en: "not chosen"},
                    altLabel: {
                        de: ["nicht gewählt"],
                        fr: ["Non Choisi"]
                    },
                    type: ["http://www.w3.org/2004/02/skos/core#Concept"]
                }

                cachedRestTypes.push(unknown_entry);
                cachedRestTypes.push(notChosen_entry);
                // ------------------------------------------------------------

                cachedRestTypes_loaded = true;
                break;

            case ("classificationConfer"):
                cachedClassificationConfers = response.data;
                cachedClassificationConfers_loaded = true;
                break;              
            // ------------------------------------------          
                        
            default:
                console.error("Unknown attribute");
                return;
        }

    } catch (error) {
        console.error('Error during dante vocabulary fetch: ', error);
    }
}

async function fetchDanteTaxCodes(uri) {

    if (!cachedTaxCodesForURI.has(uri)) {        
        // Send GET request and cache taxCodes for corresponding uri
        try {
            let taxCodes = [];

            let response = [];
            let partialResponse = [];
            let offset = 0;
            do {
                partialResponse = await axios.get(`https://api.dante.gbv.de/search?voc=arbodat_taxonomy&limit=1000&offset=${offset}&sort&query=*&properties=notation,hiddenLabel,ancestors`);
                response.push(...partialResponse.data);
                offset += 1000;
            } while (partialResponse.data.length > 0)
            
            for (let i = 0; i < response.length; i++) {
                const item = response[i];
                
                // check if ancestors of item equals corresponding taxonomy
                if (item.ancestors && item.ancestors[0] && item.ancestors[0].uri == uri) {
                    taxCodes.push(item)
                }
            }

            cachedTaxCodesForURI.set(uri, taxCodes);

        } catch (error) {
            console.error('Error during tax code fetch: ', error);
        }
    }
}