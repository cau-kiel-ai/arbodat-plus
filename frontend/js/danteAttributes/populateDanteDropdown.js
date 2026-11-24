
// Label of the selected option of a vocabulary dropdown. The text of an option is indented with non-breaking
// spaces for its hierarchy level; data-label is the label without them (the placeholder option has none).
function selectedLabel(select) {
    const option = select.selectedOptions[0];
    return option ? (option.getAttribute("data-label") ?? option.text.trim()) : null;
}

function populateDanteDropdown (attribute, dropdown) {

    // Get cachedData
    let cachedData = [];
    switch (attribute) {

        // researchProject --------------------------
        case "license":
            cachedData = cachedLicenses;
            break;

        // site -------------------------------------  
        case "taxonomy":
            cachedData = cachedTaxonomies;
            break;  

        case "siteType":
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
        case "featureType":
            cachedData = cachedFeatureTypes;
            break;

        case "preservationCondition":
            cachedData = cachedPreservationConditions;
            break;

        // sample ---------------------------------------
        case "sampleType":
            cachedData = cachedSampleTypes;
            break;

        case "chronozone":
            cachedData = cachedChronozones;
            break;

        // sampleInvestigated
        case "seedsAndFruits":
        case "charcoalInvestigated":
        case "woodSubfossile":
            cachedData = cachedSampleInvestigated;
            break;

        // absoluteDating -------------------------------
        case "material":
            cachedData = cachedMaterials;
            break;

        case "datingMethod":
            cachedData = cachedDatingMethods;
            break;

        // C14Dating ------------------------------------
        case "c14Laboratory":
            cachedData = cachedC14Laboratories;
            break;

        // result ---------------------------------------
        case "stateOfPreservation":            
            cachedData = cachedStateOfPreservation;
            break;

        case "restType":
            cachedData = cachedRestTypes;
            break;

        case "classificationConfer":
            cachedData = cachedClassificationConfers;
            break;          
        // ----------------------------------------------
                    
        default:
            console.error("Unknown attribute");
            return;
    }

    for (const item of cachedData) {

        if (attribute === "naturalUnit" ||
            attribute === "siteType"    ||
            attribute === "restType"
        ) {
            const optionsArray = Array.from(dropdown.options);

            // Check if such an entry already exists
            const exists = optionsArray.some(opt => opt.value === item.uri);

            if (!exists) {
                // restType: the cached data is already in the (custom) display order -> always append
                //           (inserting behind the parent would reverse the order of its children)
                const appendOnly = attribute === "restType";

                let insertAfterIndex = -1;
                if (item.ancestors) {
                    [...item.ancestors].reverse().forEach((ancestor, index) => {
                        // Check if such an entry already exists and if so determine index
                        const optionIndex = optionsArray.findIndex(opt => opt.value === ancestor.uri)
    
                        if (optionIndex === -1) {
                            // Create 'option' and set URI as value
                            const option = document.createElement('option');
                            option.value = ancestor.uri;
    
                            const spaces = "\u00A0".repeat((index) * 3);
                            const label = ancestor.prefLabel?.de ?? ancestor.prefLabel?.en ?? "";
                            option.textContent = spaces + label;
                            option.setAttribute("data-label", label);

                            // Disable guide term
                            if (ancestor.type.includes("http://vocab.getty.edu/ontology#GuideTerm")) {
                                option.disabled = true;
                                option.style.fontWeight = "bold";
                                option.style.color = "gray";
                            }
    
                            if (insertAfterIndex === -1) {
                                dropdown.appendChild(option);
                            } else {
                                dropdown.insertBefore(option, dropdown.options[insertAfterIndex + 1] || null);
                                insertAfterIndex++;
                            }                        
                        } else if (!appendOnly) {
                            insertAfterIndex = optionIndex;
                        }
                    });
                }
                
                // ArboDat+_naturalUnit
                if (item.uri === "ArboDat+_naturalUnit_unknown" ||
                    item.uri === "ArboDat+_naturalUnit_notChosen"
                ) {
                    // Create "ArboDat+_naturalUnit" option
                    let option = document.createElement('option');
                    option.textContent = "ArboDat+_naturalUnit";
                    option.disabled = true;
                    option.style.fontWeight = "bold";
                    option.style.color = "gray";
                    dropdown.appendChild(option);

                    // Create "ArboDat+_naturalUnit_unknown" option
                    option = document.createElement('option');
                    option.value = "ArboDat+_naturalUnit_unknown";
                    option.textContent = "\u00A0\u00A0" + "unknown";
                    option.setAttribute("data-label", "unknown");
                    dropdown.appendChild(option);
                    
                    // Create "ArboDat+_naturalUnit_notChosen" option
                    option = document.createElement('option');
                    option.value = "ArboDat+_naturalUnit_notChosen";
                    option.textContent = "\u00A0\u00A0" + "not chosen";
                    option.setAttribute("data-label", "not chosen");
                    dropdown.appendChild(option);
                }

                // ArboDat+_siteType
                else if (
                    item.uri === "ArboDat+_siteType_unknown" ||
                    item.uri === "ArboDat+_siteType_notChosen" ||
                    item.uri === "ArboDat+_siteType_otherAnthropogenicDeposit" ||
                    item.uri === "ArboDat+_siteType_otherNaturalDeposit" ||
                    item.uri === "ArboDat+_siteType_otherRuralSetting" ||
                    item.uri === "ArboDat+_siteType_otherSettlement" ||
                    item.uri === "ArboDat+_siteType_otherPlaceOfCult"
                ) {
                    // Create "ArboDat+_siteType" option
                    let option = document.createElement('option');
                    option.textContent = "ArboDat+_siteType";
                    option.disabled = true;
                    option.style.fontWeight = "bold";
                    option.style.color = "gray";
                    dropdown.appendChild(option);

                    // Create "ArboDat+_siteType_unknown" option
                    option = document.createElement('option');
                    option.value = "ArboDat+_siteType_unknown";
                    option.textContent = "\u00A0\u00A0" + "unknown type of site";
                    option.setAttribute("data-label", "unknown type of site");
                    dropdown.appendChild(option);
                    
                    // Create "ArboDat+_siteType_notChosen" option
                    option = document.createElement('option');
                    option.value = "ArboDat+_siteType_notChosen";
                    option.textContent = "\u00A0\u00A0" + "not chosen";
                    option.setAttribute("data-label", "not chosen");
                    dropdown.appendChild(option);

                    // Create "ArboDat+_siteType_otherAnthropogenicDeposit" option
                    option = document.createElement('option');
                    option.value = "ArboDat+_siteType_otherAnthropogenicDeposit";
                    option.textContent = "\u00A0\u00A0" + "other anthropogenic deposit";
                    option.setAttribute("data-label", "other anthropogenic deposit");
                    dropdown.appendChild(option);

                    // Create "ArboDat+_siteType_otherNaturalSediment" option
                    option = document.createElement('option');
                    option.value = "ArboDat+_siteType_otherNaturalSediment";
                    option.textContent = "\u00A0\u00A0" + "other natural sediment";
                    option.setAttribute("data-label", "other natural sediment");
                    dropdown.appendChild(option);

                    // Create "ArboDat+_siteType_otherRuralSetting" option
                    option = document.createElement('option');
                    option.value = "ArboDat+_siteType_otherRuralSetting";
                    option.textContent = "\u00A0\u00A0" + "other rural setting";
                    option.setAttribute("data-label", "other rural setting");
                    dropdown.appendChild(option);

                    // Create "ArboDat+_siteType_otherSettlement" option
                    option = document.createElement('option');
                    option.value = "ArboDat+_siteType_otherSettlement";
                    option.textContent = "\u00A0\u00A0" + "other settlement";
                    option.setAttribute("data-label", "other settlement");
                    dropdown.appendChild(option);

                    // Create "ArboDat+_siteType_otherPlaceOfCult" option
                    option = document.createElement('option');
                    option.value = "ArboDat+_siteType_otherPlaceOfCult";
                    option.textContent = "\u00A0\u00A0" + "other place of cult";
                    option.setAttribute("data-label", "other place of cult");
                    dropdown.appendChild(option);
                } else {
                    // Skip guide term
                    if (item.type.includes("http://vocab.getty.edu/ontology#GuideTerm")) { continue }

                    // Create 'option' and set URI as value
                    const option = document.createElement('option');
                    option.value = item.uri;

                    const spaces = "\u00A0".repeat((item.ancestors.length) * 3);
                    const label = Object.values(item.prefLabel)[0];
                    option.textContent = spaces + label;
                    option.setAttribute("data-label", label);

                    if (insertAfterIndex === -1) {
                        dropdown.appendChild(option);
                    } else {
                        dropdown.insertBefore(option, dropdown.options[insertAfterIndex + 1] || null);
                    }
                }
            }
            continue;         
        }

        // Create 'option' and set URI as value
        const option = document.createElement('option');                       
        option.value = item.uri;

        // Set label attribute and textContent ----------------------------------------------
        if (attribute == "coordinateSystem") {
            const label = [item.prefLabel.en, item.notation].filter(Boolean).join(" - ");
            option.textContent = label;
            option.setAttribute("data-crsNotation", item.notation);
        }
        else if (attribute == "c14Laboratory") {
            const label = [item.notation, item.prefLabel?.zxx].filter(Boolean).join(", ");
            option.textContent = label;
            option.setAttribute("data-label", label);

            // Lowercased copies for the (case-insensitive) search matcher/sorter in codeNameFilter.js
            option.setAttribute("data-code-lc", codeSearchKey(item.notation));
            option.setAttribute("data-name-lc", String(item.prefLabel?.zxx ?? "").toLowerCase());

            dropdown.appendChild(option);
            continue; // Jumps to next iteration without executing the rest of the code
                      // (disable guide terms and 'populateNarrower')
        }
        else if (attribute == "taxonomy") {
            option.textContent = item.prefLabel.en;
            option.setAttribute("data-label", item.prefLabel.en);

            dropdown.appendChild(option);
            continue; // Jumps to next iteration without executing the rest of the code
        }
        else {
            option.textContent = item.prefLabel.en;
            option.setAttribute("data-label", item.prefLabel.en);
        } // --------------------------------------------------------------------------------

        // If guideTerm -> disable and grey out
        if (item.type.includes("http://vocab.getty.edu/ontology#GuideTerm")) {                
            option.disabled = true;
            option.style.fontWeight = "bold";
            option.style.color = "gray";
        }

        dropdown.appendChild(option);

        populateNarrower(dropdown, item.narrower, attribute, item.prefLabel.en);
    }
}

function populateNarrower(dropdown, narrower, attribute, structuralConcept) {
    
    // Termination condition
    if (!narrower || narrower.length === 0 || (narrower.length === 1 && narrower[0] === null)) {
        return;
    }
    
    for (let i = 0; i < narrower.length; i++) {
        const option = document.createElement('option');                    
        option.value = narrower[i].uri;

        option.textContent = "\u00A0\u00A0" + narrower[i].prefLabel.en;
        option.setAttribute("data-label", narrower[i].prefLabel.en);
        option.setAttribute("data-structuralConcept", structuralConcept);

        // If guideTerm -> disable and grey out 
        if (narrower[i].type.includes("http://vocab.getty.edu/ontology#GuideTerm")) {                
            option.disabled = true;
            option.style.fontWeight = "bold";
            option.style.color = "gray";
        }

        dropdown.appendChild(option);

        // INFO: Comment in if more than one hierarchy (recursion)
        //       (+ adjust paddingLeft for hierarchy level: perhaps as a parameter of the function
        //                                                  and for each level add two space "\u00A0\u00A0")
        // populateNarrower(dropdown, narrower[i].narrower);
    }
}

// Search key for the code filter (codeNameFilter.js): all notations lowercased, each prefixed with "|"
// (DANTE notations are arrays, e.g. ["UBA", "UB"]) -> "|uba|ub"; "" if there is no notation.
function codeSearchKey(notation) {
    return [].concat(notation ?? []).map(n => "|" + String(n).toLowerCase()).join("");
}

function populateTaxCodeDropdown(uri, dropdown) {
    
    // Reset Dropdown
    dropdown.options.length = 1;

    // Get tax codes for corresponding uri
    const taxCodes = cachedTaxCodesForURI.get(uri) || [];

    for (let i = 0; i < taxCodes.length; i++) {
        const item = taxCodes[i];
        
        // Create 'option' and set URI as value
        const option = document.createElement('option');                       
        option.value = item.uri;

        // Set label attribute and textContent
        const label = [item.notation, item.prefLabel?.la].filter(Boolean).join(", ");
        option.textContent = label;
        option.setAttribute("data-label", item.notation);

        // Lowercased copies for the (case-insensitive) search matcher/sorter in codeNameFilter.js
        option.setAttribute("data-code-lc", codeSearchKey(item.notation));
        option.setAttribute("data-name-lc", String(item.prefLabel?.la ?? "").toLowerCase());

        dropdown.appendChild(option);
    }
}

function createTaxCodeOptionsFragment(taxCodes) {
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < taxCodes.length; i++) {
        const item = taxCodes[i];
        
        // Create 'option' and set URI as value
        const option = document.createElement('option');                       
        option.value = item.uri;

        // Set label attribute and textContent
        const label = [item.notation, item.prefLabel?.la].filter(Boolean).join(", ");
        option.textContent = label;
        option.setAttribute("data-label", item.notation);

        fragment.appendChild(option);
    }

    return fragment;
}

function populateTaxCodeDropdownShared(dropdown, sharedTaxCodeOptionsFragment) {
    // Reset Dropdown
    dropdown.options.length = 1;

    const clone = sharedTaxCodeOptionsFragment.cloneNode(true);
    dropdown.appendChild(clone);
}