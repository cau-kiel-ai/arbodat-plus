function populateCoordinates(coordinateList) {
    const siteTableBody = document.getElementById("siteCoordinateTableBody");
    const sampleTableBody = document.getElementById("sampleCoordinateTableBody");
    
    // Create lines
    coordinateList.forEach(async item => {
        const type = item.type;

        const row = document.createElement("tr");
        row.dataset.itemType = type;
        row.dataset.itemId = item.id;
        row.dataset.coordinateSystem = item.coordinateSystem;

        if (type == "site") {

            let dropdown = `<select id="coordinateSystemDropdown_${type}_${item.id}"
                                    onchange="updateCheckedDropdowns(this.value, 'siteCoordinateTableBody', 'coordinateSystemDropdown_')">
                                    <option value=""></option>
                            </select>`;

            // Add columns
            row.innerHTML = `
                <td><input type="checkbox"></td>
                <td>${escapeHtml(item.label)}</td>
                <td>
                    <input type="text" 
                           id="longitudeInput_${type}_${item.id}" 
                           value="${escapeHtml(item.longitude)}"
                           style="font-size: 10px; padding-top: 16px; padding-bottom: 16px; ">
                </td>
                <td>
                    <input type="text" 
                           id="latitudeInput_${type}_${item.id}" 
                           value="${escapeHtml(item.latitude)}"
                           style="font-size: 10px; padding-top: 16px; padding-bottom: 16px;">
                </td>
                <td>
                    <input type="text" 
                           id="altitudeInput_${type}_${item.id}" 
                           value="${escapeHtml(item.altitude)}"
                           style="font-size: 10px; padding-top: 16px; padding-bottom: 16px;">
                </td>
                <td>
                    ${escapeHtml(item.coordinateSystem)}
                    <br>
                        <button type="button"
                                data-item='${encodeRowItem(item)}'
                                onclick="addLabelToJSONWithItem(this, 'coordinateSystemSite')">
                                Add&#8239to&#8239JSON
                        </button>
                </td>
                <td>${dropdown}</td>
                <td>
                    <input type="text" 
                           id="longitudeWGS84Input_${type}_${item.id}" 
                           value=""
                           style="font-size: 10px; padding-top: 16px; padding-bottom: 16px;">
                </td>
                <td>
                    <input type="text" 
                           id="latitudeWGS84Input_${type}_${item.id}" 
                           value=""
                           style="font-size: 10px; padding-top: 16px; padding-bottom: 16px;">
                </td>
                <td style="width: 200px">
                    <textarea id="remarksInput_${type}_${item.id}" 
                              style="font-size: 10px; width: 100%; height: 65px;">
                    </textarea>        
                </td>
                <td>
                    <button type = "button"
                            onclick="createCoordinate('${type}', '${item.id}', this.closest('tr'))">
                            Create
                    </button>
                </td>
            `;            

            siteTableBody.appendChild(row);

            // Set value of remarks textarea
            document.getElementById(`remarksInput_${type}_${item.id}`).value = item.remarks;

            // Handle coordinate input            
            // --------------------- customise here ---------------------
            const coordinate_system_dropdown = document.getElementById(`coordinateSystemDropdown_${type}_${item.id}`);
            const longitude_input = document.getElementById(`longitudeInput_${type}_${item.id}`);
            const latitude_input  = document.getElementById(`latitudeInput_${type}_${item.id}`);
            
            let inputTimer;
            const lon_wgs84 = document.getElementById(`longitudeWGS84Input_${type}_${item.id}`);
            const lat_wgs84 = document.getElementById(`latitudeWGS84Input_${type}_${item.id}`);
            // ----------------------------------------------------------

            await fetchDanteAttribute("coordinateSystem");
            populateDanteDropdown ("coordinateSystem", coordinate_system_dropdown);

            $(`#coordinateSystemDropdown_${type}_${item.id}`).on('change', handleCoordinateInput);
            longitude_input.addEventListener("input", () => {
                handleCoordinateInput();
            });
            latitude_input.addEventListener("input", () => {
                handleCoordinateInput();
            });
            
            async function handleCoordinateInput() {
                if (inputTimer) {
                    clearTimeout(inputTimer);
                }
                inputTimer = setTimeout(async () => {
            
                    // Parse input
                    const longitude = parseDecimal(longitude_input.value);
                    const latitude = parseDecimal(latitude_input.value);
                    const coordinateSystem = coordinate_system_dropdown.options[coordinate_system_dropdown.selectedIndex];
                    let sourceEPSG = coordinateSystem?.getAttribute('data-crsNotation');
                
                    if (isCoordinateValue(longitude_input.value) && isCoordinateValue(latitude_input.value) && sourceEPSG && sourceEPSG !== "undefined") {
                        try {
                            // transform coordinates to WGS84
                            const { transformedLatitude, transformedLongitude } =
                            await transformCoordinatesToWGS84(longitude, latitude, sourceEPSG);
            
                            if (!isNaN(transformedLatitude) && !isNaN(transformedLongitude) && transformedLatitude != null) { // Update wgs84 fields
                                lat_wgs84.value = transformedLatitude;
                                lon_wgs84.value = transformedLongitude;
                            }
                        } catch { // Clear wgs84 fields
                            console.log("failed to transform coordinates to WGS84");
                        }
                    }  
                }, 1000);  // ms
            }

        } else if (type == "sample") {

            let dropdown = `<select id="coordinateSystemDropdown_${type}_${item.id}"
                                    onchange="updateCheckedDropdowns(this.value, 'sampleCoordinateTableBody', 'coordinateSystemDropdown_')">
                                    <option value=""></option>
                            </select>`;

            // Add columns
            row.innerHTML = `
                <td><input type="checkbox"></td>
                <td>${escapeHtml(item.siteLabel)}
                    <br>
                    ${escapeHtml(item.featureLabel)}
                    <br>
                    ${escapeHtml(item.label)}
                </td>                
                <td>
                    <input type="text" 
                           id="longitudeInput_${type}_${item.id}" 
                           value="${escapeHtml(item.longitude)}"
                           style="font-size: 10px; padding-top: 16px; padding-bottom: 16px; ">
                </td>
                <td>
                    <input type="text" 
                           id="latitudeInput_${type}_${item.id}" 
                           value="${escapeHtml(item.latitude)}"
                           style="font-size: 10px; padding-top: 16px; padding-bottom: 16px; ">
                </td>
                <td>
                    <input type="text" 
                           id="altitudeInput_${type}_${item.id}" 
                           value="${escapeHtml(item.altitude)}"
                           style="font-size: 10px; padding-top: 16px; padding-bottom: 16px; ">
                </td>
                <td style="padding-top: 20px;">${escapeHtml(item.zcoordinate)}</td>
                <td>
                    ${escapeHtml(item.coordinateSystem)}
                    <br>
                    <button type="button"
                                data-item='${encodeRowItem(item)}'
                                onclick="addLabelToJSONWithItem(this, 'coordinateSystemSample')">
                                Add&#8239to&#8239JSON
                    </button>
                </td>
                <td>${dropdown}</td>
                <td>
                    <input type="text" 
                           id="longitudeWGS84Input_${type}_${item.id}" 
                           value=""
                           style="font-size: 10px; padding-top: 16px; padding-bottom: 16px; ">
                </td>
                <td>
                    <input type="text" 
                           id="latitudeWGS84Input_${type}_${item.id}" 
                           value=""
                           style="font-size: 10px; padding-top: 16px; padding-bottom: 16px; ">
                </td>
                <td style="width: 200px">
                    <textarea id="remarksInput_${type}_${item.id}" 
                              style="font-size: 10px; width: 100%; height: 65px;">
                    </textarea>        
                </td>
                <td>
                    <button type = "button"
                            onclick="createCoordinate('${type}', '${item.id}', this.closest('tr'))">
                            Create
                    </button>
                </td>
            `;

            sampleTableBody.appendChild(row);

            // Set value of remarks textarea
            document.getElementById(`remarksInput_${type}_${item.id}`).value = item.remarks;

            // Handle coordinate input
            // --------------------- customise here ---------------------
            const coordinate_system_dropdown = document.getElementById(`coordinateSystemDropdown_${type}_${item.id}`);
            const longitude_input = document.getElementById(`longitudeInput_${type}_${item.id}`);
            const latitude_input  = document.getElementById(`latitudeInput_${type}_${item.id}`);
            
            let inputTimer;
            const lon_wgs84 = document.getElementById(`longitudeWGS84Input_${type}_${item.id}`);
            const lat_wgs84 = document.getElementById(`latitudeWGS84Input_${type}_${item.id}`);
            // ----------------------------------------------------------

            await fetchDanteAttribute("coordinateSystem");
            populateDanteDropdown ("coordinateSystem", coordinate_system_dropdown);

            $(`#coordinateSystemDropdown_${type}_${item.id}`).on('change', handleCoordinateInput);
            longitude_input.addEventListener("input", () => {
                handleCoordinateInput();
            });
            latitude_input.addEventListener("input", () => {
                handleCoordinateInput();
            });
            
            async function handleCoordinateInput() {
                if (inputTimer) {
                    clearTimeout(inputTimer);
                }
                inputTimer = setTimeout(async () => {
            
                    // Parse input
                    const longitude = parseDecimal(longitude_input.value);
                    const latitude = parseDecimal(latitude_input.value);
                    const coordinateSystem = coordinate_system_dropdown.options[coordinate_system_dropdown.selectedIndex];
                    let sourceEPSG = coordinateSystem?.getAttribute('data-crsNotation');
                
                    if (isCoordinateValue(longitude_input.value) && isCoordinateValue(latitude_input.value) && sourceEPSG != null) {
                        try {
                            // transform coordinates to WGS84
                            const { transformedLatitude, transformedLongitude } =
                            await transformCoordinatesToWGS84(longitude, latitude, sourceEPSG);
            
                            if (!isNaN(transformedLatitude) && !isNaN(transformedLongitude) && transformedLatitude != null) { // Update wgs84 fields
                                lat_wgs84.value = transformedLatitude;
                                lon_wgs84.value = transformedLongitude;
                            }
                        } catch { // Clear wgs84 fields
                            console.log("failed to transform coordinates to WGS84");
                        }
                    }  
                }, 1000);  // ms
            }
        }
        // Select2 coordinate system dropdown ---------------------
        $(`#coordinateSystemDropdown_${type}_${item.id}`).select2({
            placeholder: 'select',
        });
        // remove arrow
        $(`#coordinateSystemDropdown_${type}_${item.id}`)
            .next('.select2-container')
            .find('.select2-selection__arrow')
            .remove();
        // --------------------------------------------------------
    });
}

$(document).on('select2:open', 'select[id^="coordinateSystemDropdown_"]', function (e) {
    applySelect2Styles($(e.target));
});

$(document).on('change', 'select[id^="coordinateSystemDropdown_"]', function (e) {
    applySelect2Styles($(e.target));
});

function applySelect2Styles($select) {
    const $container = $select.next('.select2-container');

    $container.css({
        width: '100%'
    });
    $container.find('.select2-selection__rendered').css({
        fontSize: '10px'
    });
    $container.find('.select2-selection--single').css({
        height: '43px'
    });

    const $dropdown = $('.select2-container--open .select2-dropdown');
    $dropdown.css({
        minWidth: '300px'
    });
}

// Reads the coordinate of a row. Returns { payload } or { errors }: [{ input, message }], one per field
function readCoordinateInputs(itemType, itemId) {
    const input = name => document.getElementById(`${name}_${itemType}_${itemId}`);
    const errors = [];

    // A number; required: an empty field is an error as well
    const number = (name, label, required) => {
        const field = input(name);
        const value = field ? field.value : "";
        if (String(value).trim() === "") {
            if (required) errors.push({ input: field, message: `${label}: required` });
            return null;
        }
        const parsed = parseDecimal(value);
        if (parsed === null) errors.push({ input: field, message: `${label}: '${value.trim()}' is not a number` });
        return parsed;
    };

    const longitude      = number("longitudeInput", "longitude", true);
    const latitude       = number("latitudeInput", "latitude", true);
    const altitude       = number("altitudeInput", "altitude", false);
    const longitudeWgs84 = number("longitudeWGS84Input", "longitude WGS84", false);
    const latitudeWgs84  = number("latitudeWGS84Input", "latitude WGS84", false);

    const dropdown = input("coordinateSystemDropdown");
    const coordinateSystemId = dropdown ? dropdown.value : "";
    if (!coordinateSystemId) {
        errors.push({ input: dropdown, message: "coordinate system: required" });
    }

    if (errors.length > 0) return { errors };

    const remarksInput = input("remarksInput");
    return {
        payload: {
            longitude, longitudeWgs84, latitude, latitudeWgs84, altitude,
            remarksCoordinate: remarksInput ? remarksInput.value : null,
            coordinateSystem: {
                id:    coordinateSystemId,
                label: dropdown.options[dropdown.selectedIndex].text
            }
        }
    };
}

// Shows the messages of the last 'Create' below the button and marks the fields; no errors: clears them
function showCoordinateErrors(row, errors) {
    row.querySelectorAll(".coordinate-invalid").forEach(field => {
        field.classList.remove("coordinate-invalid");
        field.removeAttribute("title");
    });
    row.querySelector(".coordinate-errors")?.remove();
    if (errors.length === 0) return;

    errors.forEach(({ input, message }) => {
        if (!input) return;
        input.classList.add("coordinate-invalid");
        input.title = message;
    });
    const list = document.createElement("div");
    list.className = "coordinate-errors text-danger small text-wrap";
    errors.forEach(({ message }) => {
        const line = document.createElement("div");
        line.textContent = message;
        list.appendChild(line);
    });
    row.lastElementChild.appendChild(list);
}

// Creates the coordinate of a row. triggerNext: the 'Create' button of the row was clicked, the other
// selected rows are created afterwards. Returns true if it was created.
async function createCoordinate(itemType, itemId, row, triggerNext = true) {
    const { payload, errors } = readCoordinateInputs(itemType, itemId);
    if (errors) {
        showCoordinateErrors(row, errors);
        if (triggerNext) toast.info(errors.map(error => error.message).join(", "));
        return false;
    }

    try {
        const response = await fetch(`api/coordinates/${itemType}/${itemId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            // The backend names the field, if it can't read a value (see RequestBodyExceptionHandler)
            const message = (await response.text()) || `HTTP Error! Status: ${response.status}`;
            showCoordinateErrors(row, [{ input: null, message }]);
            if (triggerNext) toast.error("Failed to create coordinate: " + message);
            return false;
        }

        row.remove();
        if (triggerNext) {
            const tableBodyId = itemType === 'site' ? 'siteCoordinateTableBody' : 'sampleCoordinateTableBody';
            createCheckedCoordinates(tableBodyId);
        }
        return true;

    } catch (error) {
        console.error('Error:', error);
        showCoordinateErrors(row, [{ input: null, message: error.message }]);
        if (triggerNext) toast.error("Failed to create coordinate.");
        return false;
    }
}

// Creates the coordinates of the selected rows; rows which fail keep their messages
async function createCheckedCoordinates(tableBodyId) {
    const tableBody = document.getElementById(tableBodyId);
    if (tableBody) {
        const checkboxes = Array.from(tableBody.querySelectorAll('input[type="checkbox"]:checked'))
            .filter(checkbox => !checkbox.disabled);
        if (checkboxes.length === 0) return;

        const concurrencyLimit = 100;
        let failed = 0;
        showLoading();
        try {
            for (let i = 0; i < checkboxes.length; i += concurrencyLimit) {
                const batch = checkboxes.slice(i, i + concurrencyLimit);

                const results = await Promise.all(batch.map(checkbox => {
                    const row = checkbox.closest('tr');
                    return createCoordinate(row.dataset.itemType, row.dataset.itemId, row, false);
                }));
                failed += results.filter(created => !created).length;
            }
        } finally {
            hideLoading();
        }
        if (failed > 0) {
            toast.error(`${failed} selected ${failed === 1 ? "coordinate" : "coordinates"} not created (see the rows).`);
        }
    }
}

// Filter the site and sample coordinates by coordinateSystem (see tableFilter.js)
["siteCoordinateTableBody", "sampleCoordinateTableBody"].forEach(tableBodyId => {
    createTableFilter({
        tbody: tableBodyId,
        counterColumns: [1, 3],
        fields: [{
            key: "coordinateSystem",
            label: "coordinateSystem",
            getValue: row => row.dataset.coordinateSystem ?? ""
        }]
    });
});
