let sites = [];

async function getSites() {
    const { data } = await axios.get('api/sites');    
    sites = data;
}

// Select2 reference research projects dropdown -----------------------------------
$('#siteResearchProjects').select2({
    placeholder: "",
    allowClear: true,
    width: "100%",
});

// remove arrow
$('#siteResearchProjects')
    .next('.select2-container')
    .find('.select2-selection__arrow')
    .remove();

let siteResearchProjects_isReopening = false;
$('#siteResearchProjects').on('select2:opening', async function (e) {
    if (siteResearchProjects_isReopening) {
        siteResearchProjects_isReopening = false;
        return;
    }

    e.preventDefault(); // Prevent opening

    // Disable dropdown and show "Loading..."
    $('#siteResearchProjects')
        .empty()
        .append(new Option('Loading...', 'loading', true, true))
        .trigger('change')
        .prop('disabled', true); // Disable

    try {
        await getResearchProjects();
    } finally {
        // Enable and reset dropdown
        $('#siteResearchProjects')
            .prop('disabled', false) // Enable
            .empty()
            .append(new Option('', '', false, false));

        // Update data
        researchProjects.forEach(item => {
            $('#siteResearchProjects').append(
                new Option(item.projectName, item.id)
            );
        });

        // Refresh UI
        $('#siteResearchProjects').trigger('change.select2');

        // Reopen dropdown
        siteResearchProjects_isReopening = true;
        setTimeout(() => {
            $('#siteResearchProjects').select2('open');
        }, 0);
    }
});

// Select2 refernce literature dropdown -------------------------------------------
$('#siteLiterature').select2({
    placeholder: "",
    allowClear: true,
    width: "100%",
});

// remove arrow
$('#siteLiterature')
    .next('.select2-container')
    .find('.select2-selection__arrow')
    .remove();

let siteLiterature_isReopening = false;
$('#siteLiterature').on('select2:opening', async function (e) {
    if (siteLiterature_isReopening) {
        siteLiterature_isReopening = false;
        return;
    }

    e.preventDefault(); // Prevent opening

    // Disable dropdown and show "Loading..."
    $('#siteLiterature')
        .empty()
        .append(new Option('Loading...', 'loading', true, true))
        .trigger('change')
        .prop('disabled', true); // Disable

    try {
        await getLiterature();
    } finally {
        // Enable and reset dropdown
        $('#siteLiterature')
            .prop('disabled', false) // Enable
            .empty()
            .append(new Option('', '', false, false));

        // Update data
        literature.forEach(item => {
            $('#siteLiterature').append(
                new Option(formatLiterature(item), item.id)
            );
        });

        // Refresh UI
        $('#siteLiterature').trigger('change.select2');

        // Reopen dropdown
        siteLiterature_isReopening = true;
        setTimeout(() => {
            $('#siteLiterature').select2('open');
        }, 0);
    }
});

// Populate DANTE dropdowns -------------------------------------------------------
const taxonomyDropdown = document.getElementById("taxonomy");
const siteTypeDropdown = document.getElementById("site_type");
const naturalUnitDropdown = document.getElementById("natural_unit");

document.addEventListener("DOMContentLoaded", async () => {
    await fetchDanteAttribute("taxonomy");
    populateDanteDropdown("taxonomy", taxonomyDropdown);

    await fetchDanteAttribute("siteType");
    populateDanteDropdown("siteType", siteTypeDropdown);

    await fetchDanteAttribute("naturalUnit");
    populateDanteDropdown("naturalUnit", naturalUnitDropdown);
});

// Select2 instituitions dropdown -------------------------------------------------
$('#siteInstitutions').select2({
    placeholder: "",
    allowClear: true,
    width: "100%",
});

// remove arrow
$('#siteInstitutions')
    .next('.select2-container')
    .find('.select2-selection__arrow')
    .remove();

let siteInstitutions_isReopening = false;
$('#siteInstitutions').on('select2:opening', async function (e) {
    if (siteInstitutions_isReopening) {
        siteInstitutions_isReopening = false;
        return;
    }

    e.preventDefault(); // Prevent opening

    // Disable dropdown and show "Loading..."
    $('#siteInstitutions')
        .empty()
        .append(new Option('Loading...', 'loading', true, true))
        .trigger('change')
        .prop('disabled', true); // Disable

    try {
        await getLiterature();
    } finally {
        // Enable and reset dropdown
        $('#siteInstitutions')
            .prop('disabled', false) // Enable
            .empty()
            .append(new Option('', '', false, false));

        // Update data
        institutions.forEach(item => {
            $('#siteInstitutions').append(
                new Option(formatInstitution(item), item.id)
            );
        });

        // Refresh UI
        $('#siteInstitutions').trigger('change.select2');

        // Reopen dropdown
        siteInstitutions_isReopening = true;
        setTimeout(() => {
            $('#siteInstitutions').select2('open');
        }, 0);
    }
});

// Select2 site directors dropdown ------------------------------------------------
$('#siteDirectors').select2({
    placeholder: "",
    allowClear: true,
    width: "100%",
});

// remove arrow
$('#siteDirectors')
    .next('.select2-container')
    .find('.select2-selection__arrow')
    .remove();

let siteDirectors_isReopening = false;
$('#siteDirectors').on('select2:opening', async function (e) {
    if (siteDirectors_isReopening) {
        siteDirectors_isReopening = false;
        return;
    }

    e.preventDefault(); // Prevent opening

    // Disable dropdown and show "Loading..."
    $('#siteDirectors')
        .empty()
        .append(new Option('Loading...', 'loading', true, true))
        .trigger('change')
        .prop('disabled', true); // Disable

    try {
        await getUsers();
    } finally {
        // Enable and reset dropdown
        $('#siteDirectors')
            .prop('disabled', false) // Enable
            .empty()
            .append(new Option('', '', false, false));

        // Update data
        users.forEach(item => {
            $('#siteDirectors').append(
                new Option(formatName(item), item.id)
            );
        });

        // Refresh UI
        $('#siteDirectors').trigger('change.select2');

        // Reopen dropdown
        siteDirectors_isReopening = true;
        setTimeout(() => {
            $('#siteDirectors').select2('open');
        }, 0);
    }
});

// Select2 archeologists dropdown -------------------------------------------------
$('#archeologists').select2({
    placeholder: "",
    allowClear: true,
    width: "100%",
});

// remove arrow
$('#archeologists')
    .next('.select2-container')
    .find('.select2-selection__arrow')
    .remove();

let archeologists_isReopening = false;
$('#archeologists').on('select2:opening', async function (e) {
    if (archeologists_isReopening) {
        archeologists_isReopening = false;
        return;
    }

    e.preventDefault(); // Prevent opening

    // Disable dropdown and show "Loading..."
    $('#archeologists')
        .empty()
        .append(new Option('Loading...', 'loading', true, true))
        .trigger('change')
        .prop('disabled', true); // Disable

    try {
        await getUsers();
    } finally {
        // Enable and reset dropdown
        $('#archeologists')
            .prop('disabled', false) // Enable
            .empty()
            .append(new Option('', '', false, false));

        // Update data
        users.forEach(item => {
            $('#archeologists').append(
                new Option(formatName(item), item.id)
            );
        });

        // Refresh UI
        $('#archeologists').trigger('change.select2');

        // Reopen dropdown
        archeologists_isReopening = true;
        setTimeout(() => {
            $('#archeologists').select2('open');
        }, 0);
    }
});

// Select2 botanists dropdown -----------------------------------------------------
$('#botanists').select2({
    placeholder: "",
    allowClear: true,
    width: "100%",
});

// remove arrow
$('#botanists')
    .next('.select2-container')
    .find('.select2-selection__arrow')
    .remove();

let botanists_isReopening = false;
$('#botanists').on('select2:opening', async function (e) {
    if (botanists_isReopening) {
        botanists_isReopening = false;
        return;
    }

    e.preventDefault(); // Prevent opening

    // Disable dropdown and show "Loading..."
    $('#botanists')
        .empty()
        .append(new Option('Loading...', 'loading', true, true))
        .trigger('change')
        .prop('disabled', true); // Disable

    try {
        await getUsers();
    } finally {
        // Enable and reset dropdown
        $('#botanists')
            .prop('disabled', false) // Enable
            .empty()
            .append(new Option('', '', false, false));

        // Update data
        users.forEach(item => {
            $('#botanists').append(
                new Option(formatName(item), item.id)
            );
        });

        // Refresh UI
        $('#botanists').trigger('change.select2');

        // Reopen dropdown
        botanists_isReopening = true;
        setTimeout(() => {
            $('#botanists').select2('open');
        }, 0);
    }
});

// Populate coordinate system dropdown --------------------------------------------
// Handle coordinate input -> leaflet map + reverse geocoding
document.addEventListener('DOMContentLoaded', async function () {
    
    // --------------------- customise here -------------------------
    const Accordion = document.getElementById('panelsStayOpen-collapseThree');
    const coordinate_system_dropdown = document.getElementById("site_coordinate_system");
    const longitude_input = document.getElementById('site_longitude');
    const latitude_input  = document.getElementById('site_latitude');
    
    let inputTimer;
    const lat_wgs84 = document.getElementById('site_latitude_wgs84');
    const lon_wgs84 = document.getElementById('site_longitude_wgs84');
    
    const map_id = 'site_map';
    // --------------------------------------------------------------
    
    await fetchDanteAttribute("coordinateSystem");
    populateDanteDropdown ("coordinateSystem", coordinate_system_dropdown);
    
    // Init map when accordion is opened
    Accordion.addEventListener('shown.bs.collapse', () => {
        initMap(map_id);
        map = mapStore.maps[map_id];

        map.on('click', function (e) {
            const { lat, lng } = e.latlng;
            updateMap(map_id, lat, lng);
            
            // Set wgs84 longitude and latitude input fields
            lon_wgs84.value = lng.toFixed(7);
            lat_wgs84.value = lat.toFixed(7);

            // Trigger handleWGS84Input function
            lon_wgs84.dispatchEvent(new Event("input"));
            lat_wgs84.dispatchEvent(new Event("input"));
        });
    });

    $('#site_coordinate_system').on('change', handleCoordinateInput);
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

                        // Trigger handleWGS84Input function
                        lon_wgs84.dispatchEvent(new Event("input"));
                        lat_wgs84.dispatchEvent(new Event("input"));
                    }
                } catch { // Clear wgs84 fields
                    console.log("failed to transform coordinates to WGS84");
                }
            }  
        }, 1000);  // ms
    }

    lon_wgs84.addEventListener("input", () => {
        handleWGS84Input();
    });
    lat_wgs84.addEventListener("input", () => {
        handleWGS84Input();
    });

    async function handleWGS84Input() {
        if (inputTimer) {
            clearTimeout(inputTimer);
        }
        inputTimer = setTimeout(async () => {

            if (lon_wgs84.value && lat_wgs84.value) {
                updateMap(map_id, lat_wgs84.value, lon_wgs84.value)
    
                if ('site_map' === map_id) {
                    const address = await reverseGeocoding(lat_wgs84.value, lon_wgs84.value);
                    if (address) { // Set site address fields
                        document.getElementById('country').value = address.country || '';
                        document.getElementById('county').value = address.state || '';
                        document.getElementById('district').value = address.county || '';
                        document.getElementById('parish').value = address.village || address.suburb || '';
                        document.getElementById('street_or_place').value = address.road || address.neighbourhood || '';
                        document.getElementById('town').value = address.town || address.city || address.village || '';
                    } else { // Clear site address fields
                        document.getElementById('country').value         = '';
                        document.getElementById('county').value          = '';
                        document.getElementById('district').value        = '';
                        document.getElementById('parish').value          = '';
                        document.getElementById('street_or_place').value = '';
                        document.getElementById('town').value            = '';
                    }
                }
            } else { // Reset map
                updateMap(map_id, default_latitude, default_longitude)
    
                if ('site_map' === map_id) { // Clear site address fields
                    document.getElementById('country').value         = '';
                    document.getElementById('county').value          = '';
                    document.getElementById('district').value        = '';
                    document.getElementById('parish').value          = '';
                    document.getElementById('street_or_place').value = '';
                    document.getElementById('town').value            = '';
                }
            }
    
        }, 1000);  // ms
    }
});

// --------------------------------------------------------------------------------
function create_update_site() {
    const siteForm = document.getElementById('siteForm');
    
    if ( siteForm.checkValidity() && window.siteResearchProjectList.length > 0 ) {
    
        // text
        const activity_number = document.getElementById("activity_number");
        const site_label = document.getElementById("site_label");
        const site_label_abbrev = document.getElementById("site_label_abbreviation");
        const site_number = document.getElementById("site_number");
        const remarks = document.getElementById("site_remarks");

        // booleans
        const uncertain_site_type = document.getElementById("site_type_uncertain");
        const condition_undisturbed_site = document.getElementById("site_condition_undisturbed");

        // taxonomy
        const taxonomyDropdown = document.getElementById(`taxonomy`);
        const taxonomyId = taxonomyDropdown ? taxonomyDropdown.value : null;
        const taxonomyLabel = taxonomyDropdown ? taxonomyDropdown.options[taxonomyDropdown.selectedIndex].getAttribute("data-label") : null;    

        // site type
        const siteTypeDropdown = document.getElementById("site_type");

        // natural unit
        const naturalUnitDropdown = document.getElementById(`natural_unit`);
        const naturalUnitId = naturalUnitDropdown ? naturalUnitDropdown.value : null;
        const naturalUnitLabel = naturalUnitDropdown ? naturalUnitDropdown.options[naturalUnitDropdown.selectedIndex].getAttribute("data-label") : null;    

        // coordinates
        const lat_in = document.getElementById("site_latitude").value;
        const lon_in = document.getElementById("site_longitude").value;
        const alt_in = document.getElementById("site_altitude").value;
        const lat84_in = document.getElementById("site_latitude_wgs84").value;
        const lon84_in = document.getElementById("site_longitude_wgs84").value;
        const coordinate_system_dropdown = document.getElementById("site_coordinate_system");    

        // address
        const country = document.getElementById('country').value;
        const county = document.getElementById('county').value;
        const district = document.getElementById('district').value;
        const parish = document.getElementById('parish').value;
        const street_or_place = document.getElementById('street_or_place').value;
        const town = document.getElementById('town').value;
        
        // Create payload
        var payload = {
            researchProjectList: siteResearchProjectList,
            literatureList: siteLiteratureList,
            activityNumber: activity_number.value.trim(),
            label: site_label.value.trim(),
            labelAbbreviation: site_label_abbrev.value.trim(),
            siteNumber: site_number.value.trim(),
            taxonomy: taxonomyId ? { id: taxonomyId, label: taxonomyLabel } : null,
            siteTypeList: Array.from(siteTypeDropdown.selectedOptions).map(option => ({ id: option.value })),
            siteTypeUncertain: uncertain_site_type.checked,
            naturalUnit: naturalUnitId ? { id: naturalUnitId, label: naturalUnitLabel } : null,
            undisturbed: condition_undisturbed_site.checked,
            remarksSite: remarks.value.trim(),
            siteDirectors: siteDirectorList,
            botanists: siteBotanistList,
            archaeologists: siteArcheologistList,
            address: {
                country: country,
                county: county,
                district: district,
                parish: parish, 
                street_or_place: street_or_place,
                town: town 
            },
            coordinate: {
                coordinateSystem: coordinate_system_dropdown.value
                                ? { id: coordinate_system_dropdown.value,
                                    label: coordinate_system_dropdown.selectedOptions[0].text }
                                : null,
                latitude: lat_in,
                longitude: lon_in,
                altitude: alt_in,
                latitudeWgs84: lat84_in,
                longitudeWgs84: lon84_in,
            }
        };

        const siteId = document.getElementById("site_id").value;

        if (siteId) { // Update (PUT) ---------------------------------------------

            // Add site id to payload
            payload.id = siteId;
            payload.institutionList = window.siteInstitutionList;

            axios.put(`api/sites/${siteId}`, payload)
            .then(response => {
                console.log(response.data);
                toast.success("site updated");
            })
            .catch(error => {
                console.error('Error during PUT request to update site:', error);
                alert("action failed");
            });

        } else { // Create (POST) -------------------------------------------------

            // Create FormData object
            const formData = new FormData();
            // Add institutionList and site payload
            formData.append("institutionList", new Blob([JSON.stringify(siteInstitutionList)], { type: "application/json" }));
            formData.append("transferredSite", new Blob([JSON.stringify(payload)], { type: "application/json" }));

            axios.post('api/sites', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            })
            .then(response => {
                console.log(response.data);
                toast.success("site created");

                // Reset form -----------------------------------------------------
                siteForm.reset();
                siteLiteratureList.length = [];
                document.getElementById("siteLiteratureContainer").innerHTML = '';
                siteInstitutionList.length = [];
                document.getElementById("siteInstitutionContainer").innerHTML = '';
                siteDirectorList.length = [];
                document.getElementById("siteDirectorContainer").innerHTML = '';
                siteArcheologistList.length = [];
                document.getElementById("ArcheologistContainer").innerHTML = '';
                siteBotanistList.length = [];
                document.getElementById("BotanistContainer").innerHTML = '';
                // ----------------------------------------------------------------
            })
            .catch(error => {
                console.error('Error during POST request to create site:', error);
                alert("action failed");
            });
        }

    } else {  // Report --------------------------------------
        const siteResearchProjectDropdown = document.getElementById("siteResearchProjects");

        if ( !(window.siteResearchProjectList.length > 0) ) {
            siteResearchProjectDropdown.setCustomValidity("You must add at least one research project");
        } else {
            siteResearchProjectDropdown.setCustomValidity("");
        }

        // open Accordion, if invalid Field is in it
        siteForm.querySelectorAll(":invalid").forEach(el => {
        const collapseParent = el.closest(".accordion-collapse");
            if (collapseParent && collapseParent.classList.contains("collapse")) {
                const bsCollapse = bootstrap.Collapse.getOrCreateInstance(collapseParent);
                bsCollapse.show();
            }
        });

        if ( !(window.siteResearchProjectList.length > 0) ) {
            siteResearchProjectDropdown.focus();
        } else {
            document.getElementById("site_label").focus();
        }
        
        // wait until focus is set
        setTimeout(() => {
            siteForm.reportValidity();
        }, 750);
    } // -----------------------------------------------------
}
