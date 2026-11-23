let features = [];

async function getFeatures() {
    const { data } = await axios.get('api/features');    
    features = sortFeatures(data);
}

// Select2 refernece site dropdown ------------------------------------------------
$('#featureSite').select2({
    placeholder: "",
    allowClear: true,
    width: "100%",
});

// remove arrow
$('#featureSite')
    .next('.select2-container')
    .find('.select2-selection__arrow')
    .remove();

let featureSite_isReopening = false;
$('#featureSite').on('select2:opening', async function (e) {
    if (featureSite_isReopening) {
        featureSite_isReopening = false;
        return;
    }

    e.preventDefault(); // Prevent opening

    // Disable dropdown and show "Loading..."
    $('#featureSite')
        .empty()
        .append(new Option('Loading...', 'loading', true, true))
        .trigger('change')
        .prop('disabled', true); // Disable

    resetFeatureForm();

    try {
        await getSites();
    } finally {
        // Enable and reset dropdown
        $('#featureSite')
            .prop('disabled', false) // Enable
            .empty()
            .append(new Option('', '', false, false));

        // Update data
        sites.forEach(item => {
            // Determine item name --------------------------------
            const activityNumbers = item.activityNumbers?.length
                ? `activity numbers: ${item.activityNumbers.join(', ')}; `
                : '';
            const projectNames = item.researchProjectList
                .map(rp => rp.projectName)
                .join(', ');
            const itemName = `${item.label} (${activityNumbers}research projects: ${projectNames})`;
            // ----------------------------------------------------
            $('#featureSite').append(
                new Option(itemName, item.id)
            );
        });

        // Refresh UI
        $('#featureSite').trigger('change.select2');

        // Reopen dropdown
        featureSite_isReopening = true;
        setTimeout(() => {
            $('#featureSite').select2('open');
        }, 0);
    }
});

// Excavation years: existing years of all features, or new ones typed in -------
initLazyMultiSelect('#excavation_years', {
    load:   async () => {
        await getFeatures();
        const years = new Set(features.flatMap(feature => feature.excavationYears ?? []));
        return [...years].sort((a, b) => b - a).map(year => ({ id: year }));
    },
    format: item => String(item.id),
    tags:   true,
    isTag:  term => /^\d{4}$/.test(term),
});

// Populate DANTE dropdowns -----------------------------------------------------
const featureTypeDropdown = document.getElementById("feature_type");
const preservationConditionDropdown = document.getElementById("preservation_condition");

document.addEventListener("DOMContentLoaded", async () => {
    await fetchDanteAttribute("featureType");
    populateDanteDropdown("featureType", featureTypeDropdown);

    await fetchDanteAttribute("preservationCondition");
    populateDanteDropdown("preservationCondition", preservationConditionDropdown);

    await applyDefaults("feature");
});

const featureForm = document.getElementById('feature');
const featureSite_dropdown = document.getElementById("featureSite");
// Create/Update feature --------------------------------------------------------
function create_update_feature() {
    if (featureForm.checkValidity()) {

        const featureId = document.getElementById("feature_id").value;

        // Create feature payload
        const ref_site = featureSite_dropdown.value;
        const feature_label = document.getElementById("feature_label").value;
        const exc_area = document.getElementById("excavation_area").value;
        const cond_satisfactory = document.getElementById("feature_condition").checked;
        const selectedYears = ($('#excavation_years').val() || []).map(year => parseInt(year, 10));
        const building_context = document.getElementById("building_context").checked;
        const building_context_description = document.getElementById("building_context_description").value;
        const remarks = document.getElementById("remarks_feature").value;        
        // preservation condition
        const PreservationConditionId = preservationConditionDropdown ? preservationConditionDropdown.value : null;
        const PreservationConditionLabel = preservationConditionDropdown ? preservationConditionDropdown.options[preservationConditionDropdown.selectedIndex].getAttribute("data-label") : null;    
        // feature type
        const FeatureTypeId = featureTypeDropdown ? featureTypeDropdown.value : null;
        const FeatureTypeLabel = featureTypeDropdown ? featureTypeDropdown.options[featureTypeDropdown.selectedIndex].getAttribute("data-label") : null;    

        var payload = {
            site: {id: ref_site},
            label: feature_label,
            excavationArea: exc_area,
            featureCondition: cond_satisfactory,
            preservationCondition: PreservationConditionId ? { id: PreservationConditionId, label: PreservationConditionLabel } : null,
            featureType: FeatureTypeId ? { id: FeatureTypeId, label: FeatureTypeLabel } : null,
            excavationYears: selectedYears,
            buildingContext: building_context,
            buildingContextDescription: building_context ? building_context_description : null,
            remarksFeature: remarks,
        };

        if (featureId) { // Update (PUT) --------------------------------------------
            payload.id = featureId;

            confirmUpdate("feature").then(confirmed => {
                if (!confirmed) return;

                axios.put(`api/features/${featureId}`, payload)
                .then(response => {
                    console.log(response.data);
                    toast.success("feature updated");
                })
                .catch(error => {
                    console.error('Error during PUT request to update feature:', error);
                    toast.error(error.response?.status === 409 ? getErrorMessage(error) : "action failed");
                });
            });
        } else { // Create (POST) ---------------------------------------------------
            axios.post('api/features', payload)
            .then(response => {
                console.log(response.data);
                toast.success("feature created");

                // Reset form except reference site dropdown
                const siteValue = featureSite_dropdown.value;
                resetFeatureForm();
                featureSite_dropdown.value = siteValue;
                // ------------------------------------------
            })
            .catch(error => {
                console.error('Error during POST request to create feature:', error);
                toast.error(error.response?.status === 409 ? getErrorMessage(error) : "action failed");
            });
        }
       
    } else { // Report ------------------
        // Bootstrap's `scroll-behavior: smooth` animates the browser's scroll
        // to the invalid field; jump to it instantly, then report.
        const firstInvalid = featureForm.querySelector(':invalid');
        if (firstInvalid) {
            firstInvalid.scrollIntoView({ block: 'center', behavior: 'instant' });
            firstInvalid.focus({ preventScroll: true });
        }
        featureForm.reportValidity();
    } // --------------------------------
};

function resetFeatureForm() {
    featureForm.reset();
    toggleBuildingContextDescription();
    $('#preservation_condition').val(null).trigger('change');
    $('#feature_type').val(null).trigger('change');
    $('#excavation_years').empty().val(null).trigger('change');
    applyDefaults("feature");
}

// Show building context description only if building context is checked
function toggleBuildingContextDescription() {
    const checked = document.getElementById("building_context").checked;
    document.getElementById("building_context_description").style.display = checked ? "" : "none";
}
