function populateCoordinates(coordinateList) {
    const siteTableBody = document.getElementById("siteCoordinateTableBody");
    const sampleTableBody = document.getElementById("sampleCoordinateTableBody");
    
    // Create lines
    coordinateList.forEach(async item => {
        const type = item.type;

        const row = document.createElement("tr");
        row.dataset.itemType = type;
        row.dataset.itemId = item.id;

        if (type == "site") {

            let dropdown = `<select id="coordinateSystemDropdown_${type}_${item.id}"
                                    onchange="updateCheckedDropdowns(this.value, 'siteCoordinateTableBody', 'coordinateSystemDropdown_')">
                                    <option value=""></option>
                            </select>`;

            // Add columns
            row.innerHTML = `
                <td><input type="checkbox"></td>
                <td>${item.label}</td>
                <td>
                    <input type="text" 
                           id="longitudeInput_${type}_${item.id}" 
                           value="${item.longitude}"
                           style="font-size: 10px; padding-top: 16px; padding-bottom: 16px; ">
                </td>
                <td>
                    <input type="text" 
                           id="latitudeInput_${type}_${item.id}" 
                           value="${item.latitude}"
                           style="font-size: 10px; padding-top: 16px; padding-bottom: 16px;">
                </td>
                <td>
                    <input type="text" 
                           id="altitudeInput_${type}_${item.id}" 
                           value="${item.altitude}"
                           style="font-size: 10px; padding-top: 16px; padding-bottom: 16px;">
                </td>
                <td>
                    ${item.coordinateSystem}
                    <br>
                        <button type="button"
                                data-item='${encodeURIComponent(JSON.stringify(item))}'
                                onclick="addLabelToJSONWithItem(this, 'coordinateSystemSite', '${item.coordinateSystem}')">
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
                    const longitude = parseFloat(longitude_input.value);
                    const latitude = parseFloat(latitude_input.value);
                    const coordinateSystem = coordinate_system_dropdown.options[coordinate_system_dropdown.selectedIndex];
                    let sourceEPSG = coordinateSystem?.getAttribute('data-crsNotation');
                
                    if (longitude && latitude && sourceEPSG && sourceEPSG !== "undefined") {
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
                <td>${item.siteLabel}
                    <br>
                    ${item.featureLabel}
                    <br>
                    ${item.label}
                </td>                
                <td>
                    <input type="text" 
                           id="longitudeInput_${type}_${item.id}" 
                           value="${item.longitude}"
                           style="font-size: 10px; padding-top: 16px; padding-bottom: 16px; ">
                </td>
                <td>
                    <input type="text" 
                           id="latitudeInput_${type}_${item.id}" 
                           value="${item.latitude}"
                           style="font-size: 10px; padding-top: 16px; padding-bottom: 16px; ">
                </td>
                <td>
                    <input type="text" 
                           id="altitudeInput_${type}_${item.id}" 
                           value="${item.altitude}"
                           style="font-size: 10px; padding-top: 16px; padding-bottom: 16px; ">
                </td>
                <td style="padding-top: 20px;">${item.zcoordinate}</td>
                <td>
                    ${item.coordinateSystem}
                    <br>
                    <button type="button"
                                data-item='${encodeURIComponent(JSON.stringify(item))}'
                                onclick="addLabelToJSONWithItem(this, 'coordinateSystemSample', '${item.coordinateSystem}')">
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
                    const longitude = parseFloat(longitude_input.value);
                    const latitude = parseFloat(latitude_input.value);
                    const coordinateSystem = coordinate_system_dropdown.options[coordinate_system_dropdown.selectedIndex];
                    let sourceEPSG = coordinateSystem?.getAttribute('data-crsNotation');
                
                    if (longitude && latitude && sourceEPSG != null) {
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

async function createCoordinate(itemType, itemId, row, triggerNext = true) {

    // Get longitudeInput
    const longitudeInput = document.getElementById(`longitudeInput_${itemType}_${itemId}`);
    const longitude = longitudeInput ? parseFloat(longitudeInput.value) : null;

    if (longitude && longitude != 'null') {

        // Get latitudeInput
        const latitudeInput = document.getElementById(`latitudeInput_${itemType}_${itemId}`);
        const latitude = latitudeInput ? parseFloat(latitudeInput.value) : null;

        if (latitude && latitude != 'null') {

            // Get coordinateSystemDropdown
            const coordinateSystemDropdown = document.getElementById(`coordinateSystemDropdown_${itemType}_${itemId}`);
            const coordinateSystemId = coordinateSystemDropdown ? coordinateSystemDropdown.value : null;
            const coordinateSystemLabel = coordinateSystemDropdown ?
                coordinateSystemDropdown.options[coordinateSystemDropdown.selectedIndex].text
                : null;

            if (coordinateSystemId && coordinateSystemLabel) {

                // Get altitudeInput
                const altitudeInput = document.getElementById(`altitudeInput_${itemType}_${itemId}`);
                const altitude = altitudeInput ? altitudeInput.value : null;

                // Get longitudeWGS84Input
                const longitudeWGS84Input = document.getElementById(`longitudeWGS84Input_${itemType}_${itemId}`);
                const longitudeWGS84 = longitudeWGS84Input ? longitudeWGS84Input.value : null;

                // Get latitudeWGS84Input
                const latitudeWGS84Input = document.getElementById(`latitudeWGS84Input_${itemType}_${itemId}`);
                const latitudeWGS84 = latitudeWGS84Input ? latitudeWGS84Input.value : null;

                // Get remarksInput
                const remarksInput = document.getElementById(`remarksInput_${itemType}_${itemId}`);
                const remarksCoordinate = remarksInput ? remarksInput.value : null;

                // Create payload
                const payload = {
                    longitude: longitude,
                    longitudeWgs84: longitudeWGS84,
                    latitude: latitude,
                    latitudeWgs84: latitudeWGS84,
                    altitude: altitude,
                    remarksCoordinate: remarksCoordinate,
                    coordinateSystem: {
                        id: coordinateSystemId,
                        label: coordinateSystemLabel
                    }
                }

                try {
                    const response = await fetch(
                        `api/coordinates/${itemType}/${itemId}`,
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
                    console.log(data);

                    row.remove();
                    if (triggerNext) {
                        const tableBodyId = itemType === 'site' ? 'siteCoordinateTableBody' : 'sampleCoordinateTableBody';
                        createCheckedCoordinates(tableBodyId);
                    }
                    return true;

                } catch (error) {
                    console.error('Error:', error);
                    alert("Failed to update Coordinate.");
                }
    
            } else {
                if (triggerNext) {
                    toast.info(`No coordinateSystem selected.`);
                }
                return false;
            }
        } else {
            if (triggerNext) {
                toast.info(`No latitude entered.`);
            }
            return false;
        }    
    } else {
        if (triggerNext) {
            toast.info(`No longitude entered.`);
        }
        return false;
    }
}

async function createCheckedCoordinates(tableBodyId) {
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
                    const itemType = row.dataset.itemType;
                    const itemId = row.dataset.itemId;

                    return createCoordinate(itemType, itemId, row, triggerNext = false);                    
                });

                await Promise.allSettled(promises);
            };
        } finally {
            hideLoading();
        }
    }
}
