
let danteAttributesJSON = {};

// Fetch the DANTE vocabularies and send them to the backend, which keeps them for the other pages.
// Never throws: if DANTE is not reachable (or a vocabulary is broken) the vocabularies which could be loaded are
// still sent, the backend keeps what it stored earlier for the others. Returns false if one was missing.
async function updateBackendDanteAttributes() {
    let complete = true;

    try {
        complete = await collectDanteAttributes();
    } catch (error) {
        console.error('Error during preparation of dante attributes: ', error);
        complete = false;
    }

    // POST -----------------------------------------------------------------------------
    if (Object.keys(danteAttributesJSON).length > 0) {
        try {
            await axios.post("api/dante_attributes", danteAttributesJSON);

        } catch (error) {
            console.error('Error during post dante attributes: ', error);
            complete = false;
        }
    }

    return complete;
}

// Fills danteAttributesJSON; resolves to false if a vocabulary could not be loaded
async function collectDanteAttributes() {

    let cachedData = [];
    const missing = [];

    const attributes = ["license",                                                                    // research project
                        "taxonomy", "siteType", "naturalUnit",                                        // site
                        "coordinateSystem",                                                           // coordinate
                        "featureType", "preservationCondition",                                       // feature
                        "chronozone", "sampleType", "sampleInvestigated",                             // sample
                        "datingMethod", "material", "c14Laboratory",                                  // absolute dating
                        "ArboDat_PCODE", "classificationConfer", "restType", "stateOfPreservation"];  // result

    const ArboDat_PCODE_URI = "http://uri.gbv.de/terminology/arbodat_taxonomy/6ac2cb7f-fed7-445d-bd8c-4c8cadec2303";                              

    for (let i = 0; i < attributes.length; i++) {
        const attribute = attributes[i];

        // Fetch dante attributes -------------------------------------------------------
        if (attribute == "ArboDat_PCODE") {
            await fetchDanteTaxCodes(ArboDat_PCODE_URI);
        } else {
            await fetchDanteAttribute(attribute);
        }        
        
        // Get cachedData ---------------------------------------------------------------
        // extra handling :cachedTaxCodesForURI = new Map(); //   Key       value
                                                             // {"uri" => [taxCodes]}
        switch (attribute) {
    
            // researchProject --------------------------
            case ("license"):
                cachedData = cachedLicenses;
                break;

            // site -------------------------------------
            case "taxonomy":
                cachedData = cachedTaxonomies;
                break;

            case ("siteType"):
                cachedData = cachedSiteTypes;
                break;
    
            case "naturalUnit":
                cachedData = cachedNaturalUnits;
                break;
    
            // coordinate -------------------------------
            case "coordinateSystem":
                cachedData = cachedCoordinateSystems;
                break;
    
            // feature --------------------------------------
            case ("featureType"):
                cachedData = cachedFeatureTypes;
                break;
    
            case ("preservationCondition"):
                cachedData = cachedPreservationConditions;
                break;
    
            // sample ---------------------------------------
            case ("sampleType"):
                cachedData = cachedSampleTypes;
                break;
    
            case ("chronozone"):
                cachedData = cachedChronozones;
                break;
    
            case ("sampleInvestigated"):
                cachedData = cachedSampleInvestigated;
                break;
    
            // absoluteDating -------------------------------
            case ("material"):
                cachedData = cachedMaterials;
                break;

            case ("datingMethod"):
                cachedData = cachedDatingMethods;
                break;

            case ("c14Laboratory"):
                cachedData = cachedC14Laboratories;
                break;
    
            // result ---------------------------------------
            case ("stateOfPreservation"):            
                cachedData = cachedStateOfPreservation;
                break;
    
            case ("restType"):
                cachedData = cachedRestTypes;
                break;
    
            case ("classificationConfer"):
                cachedData = cachedClassificationConfers;
                break;
            
            // TaxCodes for 'ArboDat_PCODE' taxonomy
            case "ArboDat_PCODE":
                cachedData = cachedTaxCodesForURI.get(ArboDat_PCODE_URI);
                break;                    
            // ----------------------------------------------
                        
            default:
                console.error("Unknown attribute");
                return;
        }        
        
        // The vocabulary could not be loaded (DANTE not reachable): do not send an empty list
        if (!cachedData || cachedData.length === 0) {
            missing.push(attribute);
            continue;
        }

        // create JSON-Arrays -----------------------------------------------------------
        const attributeList = [];        
        let isNarrower = false;

        for (let i = 0; i < cachedData.length; i++) {
            const item = cachedData[i];

            switch (attribute) {

                case "coordinateSystem":
                    newEntry = {
                        id:    item.uri,
                        label: item.prefLabel?.en ?? null,
                        epsg: item.notation?.[0] ?? null
                    };
                    break;

                case "ArboDat_PCODE":
                    newEntry = {
                        id:       item.uri,
                        label:    item.notation[0],
                        labelDe: item.hiddenLabel?.de?.[0] ?? null,
                        labelEn: item.hiddenLabel?.en?.[0] ?? null,
                        labelFr: item.hiddenLabel?.fr?.[0] ?? null,
                        labelIt: item.hiddenLabel?.it?.[0] ?? null,
                        taxonomy: "ArboDat PCODE"
                    };                    
                    break;

                case "naturalUnit":
                    newEntry = {
                        id:    item.uri,
                        label: item.prefLabel.zxx,
                        labelDe: item.altLabel?.zxx?.[0] ?? null,
                        labelFr: item.altLabel?.zxx?.[1] ?? null,
                        naturalMainGroup:
                            Array.isArray(item.ancestors) && item.ancestors.length > 0
                                ? Object.values(item.ancestors[0].prefLabel || {})[0] ?? null
                                : null
                    };
                    break;

                case "c14Laboratory":
                    newEntry = {
                        id:    item.uri,
                        label: item.prefLabel?.zxx ?? null,
                        notation: item.notation?.[0] ?? null
                    };
                    break;

                case "siteType":
                case "restType":
                    // Skip guide term
                    if (item.type.includes("http://vocab.getty.edu/ontology#GuideTerm")) { continue }

                    newEntry = {
                        id:      item.uri,
                        label:   item.prefLabel.en,
                        labelDe: item.altLabel?.de?.[0] ?? null,
                        labelFr: item.altLabel?.fr?.[0] ?? null,
                        structuralConcept:
                            Array.isArray(item.ancestors) && item.ancestors.length > 0
                                ? Object.values(item.ancestors[0].prefLabel || {})[0] ?? null
                                : null
                    };
                    break;

                case "featureType":
                case "preservationCondition":
                case "sampleType":
                case "sampleInvestigated":
                case "datingMethod":
                case "stateOfPreservation":
                case "classificationConfer":
                    newEntry = {
                        id:    item.uri,
                        label: item.prefLabel.en,
                        labelDe: item.altLabel?.de?.[0] ?? null,
                        labelFr: item.altLabel?.fr?.[0] ?? null,
                    };                    
                    break;
            
                default:
                    newEntry = {
                        id:    item.uri,
                        label: item.prefLabel.en
                    };                    
                    break;
            }            
    
            attributeList.push(newEntry);
        } // ----------------------------------------------

        if (!isNarrower) {
            danteAttributesJSON[attribute] = attributeList;
        }
    }

    if (missing.length > 0) {
        console.error('Dante attributes not loaded: ', missing.join(', '));
    }
    return missing.length === 0;
}
