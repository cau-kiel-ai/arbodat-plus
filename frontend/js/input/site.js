let sites = [];

async function getSites() {
    const { data } = await axios.get('api/sites');    
    sites = sortSites(data);
}

// Select2 reference research projects dropdown -----------------------------------
initLazyMultiSelect('#siteResearchProjects', {
    load:   async () => { await getResearchProjects(); return researchProjects; },
    format: item => item.projectName,
});

// Select2 refernce literature dropdown -------------------------------------------
initLazyMultiSelect('#siteLiterature', {
    load:   async () => { await getLiterature(); return literature; },
    format: formatLiterature,
});

// Select2 activity numbers: existing numbers of all sites, or new ones typed in ---
initLazyMultiSelect('#activityNumbers', {
    load:   async () => {
        await getSites();
        const numbers = new Set(sites.flatMap(site => site.activityNumbers ?? []));
        return [...numbers]
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            .map(number => ({ id: number }));
    },
    format: item => item.id,
    tags:   true,
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

    await applyDefaults("site");
});

// Select2 instituitions dropdown -------------------------------------------------
initLazyMultiSelect('#siteInstitutions', {
    load:   async () => { await getInstitutions(); return institutions; },
    format: formatInstitution,
});

// Select2 site directors dropdown ------------------------------------------------
initLazyMultiSelect('#siteDirectors', {
    load:   async () => { await getUsers(); return users; },
    format: formatName,
});

// Select2 archeologists dropdown -------------------------------------------------
initLazyMultiSelect('#archeologists', {
    load:   async () => { await getUsers(); return users; },
    format: formatName,
});

// Select2 botanists dropdown -----------------------------------------------------
initLazyMultiSelect('#botanists', {
    load:   async () => { await getUsers(); return users; },
    format: formatName,
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
    await applyDefaults("site", ["site_coordinate_system"]);
    
    // Init map when accordion is opened
    Accordion.addEventListener('shown.bs.collapse', () => {
        initMap(map_id);
        const map = mapStore.maps[map_id];

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

    // "At least one research project" is not a native constraint of the select: set (or clear) the message
    // before the form is checked, otherwise the message of the last failed submit makes the next one fail too.
    document.getElementById("siteResearchProjects").setCustomValidity(
        $('#siteResearchProjects').val().length > 0 ? "" : "You must select at least one research project");

    if ( siteForm.checkValidity() ) {
    
        // text
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
            researchProjectList: selectedRefs('#siteResearchProjects'),
            literatureList: selectedRefs('#siteLiterature'),
            activityNumbers: ($('#activityNumbers').val() || []).map(value => value.trim()).filter(Boolean),
            label: site_label.value.trim(),
            labelAbbreviation: site_label_abbrev.value.trim(),
            siteNumber: site_number.value.trim(),
            taxonomy: taxonomyId ? { id: taxonomyId, label: taxonomyLabel } : null,
            siteTypeList: Array.from(siteTypeDropdown.selectedOptions).map(option => ({ id: option.value })),
            siteTypeUncertain: uncertain_site_type.checked,
            naturalUnit: naturalUnitId ? { id: naturalUnitId, label: naturalUnitLabel } : null,
            undisturbed: condition_undisturbed_site.checked,
            remarksSite: remarks.value.trim(),
            siteDirectors: selectedRefs('#siteDirectors'),
            botanists: selectedRefs('#botanists'),
            archaeologists: selectedRefs('#archeologists'),
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
            payload.institutionList = selectedRefs('#siteInstitutions');

            confirmUpdate("site").then(confirmed => {
                if (!confirmed) return;

                axios.put(`api/sites/${siteId}`, payload)
                .then(response => {
                    console.log(response.data);
                    toast.success("site updated");
                })
                .catch(error => {
                    console.error('Error during PUT request to update site:', error);
                    toast.error(error.response?.status === 409 ? getErrorMessage(error) : "action failed");
                });
            });

        } else { // Create (POST) -------------------------------------------------

            // Create FormData object
            const formData = new FormData();
            // Add institutionList and site payload
            formData.append("institutionList", new Blob([JSON.stringify(selectedRefs('#siteInstitutions'))], { type: "application/json" }));
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
                $('#activityNumbers').empty().val(null).trigger('change');
                applyDefaults("site");
                clearMultiSelect('#siteLiterature');
                clearMultiSelect('#siteInstitutions');
                clearMultiSelect('#siteDirectors');
                clearMultiSelect('#archeologists');
                clearMultiSelect('#botanists');
                // ----------------------------------------------------------------
            })
            .catch(error => {
                console.error('Error during POST request to create site:', error);
                toast.error(error.response?.status === 409 ? getErrorMessage(error) : "action failed");
            });
        }

    } else {  // Report --------------------------------------
        // open Accordion, if invalid Field is in it
        let openedAccordion = false;
        siteForm.querySelectorAll(":invalid").forEach(el => {
        const collapseParent = el.closest(".accordion-collapse");
            if (collapseParent && collapseParent.classList.contains("collapse") && !collapseParent.classList.contains("show")) {
                openedAccordion = true;
                const bsCollapse = bootstrap.Collapse.getOrCreateInstance(collapseParent);
                bsCollapse.show();
            }
        });

        // Bootstrap's `scroll-behavior: smooth` animates the browser's scroll to the
        // invalid field; jump to it instantly, then report. If an accordion was just
        // opened, wait for its transition so the layout is final before scrolling.
        const report = () => {
            const firstInvalid = siteForm.querySelector(':invalid');
            if (firstInvalid) {
                firstInvalid.scrollIntoView({ block: 'center', behavior: 'instant' });
                firstInvalid.focus({ preventScroll: true });
            }
            siteForm.reportValidity();
        };
        setTimeout(report, openedAccordion ? 400 : 0);
    } // -----------------------------------------------------
}
