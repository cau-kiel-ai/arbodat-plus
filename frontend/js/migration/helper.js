function toggleAllCheckboxes(masterCheckbox, tableBodyId) {
    const tableBody = document.getElementById(tableBodyId);
    if (tableBody) {
      // Rows hidden by a table filter (tableFilter.js) and group header checkboxes are skipped
      const checkboxes = tableBody.querySelectorAll('input[type="checkbox"]:not(.group-select)');
      checkboxes.forEach(checkbox => {
        if (!checkbox.disabled && !checkbox.closest('tr.filter-hidden')) {
          checkbox.checked = masterCheckbox.checked;
        }
      });
      // Let the table filter update its group header checkboxes
      tableBody.dispatchEvent(new Event('change'));
    }
}

let updatingDropdowns = false;
function updateCheckedDropdowns(value, tableBodyId, selectIdPrefix) {
    if (updatingDropdowns) return;
    updatingDropdowns = true;

    const tableBody = document.getElementById(tableBodyId);
    if (tableBody) {
        const checkboxes = tableBody.querySelectorAll('input[type="checkbox"]:checked');
        // Update value in checked Dropdowns
        checkboxes.forEach(checkbox => {
            if (!checkbox.disabled) {
                const row = checkbox.closest('tr');
                const dropdown = row.querySelector(`select[id^=${selectIdPrefix}]`);
                if (dropdown) {
                    dropdown.value = value;
                    if(selectIdPrefix === "coordinateSystemDropdown_") {
                        $(dropdown).trigger('change');
                    }
                    if ([
                        "c14LabDropdown_",
                        "taxCodeDropdown_",
                        "restTypeDropdown_",
                        "stateOfPreservationDropdown_",
                        "coordinateSystemDropdown_",
                        "danteDropdown_",
                    ].includes(selectIdPrefix)) {
                        $(dropdown).trigger('change.select2');
                    }
                }
            }
        });
    }
    updatingDropdowns = false;
}

let updatingDropdownsMultiple = false;
function updateCheckedDropdownsMultiple(values, tableBodyId, selectIdPrefix) {
    if (updatingDropdownsMultiple) return;
    updatingDropdownsMultiple = true;

    const tableBody = document.getElementById(tableBodyId);
    if (tableBody) {
        const checkboxes = tableBody.querySelectorAll('input[type="checkbox"]:checked');
        // Update values in checked Dropdowns
        checkboxes.forEach(checkbox => {
            if (!checkbox.disabled) {
                const row = checkbox.closest('tr');
                const dropdown = row.querySelector(`select[id^=${selectIdPrefix}]`);
                if (dropdown) {
                    // Clear previous selections
                    Array.from(dropdown.options).forEach(option => {
                        option.selected = values.includes(option.value);
                    });
                    if ([
                        "userDropdown_",
                        "danteDropdown_",
                    ].includes(selectIdPrefix)) {
                        $(dropdown).trigger('change.select2');
                    }
                }
            }
        });
    }
    updatingDropdownsMultiple = false;
}

function updateCheckedInputs(value, tableBodyId, inputIdPrefix) {
    const tableBody = document.getElementById(tableBodyId);
    if (tableBody) {
        const checkboxes = tableBody.querySelectorAll('input[type="checkbox"]:checked');
        // Update value in checked inputs
        checkboxes.forEach(checkbox => {
            if (!checkbox.disabled) {
                const row = checkbox.closest('tr');
                const input = row.querySelector(`input[id^=${inputIdPrefix}]`);
                if (input) {
                    input.value = value;
                }
            }
        });
    }
}

function addLabelToJSON(itemId, attribute, nonMatchingLabel, button) {
    const data = {
        attribute: attribute,
        nonMatchingLabel: nonMatchingLabel,
        itemId: itemId
    };

    jsonData.push(data);
    console.log(`non matching ${attribute} is added to JSON`);

    const row = button.closest("tr");
    row.remove();

    displayJSON();
}

function addLabelToJSONWithItem(button, attribute, nonMatchingLabel) {    
    // attributes: 'taxCode', 'restType', 'stateOfPreservation',
    //             'coordinateSystemSite', 'coordinateSystemSample',
    //             'C14LabCode'

    // Get row from button
    const row = button.closest("tr");

    // Decode item
    let jsonString = decodeURIComponent(button.getAttribute('data-item'));
    let item = JSON.parse(jsonString);
    
    if (attribute == "result") {

        let result = item.result;

        // Get Taxonomy
        const siteLabel = result.sample.feature.site.label;
        const siteLabelSafe = siteLabel.replace(/\s+/g, '_');
        const taxonomyDropdown = document.getElementById(`taxonomyDropdown_${siteLabelSafe}`);
        const taxonomyLabel = taxonomyDropdown ? taxonomyDropdown.options[taxonomyDropdown.selectedIndex].text : null;

        if (taxonomyLabel != "select Taxonomy") {

            // Get and set fractionAnalyzed ------------------------------
            const fractionAnalyzedCell  = row.cells[5];
            const orgOrMinCell          = row.cells[6];
            const sieveSizeCell         = row.cells[7];

            if (fractionAnalyzedCell.textContent != "null") {
                // Set fractionAnalyzed in result
                result.fractionAnalyzed = fractionAnalyzedCell.textContent;
                result.orgOrMin         = orgOrMinCell.textContent
                result.sieveSize        = parseFloat(sieveSizeCell.textContent);

                const data = {
                    itemType: "result",
                };
                
                // Get and set TaxCode
                let taxCodeIsSet = true;
                if (result.taxCode == null) {
                    
                    const taxCodeDropdown = document.getElementById(`taxCodeDropdown_${item.id}`);
                    const taxCodeId = taxCodeDropdown ? taxCodeDropdown.value : null;
                    const taxCodeLabel = taxCodeDropdown ? taxCodeDropdown.options[taxCodeDropdown.selectedIndex].text.trim() : null;
                    
                    if (taxCodeId && taxCodeLabel) {
                        // Set taxCode
                        result.taxCode = {
                            id: taxCodeId,
                            label: taxCodeLabel,
                            taxonomy: taxonomyLabel
                        };
                    } else {
                        taxCodeIsSet = false;
                        // Add to JSON
                        const taxCodeCell  = row.cells[3];
                        const nonMatchingLabel = taxCodeCell.textContent;
                        data.nonMatching_taxCode = {
                            nonMatching_taxCode: nonMatchingLabel,
                            taxonomy: taxonomyLabel
                        };
                    }
                }

                // Get and set ClassificationConfer
                // if (result.classificationConfer == null) {
                //     const cfDropdown = document.getElementById(`cfDropdown_${item.id}`);
                //     const cfId = cfDropdown ? cfDropdown.value : null;
                //     const cfLabel = cfDropdown ? cfDropdown.options[cfDropdown.selectedIndex].text : null;

                //     if (cfId && cfLabel) {
                //         // Set ClassificationConfer
                //         result.classificationConfer = {
                //             id: cfId,
                //             label: cfLabel
                //         };
                //     } else {
                //         // Add to JSON
                //         const cfCell  = row.cells[9];
                //         nonMatchingLabel = cfCell.textContent;
                //         data.nonMatching_classificationConfer = nonMatchingLabel;
                //     }
                // }

                // Get and set RestType
                let restTypeIsSet = true;
                if (result.restType == null) {                    
                    const restTypeDropdown = document.getElementById(`restTypeDropdown_${item.id}`);
                    const restTypeId = restTypeDropdown ? restTypeDropdown.value : null;
                    const restTypeLabel = restTypeDropdown ? restTypeDropdown.options[restTypeDropdown.selectedIndex].text.trim() : null;
                    
                    if (restTypeId && restTypeLabel) {
                        // Set RestType
                        result.restType = {
                            id: restTypeId,
                            label: restTypeLabel
                        };
                    } else {
                        restTypeIsSet = false;
                        // Add to JSON
                        const restTypeCell  = row.cells[9];
                        nonMatchingLabel = restTypeCell.textContent;
                        data.nonMatching_restType = nonMatchingLabel;
                    }
                }

                // Get and set StateOfPreservation
                let stateOfPreservationIsSet = true;
                if (result.stateOfPreservation == null) {                    
                    const stateOfPreservationDropdown = document.getElementById(`stateOfPreservationDropdown_${item.id}`);
                    const stateOfPreservationId = stateOfPreservationDropdown ? stateOfPreservationDropdown.value : null;
                    const stateOfPreservationLabel = stateOfPreservationDropdown ? stateOfPreservationDropdown.options[stateOfPreservationDropdown.selectedIndex].text : null;
                    
                    if (stateOfPreservationId && stateOfPreservationLabel) {
                        // Set StateOfPreservation
                        result.stateOfPreservation = {
                            id: stateOfPreservationId,
                            label: stateOfPreservationLabel
                        };
                    } else {
                        stateOfPreservationIsSet = false;
                        // Add to JSON
                        const stateOfPreservationCell  = row.cells[11];
                        nonMatchingLabel = stateOfPreservationCell.textContent;
                        data.nonMatching_stateOfPreservation = nonMatchingLabel;
                    }
                }

                if (taxCodeIsSet && restTypeIsSet && stateOfPreservationIsSet) {
                    toast.info("Everything to create a result is set correctly. Please use 'Create' option instead of 'Add to JSON'.");
                } else {
                    // Only use sampleId to parse JSON in backend correct
                    const resultPayload = {
                        ...result,
                        sample: {
                            id: result.sample.id
                        }
                    };

                    // Add result to data
                    data.item = resultPayload;

                    jsonData.push(data);
                    displayJSON();
                    console.log(`Result with non matching attributes is added to JSON`);

                    row.remove();
                }

            } else {
                toast.info("Before you can 'Add to JSON', you must create the corresponding fraction analysed for the corresponding sample in the ‘Fraction Analyzed’ accordion.");
            }
        } else {
            toast.info("Before you can 'Add to JSON', you must select a 'Taxonomy' for this site.");
        }
    }

    if (attribute == "coordinateSystemSite" || attribute == "coordinateSystemSample") {

        // Get latitude, longitude, altitude, remarks from input ---------------
        const longitude = parseFloat(row.cells[2].querySelector("input").value);
        const latitude  = parseFloat(row.cells[3].querySelector("input").value);
        const altitude  = parseFloat(row.cells[4].querySelector("input").value);
        
        let remarks;   
        let data;
        if (attribute == "coordinateSystemSite") {
            const longitudeWgs84 = parseFloat(row.cells[7].querySelector("input").value);
            const latitudeWgs84  = parseFloat(row.cells[8].querySelector("input").value);
            const remarks        = row.cells[9].querySelector("textarea").value

            data = {
                itemType: "coordinateSite",
                siteId: item.id,
                item: {
                    latitude:       latitude,
                    longitude:      longitude,
                    altitude:       altitude,
                    longitudeWgs84: longitudeWgs84,
                    latitudeWgs84:  latitudeWgs84,
                    remarks:        remarks,
                },
                nonMatching_coordinateSystem: nonMatchingLabel
            };
        } else if (attribute == "coordinateSystemSample") {
            const longitudeWgs84 = parseFloat(row.cells[8].querySelector("input").value);
            const latitudeWgs84  = parseFloat(row.cells[9].querySelector("input").value);
            const remarks        = row.cells[10].querySelector("textarea").value

            data = {
                itemType: "coordinateSample",
                sampleId: item.id,
                item: {
                    latitude:       latitude,
                    longitude:      longitude,
                    altitude:       altitude,
                    longitudeWgs84: longitudeWgs84,
                    latitudeWgs84:  latitudeWgs84,
                    remarks:        remarks,
                },
                nonMatching_coordinateSystem: nonMatchingLabel
            }
        }        

        jsonData.push(data);
        displayJSON();
        console.log(`non matching ${attribute} is added to JSON`);

        row.remove();                
    }

    if (attribute == "C14LabCode") {
        // Get number
        const numberInput  = row.cells[5].querySelector("input");
        const number = numberInput.value.trim();

        if (number) {
            // Get labelInput
            const newC14LabCode  = row.cells[4].querySelector("input").value.trim();

            if (newC14LabCode && newC14LabCode.trim() !== "") {
                data = {
                    itemType: "C14Dating",
                    absoluteDatingId: item.absoluteDatingId,
                    number: number,
                    nonMatching_C14LabCode: newC14LabCode
                }       
    
                jsonData.push(data);
                displayJSON();
                console.log(`non matching ${attribute} is added to JSON`);

                row.remove();                
            
            } else {
                toast.info(`No new C14Laboratory entered.`);
            }
        } else {
            toast.info(`No number entered.`);
        }
    }
}

function hideTableIfTbodyEmpty(tbody) {
    if (tbody) {
        const table = tbody.closest('table');
        if (table) {
            // hide if empty
            if (tbody.rows.length === 0) {
                table.style.display = 'none';
            } else { // display
                table.style.display = 'table';
            }
        }
    }
}
