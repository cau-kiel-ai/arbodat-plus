function populateLabsAndNumbers(labAndNumberList) {
    populateLabList();

    const c14tableBody = document.getElementById("C14LabAndNumberTableBody");
    const tableBody = document.getElementById("LabAndNumberTableBody");

    // Create lines
    labAndNumberList.forEach(async item => {
        const row = document.createElement("tr");

        const absoluteDatingId = item.absoluteDatingId;
        const datingMethod     = item.datingMethod;
        row.dataset.absoluteDatingId = absoluteDatingId;
        row.dataset.datingMethod     = datingMethod;

        if (datingMethod == "c14Dating") {

            let dropdown = `<select
                                id="c14LabDropdown_${absoluteDatingId}"
                                onchange="updateCheckedDropdowns(this.value, 'C14LabAndNumberTableBody', 'c14LabDropdown_')"
                            >
                                <option value=""></option>
                            </select>`;

            // Add columns
            row.innerHTML = `
                <td><input type="checkbox"></td>
                <td>${item.siteLabel}
                    <br>
                    ${item.featureLabel}
                    <br>
                    ${item.sampleLabel}
                    <br>
                    ${item.subSample}
                </td>
                <td>${item.labAndNumber}</td>
                <td>${dropdown}</td>
                <td>
                    <input
                        type="text"
                        id="labelInput_${absoluteDatingId}"
                        onchange="updateCheckedInputs(this.value, 'C14LabAndNumberTableBody', 'labelInput_')"
                        value=""
                    >
                    <br>
                    <button
                        type="button"
                        style="margin-top: 6px;"
                        data-item='${encodeURIComponent(JSON.stringify(item))}'
                        onclick="addLabelToJSONWithItem(this, 'C14LabCode')"
                    >
                        Add&#8239to&#8239JSON
                    </button>
                </td>
                <td>
                    <input
                        type="text" 
                        id="numberInput_${absoluteDatingId}"
                        value=""
                    >
                </td>                
                <td>
                    <button
                        type="button"
                        onclick="updateAbsDatingWithLabAndNumber('${absoluteDatingId}', '${datingMethod}', this.closest('tr'))"
                    >
                        Update
                    </button>
                </td>
            `;

            c14tableBody.appendChild(row);

            // Select2 dropdown
            $(document).ready(function() {
                $(`#c14LabDropdown_${absoluteDatingId}`).select2({
                    placeholder: '',
                    allowClear: true,
                });

                // remove arrow
                $(`#c14LabDropdown_${absoluteDatingId}`)
                    .next('.select2-container')
                    .find('.select2-selection__arrow')
                    .remove();
            });

            // Populate dropdown
            await fetchDanteAttribute("c14Laboratory");
            populateDanteDropdown("c14Laboratory", document.getElementById(`c14LabDropdown_${absoluteDatingId}`));

        } else {

            // Add columns
            row.innerHTML = `
                <td><input type="checkbox"></td>
                <td>${item.siteLabel}
                    <br>
                    ${item.featureLabel}
                    <br>
                    ${item.sampleLabel}
                    <br>
                    ${item.subSample}
                </td>
                <td>${datingMethod}</td>
                <td>${item.labAndNumber}</td>
                <td>
                    <input 
                        type="text"
                        id="labelInput_${absoluteDatingId}"
                        placeholder=""
                        class="form-control"
                        autocomplete="off"
                        onchange="updateCheckedInputs(this.value, 'LabAndNumberTableBody', 'labelInput_')"
                        value=""
                        list="lab_list"
                    >
                </td>
                <td>
                    <input
                        type="text" 
                        id="numberInput_${absoluteDatingId}"
                        value=""
                    >
                </td>
                <td>
                    <button
                        type="button"
                        onclick="updateAbsDatingWithLabAndNumber('${absoluteDatingId}', '${datingMethod}', this.closest('tr'))"
                    >
                        Update
                    </button>
                </td>
            `;
    
            tableBody.appendChild(row);
        }                        
    });
}

const lab_list = document.getElementById('lab_list');

function populateLabList() {
    // Reset datalist
    lab_list.innerHTML = "";

    // Populate laborytories
    axios.get('api/laboratories')
    .then(response => {
        response.data.forEach(item => {
            // Create option
            const option = document.createElement('option');
            option.value = item.label;
            option.setAttribute("data-id", item.id);

            lab_list.appendChild(option)
        });                
    })
    .catch(error => {
        console.error('Error during laboratory GET request: ', error);
    });
}

async function updateAbsDatingWithLabAndNumber (absoluteDatingId, datingMethod, row, triggerNext=true) {
    // Get numberInput
    const numberInput = document.getElementById(`numberInput_${absoluteDatingId}`);
    const number = numberInput.value.trim();

    if (number) {

        if (datingMethod == "c14Dating") {            
            // Get C14LabCode and label from Dropdown
            const dropdown = document.getElementById(`c14LabDropdown_${absoluteDatingId}`);
            const c14LabId = dropdown ? dropdown.value : null;
            const c14LabLabel = dropdown ? dropdown.options[dropdown.selectedIndex].getAttribute("data-label") : null;

            if (c14LabId || c14LabLabel) {
                
                const payload = {
                    id: c14LabId,
                    label: c14LabLabel
                };

                try {
                    const response = await fetch(
                        `api/absolute_datings/${absoluteDatingId}/updateC14Dating/${number}`,
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
                        const tableBodyId = "C14LabAndNumberTableBody";
                        updateCheckedAbsDatingWithLabAndNumber(tableBodyId);
                    }
                    return true;

                } catch (error) {
                    console.error('Error:', error);
                    alert("Failed to update C14Laboratory.");
                }
            
            } else {
                if (triggerNext) {
                    toast.info(`No existing C14Laboratory selected.`);
                }
                return false;
            }

        } else {
            // Get laboratory input
            const labLabelInput = document.getElementById(`labelInput_${absoluteDatingId}`);
            const labLabel = labLabelInput ? labLabelInput.value.trim() : null;

            if (!labLabel) {
                if (triggerNext) {
                    toast.info(`Either enter a label to create a new laboratory OR select an existing laboratory from the list.`);
                }
                return false;

            } else {
                // Get labId
                const matchedOption = Array.from(lab_list.options).find(opt => opt.value === labLabel);
                const labId = matchedOption ? matchedOption.getAttribute("data-id") : null;

                const payload = {
                    id: labId,
                    label: labLabel,
                };

                try {
                    const response = await fetch(
                        `api/absolute_datings/${absoluteDatingId}/update/${datingMethod}/${number}`,
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
                    populateLabList();                    
                    if (triggerNext) {
                        const tableBodyId = "LabAndNumberTableBody";
                        updateCheckedAbsDatingWithLabAndNumber(tableBodyId);
                    }
                    return true;

                } catch (error) {
                    console.error('Error:', error);
                    alert("Failed to update Laboratory.");
                }
            }
        }

    } else {
        if (triggerNext) {
            toast.info(`No number entered.`);
        }
        return false;
    }
}

async function updateCheckedAbsDatingWithLabAndNumber(tableBodyId) {
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

                    const absoluteDatingId = row.dataset.absoluteDatingId;
                    const datingMethod     = row.dataset.datingMethod;

                    return updateAbsDatingWithLabAndNumber (
                        absoluteDatingId,
                        datingMethod,
                        row,
                        triggerNext = false
                    );
                });

                await Promise.allSettled(promises);
            };
        } finally {
            hideLoading();
        }
    }
}
