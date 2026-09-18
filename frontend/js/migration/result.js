const resultMap = new Map();

function populateResults(resultList) {

    // Get resultForm
    const resultForm = document.getElementById("resultForm");

    resultList.forEach(async entry => {
        const siteLabel = Object.keys(entry)[0];
        const siteLabelSafe = siteLabel.replace(/\s+/g, '_'); // sanitize

        const siteResultsContainer = document.createElement("div");

        // Container for siteLabel and taxonomyDropdwon -------------
        const labelDropdownContainer = document.createElement("div");
            // Style
        labelDropdownContainer.style.display = "flex";        // Flexbox for horizontal arrangement
        labelDropdownContainer.style.alignItems = "center";   // Align vertically
        labelDropdownContainer.style.gap = "20px";            // Space between texts and dropdown

        // Create 'span' for "Site label: ""
        const span_text = document.createElement("span");
        span_text.textContent = `Site: `;
            // Style
        span_text.style.fontWeight = "bold";

        // Create 'span' for siteLabel
        const span_siteLabel = document.createElement("span");
        span_siteLabel.textContent = siteLabel;
            // Style
        span_siteLabel.style.fontWeight = "bold";
        span_siteLabel.style.fontSize   = "1.3em"; // 130% of normal font size

        // Create taxonomy dropdown
        const taxonomyDropdown = document.createElement("div");
        taxonomyDropdown.innerHTML = `<select id="taxonomyDropdown_${siteLabelSafe}"
                                              onchange="handleTaxonomyChange(this.value, '${siteLabel}')">
                                              <option value=""></option>
                                      </select>
                                     `;
            // Style
        taxonomyDropdown.style.transform = "scale(0.8)";
        taxonomyDropdown.style.fontSize  = "0.9em"; // 90% of normal font size
        taxonomyDropdown.style.width     = "width: 300px;"

        labelDropdownContainer.appendChild(span_text);
        labelDropdownContainer.appendChild(span_siteLabel);
        labelDropdownContainer.appendChild(taxonomyDropdown);

        // Create new table -----------------------------------------

        // Scale result table font size 80%
        const style = document.createElement("style");
        style.innerHTML = `
            #resultTable td, #resultTable th {
                font-size: 0.8em;
            }
        `;
        // Insert the style tag into the head section of the document
        document.head.appendChild(style);

        // Create new table
        const resultTable = document.createElement("table");
        resultTable.className = "table table-striped";
        resultTable.id = "resultTable";

        // Create new table head
        const thead = document.createElement("thead");
        thead.innerHTML = `
        <tr>
            <th>
                <input type="checkbox" onclick="toggleAllCheckboxes(this, 'resultTableBody_${siteLabel}')">
            </th>

            <th scope="col">Feature</th>
            <th scope="col">Sample</th>

            <th scope="col">taxCode</th>
            <th scope="col" style="min-width: 78px;">dante taxCode</th>

            <th scope="col">fraction Analyzed</th>
            <th scope="col">orgOrMin</th>
            <th scope="col">sieve size</th>

            <th scope="col">cf</th>

            <th scope="col">restType</th>
            <th scope="col">dante&#8239restType</th>

            <th scope="col">stateOfPreservation</th>
            <th scope="col">dante stateOfPreservation</th>

            <th scope="col">Create&#8239Result Add to JSON</th>
        </tr>
        `;
        resultTable.appendChild(thead);

        // Create new table body
        const resultTableBody = document.createElement("tbody");
        resultTableBody.id = `resultTableBody_${siteLabel}`;
        // ----------------------------------------------------------

        // Create lines for each result
        const results = entry[siteLabel];
        results.forEach(item => {

            const row = document.createElement("tr");

            // Generate an unique ID based on:
            // featureId, sampleId, nonMatchingTaxCode, fraction, cf, restType, stateOfPreservation
            const cf = item.result.classificationConfer ? item.result.classificationConfer.label : item.nonMatchingClassificationConfer;
            const restType = item.result.restType ? item.result.restType.label : item.nonMatchingRestType;
            const stateOfPreservation = item.result.stateOfPreservation ? item.result.stateOfPreservation.label : item.nonMatchingStateOfPreservation;
            item.id = `${item.result.sample.feature.id}_${item.fractionAnalyzed.sampleId}_${item.result.taxCode?.label ?? item.nonMatchingTaxCode}_${item.fractionAnalyzed.fraction.replace(/\./g, '_dot_')}_${cf}_${restType}_${stateOfPreservation}`;

            resultMap.set(item.id, item);
            row.dataset.itemId = item.id;
            
            // Add columns ----------------------------------------------------
            let columns = `
                <td><input type="checkbox"></td>

                <td>
                    ${item.result.sample.feature.label}
                </td>

                <td data-sampleId="${item.result.sample.id}">
                    ${item.result.sample.label}
                </td>
            `;

            // TaxCode
            if (item.result.taxCode != null) {
                columns += `<td>${item.result.taxCode.label}</td>`;
                columns += `<td></td>`;
            } else {
                const taxCodeDropdown = `<select
                                            id="taxCodeDropdown_${item.id}"
                                            onchange="updateCheckedDropdowns(this.value, 'resultTableBody_${siteLabel}', 'taxCodeDropdown_')"
                                            style="appearance: none;"
                                        >
                                            <option value="">select</option>
                                        </select>`;
                columns += `<td>${item.nonMatchingTaxCode}</td>`;
                columns += `<td>${taxCodeDropdown}</td>`;
            }

            // FractionAnalyzed
            columns += `<td></td>`;
            columns += `<td data-originalFraction="${item.fractionAnalyzed.fraction}">${item.fractionAnalyzed.orgOrMin ?? ''}</td>`;
            columns += `<td data-originalFraction="${item.fractionAnalyzed.fraction}">${item.fractionAnalyzed.sieveSize ?? ''}</td>`;

            // ClassificationConfer
            if (item.nonMatchingClassificationConfer == "") {
                columns += `<td>${item.result.classificationConfer.label}</td>`;
            // INFO: No extension in ArboDat2018 possible
            //     columns += `<td></td>`;
            // } else {
            //     const cfDropdown = `<select id="cfDropdown_${item.id}"
            //                                 onchange="updateCheckedDropdowns(this.value, 'resultTableBody_${siteLabel}', 'cfDropdown_')">
            //                                 <option value="">select cf</option>
            //                         </select>`;
            //     columns += `<td>${item.nonMatchingClassificationConfer}</td>`;
            //     columns += `<td>${cfDropdown}</td>`;
            }

            // RestType
            if (item.nonMatchingRestType == "") {
                columns += `<td>${item.result.restType.label}</td>`;
                columns += `<td></td>`;
            } else {
                const restTypeDropdown = `<select
                                            id="restTypeDropdown_${item.id}"
                                            onchange="updateCheckedDropdowns(this.value, 'resultTableBody_${siteLabel}', 'restTypeDropdown_')"
                                            style="appearance: none;"
                                         >
                                            <option value="">select</option>
                                         </select>`;
                columns += `<td>${item.nonMatchingRestType}</td>`;
                columns += `<td>${restTypeDropdown}</td>`;
            }

            // StateOfPreservation            
            if (item.nonMatchingStateOfPreservation == "") {
                columns += `<td>${item.result.stateOfPreservation.label}</td>`;
                columns += `<td></td>`;
            } else {
                const stateOfPreservationDropdown = `<select
                                                        id="stateOfPreservationDropdown_${item.id}"
                                                        onchange="updateCheckedDropdowns(this.value, 'resultTableBody_${siteLabel}', 'stateOfPreservationDropdown_')"
                                                        style="appearance: none;"
                                                     >
                                                        <option value="">select</option>
                                                     </select>`;
                columns += `<td>${item.nonMatchingStateOfPreservation}</td>`;
                columns += `<td>${stateOfPreservationDropdown}</td>`;
            }

            // 'Create' and 'Add to JSON' Button
            columns += `<td>
                            <button
                                type="button"
                                onclick="createResult('${item.id}', this.closest('tr'))"
                            >
                                Create
                            </button>
                            <br>
                            <button
                                type="button"
                                style="margin-top: 6px;"
                                data-item='${encodeURIComponent(JSON.stringify(item))}'
                                onclick="addLabelToJSONWithItem(this, 'result')"
                            >
                                Add&#8239to&#8239JSON
                            </button>
                        </td>`

            // ----------------------------------------------------------------

            row.innerHTML = columns;

            resultTableBody.appendChild(row);
        });

        resultTable.appendChild(resultTableBody);        

        siteResultsContainer.appendChild(labelDropdownContainer);
        siteResultsContainer.appendChild(resultTable);

        resultForm.appendChild(siteResultsContainer);
        
        // Select2 taxonomy dropdown ----------------
        $(`#taxonomyDropdown_${siteLabelSafe}`).select2({
            placeholder: 'select Taxonomy',
            allowClear: true,
        });
        // remove arrow
        $(`#taxonomyDropdown_${siteLabelSafe}`)
            .next('.select2-container')
            .find('.select2-selection__arrow')
            .remove();
        // ------------------------------------------

        // Populate taxonomyDropdown
        await fetchDanteAttribute("taxonomy");
        populateDanteDropdown("taxonomy", document.getElementById(`taxonomyDropdown_${siteLabelSafe}`));

        // Populate danteDropdowns in each line 
        results.forEach(async item => {

            // if (item.result.classificationConfer == null) {
            //     // Populate cfDropdown
            //     await fetchDanteAttribute("classificationConfer");
            //     populateDanteDropdown("classificationConfer", document.getElementById(`cfDropdown_${item.id}`));
            // }

            if (item.result.restType == null) {
                // Populate restTypeDropdown
                await fetchDanteAttribute("restType");
                populateDanteDropdown("restType", document.getElementById(`restTypeDropdown_${item.id}`));
            }            

            if (item.result.stateOfPreservation == null) {
                // Populate stateOfPreservationDropdown
                await fetchDanteAttribute("stateOfPreservation");
                populateDanteDropdown("stateOfPreservation", document.getElementById(`stateOfPreservationDropdown_${item.id}`));
            }
        });
    });
}

$(document).on(
    'mousedown keydown',
    'select[id^="taxCodeDropdown_"], select[id^="restTypeDropdown_"], select[id^="stateOfPreservationDropdown_"]',

    function (e) {

        if (e.type === 'keydown' &&
            !['Enter', 'Space', 'ArrowDown'].includes(e.key)) {
            return;
        }

        const $select = $(this);
        
        if (!$select.hasClass('select2-hidden-accessible')) {
            e.preventDefault();

            $select.select2({
                placeholder: 'select',
                templateSelection: function(item) {
                    return (item.text || '').trim();
                }
            });
            // remove arrow
            $select
                .next('.select2-container')
                .find('.select2-selection__arrow')
                .remove();

            $select.select2('open');
        }
    }
);

$(document).on(
    'select2:open',
    'select[id^="taxCodeDropdown_"], select[id^="restTypeDropdown_"], select[id^="stateOfPreservationDropdown_"]',
    function (e) {
        const $select = $(e.target);
        const $container = $select.next('.select2-container');        
        $container.css({
            width: '100%'
        });
        $container.find('.select2-selection__rendered').css({
            fontSize: '12px'
        });
        $container.find('.select2-selection--single').css({
            height: '44px'
        });

        const $dropdown = $('.select2-container--open .select2-dropdown');
        $dropdown.css({
            minWidth: '300px'
        });
});

async function handleTaxonomyChange(uri, siteLabel) {
    showLoading();
    // Browser is able to render spinner UI
    await new Promise(resolve => setTimeout(resolve, 0));

    try {
        await fetchDanteTaxCodes(uri);

        // Get tax codes for corresponding uri
        const taxCodes = cachedTaxCodesForURI.get(uri) || [];
        const sharedTaxCodesOptionsFragment = createTaxCodeOptionsFragment(taxCodes);

        // Get all tax codes dropdowns
        const tableBody = document.getElementById(`resultTableBody_${siteLabel}`);
        const taxCodeDropdowns = Array.from(tableBody.querySelectorAll("select[id^='taxCodeDropdown_']"));

        const batchSize = 50;
        for (let i = 0; i < taxCodeDropdowns.length; i += batchSize) {
            const batch = taxCodeDropdowns.slice(i, i + batchSize);

            batch.forEach(dropdown => {
                populateTaxCodeDropdownShared(dropdown, sharedTaxCodesOptionsFragment);
            });

            // Browser is able to update UI
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    } finally {
        hideLoading();
    }
}

async function createResult(itemId, row, triggerNext=true) {

    // Get result
    const item = resultMap.get(itemId);
    const result = item.result;

    // Get Taxonomy
    const siteLabel = result.sample.feature.site.label;
    const siteLabelSafe = siteLabel.replace(/\s+/g, '_');
    const taxonomyDropdown = document.getElementById(`taxonomyDropdown_${siteLabelSafe}`);
    const taxonomyLabel = taxonomyDropdown ? taxonomyDropdown.options[taxonomyDropdown.selectedIndex].text : null;

    if (taxonomyLabel) {

        if (result.taxCode == null) {
            // Get taxCode
            const taxCodeDropdown = document.getElementById(`taxCodeDropdown_${item.id}`);
            const taxCodeId = taxCodeDropdown ? taxCodeDropdown.value : null;
            const taxCodeLabel = taxCodeDropdown ? taxCodeDropdown.options[taxCodeDropdown.selectedIndex]?.text : null;

            if (taxCodeId && taxCodeLabel) {
                // Set taxCode
                result.taxCode = {
                        id:       taxCodeId,
                        label:    taxCodeLabel,
                        taxonomy: taxonomyLabel
                };            
            } else {
                if (triggerNext) {
                    toast.info("Please select a 'dante taxCode'.");
                }
                return false;
            }
        }

        // Get fraction
        const fractionAnalyzedCell  = row.cells[5];
        const orgOrMinCell          = row.cells[6];
        const sieveSizeCell         = row.cells[7];

        if (fractionAnalyzedCell.textContent != "") {
            // Set fractionAnalyzed in result
            result.fractionAnalyzed = fractionAnalyzedCell.textContent;
            result.orgOrMin         = orgOrMinCell.textContent
            result.sieveSize        = parseFloat(sieveSizeCell.textContent);

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
            //         toast.info("Please select a classificationConfer (cf)");
            //         return;
            //     }
            // }

            // Get and set RestType
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
                    if (triggerNext) {
                        toast.info("Please select a restType.");
                    }
                    return false;
                }
            }
            // Get and set StateOfPreservation
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
                    if (triggerNext) {
                        toast.info("Please select a stateOfPreservation.");
                    }
                    return false;
                }
            }

            // Only add sampleId to parse JSON in backend correct
            const payload = {
                ...result,
                sample: {
                    id: result.sample.id
                }
            };

            try {
                const response = await fetch(
                    `api/results/createViaMigration/${taxonomyLabel}`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(payload)
                    }
                );
                if (!response.ok) {
                    throw new Error(`HTTP Error! Status: ${response.status}`);
                }
                const data = await response.text();

                if (data == "result already exists") {
                    console.log(data);
                } else {
                    // data is result id
                    console.log("result is created");
                }                

                row.remove();

                if (triggerNext) {
                    tableBodyId = `resultTableBody_${siteLabel}`;
                    createCheckedResults(tableBodyId);
                }
                
                return true;

            } catch (error) {
                console.error('Error:', error);
                alert("Failed to create result.");
            };

        } else {
            if (triggerNext) {
                toast.info("Before you can create a result, you must create the corresponding fraction analysed for the corresponding sample in the ‘Fraction Analyzed’ accordion.");
            }
            return false;
        }
    } else {
        if (triggerNext) {
            toast.info("Please select a 'Taxonomy' for this site.");
        }
        return false;
    }
}

async function createCheckedResults(tableBodyId) {
    const tableBody = document.getElementById(tableBodyId);
    if (tableBody) {
        const checkboxes = Array.from(
            tableBody.querySelectorAll('input[type="checkbox"]:checked')
        );
        const concurrencyLimit = 100;
        showLoading();
        try {
            for (let i = 0; i < checkboxes.length; i += concurrencyLimit) {
                const batch = checkboxes.slice(i, i + concurrencyLimit);

                const promises = batch.map(async checkbox => {
                    if (checkbox.disabled) return true;

                    const row = checkbox.closest('tr');               
                    const itemId = row.dataset.itemId;

                    return createResult(itemId, row, triggerNext = false);
                });

                await Promise.allSettled(promises);
            };
        } finally {
            hideLoading();
        }
    }
}
