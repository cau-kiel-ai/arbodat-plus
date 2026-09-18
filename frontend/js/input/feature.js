let features = [];

async function getFeatures() {
    const { data } = await axios.get('api/features');    
    features = data;
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
            let itemName;
            if (item.activityNumber) {
                itemName = `${item.label}, ${item.activityNumber}`;
            } else {
                itemName = item.label;
            }
            const projectNames = item.researchProjectList
                .map(rp => rp.projectName)
                .join(', ');
            itemName += ` (research projects: ${projectNames})`;
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

// Excavation years -------------------------------------------------------------
const excavationYears_selectpicker = document.getElementById("excavation_years");

document.addEventListener("DOMContentLoaded", () => {
    const currentYear = new Date().getFullYear();
    const endYear = currentYear + 3;

    for (let year = endYear; year >= 1800; year--) {
        const option = document.createElement("option");

        option.value = year;
        option.textContent = year;

        excavationYears_selectpicker.appendChild(option);
    }
});

// Populate DANTE dropdowns -----------------------------------------------------
const featureTypeDropdown = document.getElementById("feature_type");
const preservationConditionDropdown = document.getElementById("preservation_condition");

document.addEventListener("DOMContentLoaded", async () => {
    await fetchDanteAttribute("featureType");
    populateDanteDropdown("featureType", featureTypeDropdown);

    await fetchDanteAttribute("preservationCondition");
    populateDanteDropdown("preservationCondition", preservationConditionDropdown);
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
        const selectedYears = Array.from(excavationYears_selectpicker.selectedOptions).map(opt => parseInt(opt.value));
        const building_context = document.getElementById("building_context").checked;
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
            remarksFeature: remarks,
        };

        if (featureId) { // Update (PUT) --------------------------------------------
            payload.id = featureId;

            axios.put(`api/features/${featureId}`, payload)
            .then(response => {
                console.log(response.data);
                toast.success("feature updated");
            })
            .catch(error => {
                console.error('Error during PUT request to update feature:', error);
                alert("action failed");
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
                alert("action failed");
            });
        }
       
    } else { // Report ------------------
        // Set focus on invalid field
        featureSite_dropdown.focus();

        // wait until focus is set
        setTimeout(() => {
            featureForm.reportValidity();
        }, 350);
    } // --------------------------------
};

function resetFeatureForm() {
    featureForm.reset();
    $('#preservation_condition').val(null).trigger('change');
    $('#feature_type').val(null).trigger('change');
}
