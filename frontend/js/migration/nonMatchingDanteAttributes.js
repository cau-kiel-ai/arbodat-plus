function populateNonMatchingDanteAttributes(nonMatchingDanteAttributeList) {    
    // Site attributes
    const siteTypeTableBody = document.getElementById("siteTypeTableBody");
    const naturalUnitTableBody = document.getElementById("naturalUnitTableBody");
    // Feature attributes
    const featureTypeTableBody = document.getElementById("featureTypeTableBody");
    const preservationConditionTableBody = document.getElementById("preservationConditionTableBody");
    // Sample attributes
    const sampleTypeTableBody = document.getElementById("sampleTypeTableBody");
    const chronozoneTableBody = document.getElementById("chronozoneTableBody");
    const archaeologicalDatingTableBody = document.getElementById("archaeologicalDatingTableBody");
    const culturalGroupTableBody = document.getElementById("culturalGroupTableBody");
    const seedsAndFruitsTableBody = document.getElementById("seedsAndFruitsTableBody");
    const charcoalInvestigatedTableBody = document.getElementById("charcoalInvestigatedTableBody");
    const woodSubfossileTableBody = document.getElementById("woodSubfossileTableBody");
    // AbsoluteDating attributes
    const materialTableBody = document.getElementById("materialTableBody");
    const datingMethodTableBody = document.getElementById("datingMethodTableBody");

    // Create lines
    nonMatchingDanteAttributeList.forEach(async item => {
        const row = document.createElement("tr");

        const id        = item.id;
        const attribute = item.attribute;
        row.dataset.id        = id;
        row.dataset.attribute = attribute;

        let dropdown;

        switch (attribute) {

            case ("siteType"):

                dropdown = `<select id="danteDropdown_${id}_${attribute}"
                                    multiple
                                    style="width: 100%"
                                    onchange="updateCheckedDropdownsMultiple(Array.from(this.selectedOptions).map(option => option.value),
                                                                             'siteTypeTableBody',
                                                                             'danteDropdown_')">
                            </select>`;

                // Add columns
                row.innerHTML = `
                    <td><input type="checkbox"></td>
                    <td>${item.type}</td>
                    <td>${item.label}</td>
                    <td>
                        ${item.nonMatchingLabel}
                        <br>
                        <button type="button"
                                onclick="addLabelToJSON('${id}', '${attribute}', '${item.nonMatchingLabel}', event.currentTarget)">
                                Add&#8239to&#8239JSON
                        </button>
                    </td>
                    <td>${dropdown}</td>
                    <td>
                        <button type="button"
                                onclick="updateAttributes('${id}', '${attribute}', this.closest('tr'))">
                                Update
                        </button>
                    </td>
                `;

                siteTypeTableBody.appendChild(row);                
                
                // Populate Dropdown
                await fetchDanteAttribute(attribute);
                populateDanteDropdown (attribute, document.getElementById(`danteDropdown_${id}_${attribute}`));

                break;

            case "naturalUnit":

                dropdown = `<select id="danteDropdown_${id}_${attribute}"
                                    style="width: 100%;"
                                    onchange="updateCheckedDropdowns(this.value, 'naturalUnitTableBody', 'danteDropdown_')">
                                    <option value=""></option>
                            </select>`;

                // Add columns
                row.innerHTML = `
                    <td><input type="checkbox"></td>
                    <td>${item.type}</td>
                    <td>${item.label}</td>
                    <td>
                        ${item.nonMatchingLabel}
                        <br>
                        <button type="button"
                                onclick="addLabelToJSON('${id}', '${attribute}', '${item.nonMatchingLabel}', event.currentTarget)">
                                Add&#8239to&#8239JSON
                        </button>
                    </td>
                    <td>${dropdown}</td>
                    <td>
                        <button type="button"
                                onclick="updateAttribute('${id}', '${attribute}', this.closest('tr'))">
                                Update
                        </button>
                    </td>
                `;

                naturalUnitTableBody.appendChild(row);

                // Populate Dropdown
                await fetchDanteAttribute(attribute);
                populateDanteDropdown (attribute, document.getElementById(`danteDropdown_${id}_${attribute}`));

                break;

            case ("featureType"):

                dropdown = `<select id="danteDropdown_${id}_${attribute}"
                                    style="width: 100%"
                                    onchange="updateCheckedDropdowns(this.value, 'featureTypeTableBody', 'danteDropdown_')">
                                    <option value=""></option>
                            </select>`;

                // Add columns
                row.innerHTML = `
                    <td><input type="checkbox"></td>
                    <td>${item.type}</td>
                    <td>${item.label}</td>
                    <td>
                        ${item.nonMatchingLabel}
                        <br>
                        <button type="button"
                                onclick="addLabelToJSON('${id}', '${attribute}', '${item.nonMatchingLabel}', event.currentTarget)">
                                Add&#8239to&#8239JSON
                        </button>
                    </td>
                    <td>${dropdown}</td>
                    <td>
                        <button type="button"
                                onclick="updateAttribute('${id}', '${attribute}', this.closest('tr'))">
                                Update
                        </button>
                    </td>
                `;

                featureTypeTableBody.appendChild(row);
                
                // Populate Dropdown
                await fetchDanteAttribute(attribute);
                populateDanteDropdown (attribute, document.getElementById(`danteDropdown_${id}_${attribute}`));

                break;

            case ("preservationCondition"):

                dropdown = `<select id="danteDropdown_${id}_${attribute}"
                                    style="width: 100%"
                                    onchange="updateCheckedDropdowns(this.value, 'preservationConditionTableBody', 'danteDropdown_')">
                                    <option value=""></option>
                            </select>`;

                // Add columns
                row.innerHTML = `
                    <td><input type="checkbox"></td>
                    <td>${item.type}</td>
                    <td>${item.label}</td>
                    <td>
                        ${item.nonMatchingLabel}
                        <br>
                        <button type="button"
                                onclick="addLabelToJSON('${id}', '${attribute}', '${item.nonMatchingLabel}', event.currentTarget)">
                                Add&#8239to&#8239JSON
                        </button>
                    </td>
                    <td>${dropdown}</td>
                    <td>
                        <button type="button"
                                onclick="updateAttribute('${id}', '${attribute}', this.closest('tr'))">
                                Update
                        </button>
                    </td>
                `;

                preservationConditionTableBody.appendChild(row);

                // Populate Dropdown
                await fetchDanteAttribute(attribute);
                populateDanteDropdown (attribute, document.getElementById(`danteDropdown_${id}_${attribute}`));

                break;

            case ("sampleType"):
                
                dropdown = `<select id="danteDropdown_${id}_${attribute}"
                                    style="width: 100%"
                                    onchange="updateCheckedDropdowns(this.value, 'sampleTypeTableBody', 'danteDropdown_')">
                                    <option value=""></option>
                            </select>`;

                // Add columns
                row.innerHTML = `
                    <td><input type="checkbox"></td>
                    <td>${item.type}</td>
                    <td>${item.label}</td>
                    <td>
                        ${item.nonMatchingLabel}
                        <br>
                        <button type="button"
                                onclick="addLabelToJSON('${id}', '${attribute}', '${item.nonMatchingLabel}', event.currentTarget)">
                                Add&#8239to&#8239JSON
                        </button>
                    </td>
                    <td>${dropdown}</td>
                    <td>
                        <button type="button"
                                onclick="updateAttribute('${id}', '${attribute}', this.closest('tr'))">
                                Update
                        </button>
                    </td>
                `;

                sampleTypeTableBody.appendChild(row);

                // Populate Dropdown
                await fetchDanteAttribute(attribute);
                populateDanteDropdown (attribute, document.getElementById(`danteDropdown_${id}_${attribute}`));

                break;

            case ("chronozone"):

                dropdown = `<select id="danteDropdown_${id}_${attribute}"
                                    style="width: 100%"
                                    onchange="updateCheckedDropdowns(this.value, 'chronozoneTableBody', 'danteDropdown_')">
                                    <option value=""></option>
                            </select>`;

                // Add columns
                row.innerHTML = `
                    <td><input type="checkbox"></td>
                    <td>${item.type}</td>
                    <td>${item.label}</td>
                    <td>
                        ${item.nonMatchingLabel}
                        <br>
                        <button type="button"
                                onclick="addLabelToJSON('${id}', '${attribute}', '${item.nonMatchingLabel}', event.currentTarget)">
                                Add&#8239to&#8239JSON
                        </button>
                    </td>
                    <td>${dropdown}</td>
                    <td>
                        <button type="button"
                                onclick="updateAttribute('${id}', '${attribute}', this.closest('tr'))">
                                Update
                        </button>
                    </td>
                `;

                chronozoneTableBody.appendChild(row);

                // Populate Dropdown
                await fetchDanteAttribute(attribute);
                populateDanteDropdown (attribute, document.getElementById(`danteDropdown_${id}_${attribute}`));

                break;

            // case ("archaeologicalDating"):

            //     dropdown = `<select id="danteDropdown_${id}_${attribute}"
            //                         style="width: 100%"
            //                         onchange="updateCheckedDropdowns(this.value, 'archaeologicalDatingTableBody', 'danteDropdown_')">
            //                         <option value=""></option>
            //                 </select>`;

            //     // Add columns
            //     row.innerHTML = `
            //         <td><input type="checkbox"></td>
            //         <td>${item.type}</td>
            //         <td>${item.label}</td>
            //         <td>
            //             ${item.nonMatchingLabel}
            //             <br>
            //             <button type="button"
            //                     onclick="addLabelToJSON('${id}', '${attribute}', '${item.nonMatchingLabel}', event.currentTarget)">
            //                     Add&#8239to&#8239JSON
            //             </button>
            //         </td>
            //         <td>${dropdown}</td>
            //         <td>
            //             <button type="button"
            //                     onclick="updateAttribute('${id}', '${attribute}', this.closest('tr'))">
            //                     Update
            //             </button>
            //         </td>
            //     `;

            //     archaeologicalDatingTableBody.appendChild(row);

            //     // Populate Dropdown
            //     await fetchDanteAttribute(attribute);
            //     populateDanteDropdown (attribute, document.getElementById(`danteDropdown_${id}_${attribute}`));

            //     break;

            // case ("culturalGroup"):

            //     dropdown = `<select id="danteDropdown_${id}_${attribute}"
            //                         style="width: 100%"
            //                         onchange="updateCheckedDropdowns(this.value, 'culturalGroupTableBody', 'danteDropdown_')">
            //                         <option value=""></option>
            //                 </select>`;

            //     // Add columns
            //     row.innerHTML = `
            //         <td><input type="checkbox"></td>
            //         <td>${item.type}</td>
            //         <td>${item.label}</td>
            //         <td>
            //             ${item.nonMatchingLabel}
            //             <br>
            //             <button type="button"
            //                     onclick="addLabelToJSON('${id}', '${attribute}', '${item.nonMatchingLabel}', event.currentTarget)">
            //                     Add&#8239to&#8239JSON
            //             </button>
            //         </td>
            //         <td>${dropdown}</td>
            //         <td>
            //             <button type="button"
            //                     onclick="updateAttribute('${id}', '${attribute}', this.closest('tr'))">
            //                     Update
            //             </button>
            //         </td>
            //     `;

            //     culturalGroupTableBody.appendChild(row);

            //     // Populate Dropdown
            //     await fetchDanteAttribute(attribute);
            //     populateDanteDropdown (attribute, document.getElementById(`danteDropdown_${id}_${attribute}`));

            //     break;

            case ("seedsAndFruits"):

                dropdown = `<select id="danteDropdown_${id}_${attribute}"
                                    style="width: 100%"
                                    onchange="updateCheckedDropdowns(this.value, 'seedsAndFruitsTableBody', 'danteDropdown_')">
                                    <option value=""></option>
                            </select>`;

                // Add columns
                row.innerHTML = `
                    <td><input type="checkbox"></td>
                    <td>${item.type}</td>
                    <td>${item.label}</td>
                    <td>
                        ${item.nonMatchingLabel}
                        <br>
                        <button type="button"
                                onclick="addLabelToJSON('${id}', '${attribute}', '${item.nonMatchingLabel}', event.currentTarget)">
                                Add&#8239to&#8239JSON
                        </button>
                    </td>
                    <td>${dropdown}</td>
                    <td>
                        <button type="button"
                                onclick="updateAttribute('${id}', '${attribute}', this.closest('tr'))">
                                Update
                        </button>
                    </td>
                `;

                seedsAndFruitsTableBody.appendChild(row);

                // Populate Dropdown
                await fetchDanteAttribute(attribute);
                populateDanteDropdown (attribute, document.getElementById(`danteDropdown_${id}_${attribute}`));

                break;

            case ("charcoalInvestigated"):

                dropdown = `<select id="danteDropdown_${id}_${attribute}"
                                    style="width: 100%"
                                    onchange="updateCheckedDropdowns(this.value, 'charcoalInvestigatedTableBody', 'danteDropdown_')">
                                    <option value=""></option>
                            </select>`;

                // Add columns
                row.innerHTML = `
                    <td><input type="checkbox"></td>
                    <td>${item.type}</td>
                    <td>${item.label}</td>
                    <td>
                        ${item.nonMatchingLabel}
                        <br>
                        <button type="button"
                                onclick="addLabelToJSON('${id}', '${attribute}', '${item.nonMatchingLabel}', event.currentTarget)">
                                Add&#8239to&#8239JSON
                        </button>
                    </td>
                    <td>${dropdown}</td>
                    <td>
                        <button type="button"
                                onclick="updateAttribute('${id}', '${attribute}', this.closest('tr'))">
                                Update
                        </button>
                    </td>
                `;

                charcoalInvestigatedTableBody.appendChild(row);

                // Populate Dropdown
                await fetchDanteAttribute(attribute);
                populateDanteDropdown (attribute, document.getElementById(`danteDropdown_${id}_${attribute}`));

                break;

            case ("woodSubfossile"):

                dropdown = `<select id="danteDropdown_${id}_${attribute}"
                                    style="width: 100%"
                                    onchange="updateCheckedDropdowns(this.value, 'woodSubfossileTableBody', 'danteDropdown_')">
                                    <option value=""></option>
                            </select>`;

                // Add columns
                row.innerHTML = `
                    <td><input type="checkbox"></td>
                    <td>${item.type}</td>
                    <td>${item.label}</td>
                    <td>
                        ${item.nonMatchingLabel}
                        <br>
                        <button type="button"
                                onclick="addLabelToJSON('${id}', '${attribute}', '${item.nonMatchingLabel}', event.currentTarget)">
                                Add&#8239to&#8239JSON
                        </button>
                    </td>
                    <td>${dropdown}</td>
                    <td>
                        <button type="button"
                                onclick="updateAttribute('${id}', '${attribute}', this.closest('tr'))">
                                Update
                        </button>
                    </td>
                `;

                woodSubfossileTableBody.appendChild(row);

                // Populate Dropdown
                await fetchDanteAttribute(attribute);
                populateDanteDropdown (attribute, document.getElementById(`danteDropdown_${id}_${attribute}`));

                break;

            case ("material"):

                dropdown = `<select id="danteDropdown_${id}_${attribute}"
                                    style="width: 100%"
                                    onchange="updateCheckedDropdowns(this.value, 'materialTableBody', 'danteDropdown_')">
                                    <option value=""></option>
                            </select>`;

                // Add columns
                row.innerHTML = `
                    <td><input type="checkbox"></td>
                    <td>${item.type}</td>
                    <td>${item.label}</td>
                    <td>
                        ${item.nonMatchingLabel}
                        <br>
                        <button type="button"
                                onclick="addLabelToJSON('${id}', '${attribute}', '${item.nonMatchingLabel}', event.currentTarget)">
                                Add&#8239to&#8239JSON
                        </button>
                    </td>
                    <td>${dropdown}</td>
                    <td>
                        <button type="button"
                                onclick="updateAttribute('${id}', '${attribute}', this.closest('tr'))">
                                Update
                        </button>
                    </td>
                `;

                materialTableBody.appendChild(row);

                // Populate Dropdown
                await fetchDanteAttribute(attribute);
                populateDanteDropdown (attribute, document.getElementById(`danteDropdown_${id}_${attribute}`));

                break;

            case ("datingMethod"):

                dropdown = `<select id="danteDropdown_${id}_${attribute}"
                                    style="width: 100%"
                                    onchange="updateCheckedDropdowns(this.value, 'datingMethodTableBody', 'danteDropdown_')">
                                    <option value=""></option>
                            </select>`;

                // Add columns
                row.innerHTML = `
                    <td><input type="checkbox"></td>
                    <td>${item.type}</td>
                    <td>${item.label}</td>
                    <td>
                        ${item.nonMatchingLabel}
                        <br>
                        <button type="button"
                                onclick="addLabelToJSON('${id}', '${attribute}', '${item.nonMatchingLabel}', event.currentTarget)">
                                Add&#8239to&#8239JSON
                        </button>
                    </td>
                    <td>${dropdown}</td>
                    <td>
                        <button type="button"
                                onclick="updateAttribute('${id}', '${attribute}', this.closest('tr'))">
                                Update
                        </button>
                    </td>
                `;

                datingMethodTableBody.appendChild(row);

                // Populate Dropdown
                await fetchDanteAttribute(attribute);
                populateDanteDropdown (attribute, document.getElementById(`danteDropdown_${id}_${attribute}`));

                break;
        }

        if (attribute === "siteType") {
            // Select2 Multi-select boxes (pillbox)
            $(`#danteDropdown_${id}_${attribute}`).select2({
                placeholder: 'select',
                allowClear: true,
                templateSelection: function(item) {
                    return (item.text || '').trim();
                }
            });
        } else {
            // Select2 dropdown
            $(`#danteDropdown_${id}_${attribute}`).select2({
                placeholder: 'select',
                allowClear: true,
                templateSelection: function(item) {
                    return (item.text || '').trim();
                }
            });
            // remove arrow
            $(`#danteDropdown_${id}_${attribute}`)
                .next('.select2-container')
                .find('.select2-selection__arrow')
                .remove();
        }
    });

    // if tbody empty hide tables
    // else display
    tbodyList = [siteTypeTableBody, naturalUnitTableBody, featureTypeTableBody,
                 preservationConditionTableBody, sampleTypeTableBody, chronozoneTableBody,
                 seedsAndFruitsTableBody, charcoalInvestigatedTableBody, woodSubfossileTableBody,
                 archaeologicalDatingTableBody, culturalGroupTableBody,
                 materialTableBody, datingMethodTableBody];
    tbodyList.forEach(tbody => {
        hideTableIfTbodyEmpty(tbody);
    });
}

async function updateAttributes(id, attribute, row, triggerNext=true) {
    // For multiple selection (only siteTypes)

    const dropdown = document.getElementById(`danteDropdown_${id}_${attribute}`);
    const attributeIds = Array.from(dropdown.selectedOptions).map(option => option.value);
    const attributeLabels = Array.from(dropdown.selectedOptions).map(option => option.getAttribute("data-label"));

    if (attributeIds.length > 0 && attributeLabels.length > 0) {
        let url = "";
        let payload = []

        if (attribute == "siteType") {            
            url = `api/sites/${id}/updateSiteTypes`;
            
            payload = attributeIds.map((id, index) => ({
                id: id,
                label: attributeLabels[index]
            }));

            try {
                const response = await fetch(
                    url,
                    {
                        method: 'PUT',
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
                console.log(data);

                row.remove();
                if (triggerNext) {
                    const tableBodyId = "siteTypeTableBody";
                    updateCheckedAttributes(tableBodyId, siteType=true);
                }
                return true;

            } catch (error) {
                console.error('Error:', error);
                alert("Failed to update DANTE Attribute.");
            }
        }

    } else {
        if (triggerNext) {
            toast.info(`No ${attribute} selected.`);
        }
        return false;
    }
}

async function updateAttribute(id, attribute, row, triggerNext=true) {
    const dropdown = document.getElementById(`danteDropdown_${id}_${attribute}`);
    const attributeId = dropdown ? dropdown.value : null;
    const attributeLabel = dropdown ? dropdown.options[dropdown.selectedIndex].getAttribute("data-label") : null;

    if (attributeId && attributeLabel) {

        const payload = {
            id: attributeId,
            label: attributeLabel
        };

        let url = "";
        let tableBodyId = null;
        switch (attribute) {
            // site
            case ("naturalUnit"):
                url = `api/sites/${id}/updateNaturalUnit`;  
                tableBodyId = "naturalUnitTableBody";
                break;

            // feature
            case ("featureType"):
                url = `api/features/${id}/updateFeatureType`;
                tableBodyId = "featureTypeTableBody";
                break;
            
            case ("preservationCondition"):
                url = `api/features/${id}/updatePreservationCondition`;
                tableBodyId = "preservationConditionTableBody";
                break;

            // sample
            case ("sampleType"):
                url = `api/samples/${id}/updateSampleType`;
                tableBodyId = "sampleTypeTableBody";
                break;

            case ("chronozone"):
                url = `api/samples/${id}/updateChronozone`;
                tableBodyId = "chronozoneTableBody";
                break;

            // case ("archaeologicalDating"):
            //     url = `api/samples/${id}/updateArchaeologicalDating`;
            //     tableBodyId = "archaeologicalDatingTableBody";
            //     break;

            // case ("culturalGroup"):
            //     url = `api/samples/${id}/updateCulturalGroup`;
            //     tableBodyId = "culturalGroupTableBody";
            //     break;

            case ("seedsAndFruits"):
                url = `api/samples/${id}/updateSeedsAndFruits`;
                tableBodyId = "seedsAndFruitsTableBody";
                break;

            case ("charcoalInvestigated"):
                url = `api/samples/${id}/updateCharcoalInvestigated`;
                tableBodyId = "charcoalInvestigatedTableBody";
                break;

            case ("woodSubfossile"):
                url = `api/samples/${id}/updateWoodSubfossile`;
                tableBodyId = "woodSubfossileTableBody";
                break;

            // absoluteDating
            case ("datingMethod"):
                url = `api/absolute_datings/${id}/updateDatingMethod`;
                tableBodyId = "datingMethodTableBody";
                break;

            case ("material"):
                url = `api/absolute_datings/${id}/updateMaterial`;
                tableBodyId = "materialTableBody";
                break;
            
            default:
                console.error("Unknown attribute");
                return;
        }

        try {
            const response = await fetch(
                url,
                {
                    method: 'PUT',
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
            console.log(data);
            
            row.remove();
            if (triggerNext) { updateCheckedAttributes(tableBodyId); }
            return true;

        } catch (error) {
            console.error('Error:', error);
            alert("Failed to update DANTE Attribute.");
        }

    } else {
        if (triggerNext) {
            toast.info(`No ${attribute} selected.`);
        }
        return false;
    }
}

async function updateCheckedAttributes(tableBodyId, siteType=false) {
    const tableBody = document.getElementById(tableBodyId);
    if (tableBody) {
        const checkboxes = Array.from(tableBody.querySelectorAll('input[type="checkbox"]:checked'));
        const concurrencyLimit = 100;
        showLoading();
        try {
            for (let i = 0; i < checkboxes.length; i += concurrencyLimit) {
                const batch = checkboxes.slice(i, i + concurrencyLimit);

                const promises = batch.map(async checkbox => {
                    if (checkbox.disabled) return true;

                    const row = checkbox.closest('tr');    
                    const id        = row.dataset.id;
                    const attribute = row.dataset.attribute;
    
                    if (siteType) {
                        return updateAttributes(id, attribute, row, triggerNext = false);
                    } else {
                        return updateAttribute(id, attribute, row, triggerNext = false);
                    }
                });

                await Promise.allSettled(promises);
            };
        } finally {
            hideLoading();
        }
    }
}
