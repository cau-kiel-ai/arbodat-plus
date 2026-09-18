const resultForm = document.getElementById('resultForm');
const today = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
const taxonomy = document.getElementById("taxonomy_info");
const taxCodeDropdown = document.getElementById("taxCode");

function resetResultForm() {
    resultForm.reset();

    // Reset related datings
    $('#result_datings').val(null).trigger('change');
    absDatingMultiselect.innerHTML = '';
    // Reset fraction
    fractionDropdown.length = 1;
    fractionDropdown.dispatchEvent(new Event("change"));
    // Set entry date to today
    document.querySelector('.set-today').value = today;
    // Reset state of preservation
    $('#state_of_preservation').val(null).trigger('change');
    // Reset taxonomy
    taxonomy.textContent = '';
    taxonomy.style.display = "none";
    $('#taxCode').val(null).trigger('change');
    taxCodeDropdown.options.length = 1;
    // Reset cf
    $('#cf').val(null).trigger('change');
    // Reset rType
    $('#restType').val(null).trigger('change');    
}

const result_site_dropdown    = document.getElementById("result_site_dropdown");
const result_feature_dropdown = document.getElementById("result_feature_dropdown");
const result_sample_dropdown  = document.getElementById("result_sample_dropdown");

// Select2 reference site dropdown ------------------------------------------------
$('#result_site_dropdown').select2({
    placeholder: "",
    allowClear: true,
    width: "100%",
});

// remove arrow
$('#result_site_dropdown')
    .next('.select2-container')
    .find('.select2-selection__arrow')
    .remove();

let resultSite_isReopening = false;
$('#result_site_dropdown').on('select2:opening', async function (e) {
    if (resultSite_isReopening) {
        resultSite_isReopening = false;
        return;
    }

    e.preventDefault(); // Prevent opening

    // Disable dropdown and show "Loading..."
    $('#result_site_dropdown')
        .empty()
        .append(new Option('Loading...', 'loading', true, true))
        .trigger('change')
        .prop('disabled', true); // Disable

    // Reset form
    resetResultForm();
    $('#result_feature_dropdown').val(null).trigger('change');
    $('#result_sample_dropdown').val(null).trigger('change');

    try {
        await getSites();
    } finally {
        // Enable and reset dropdown
        $('#result_site_dropdown')
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
            $('#result_site_dropdown').append(
                new Option(itemName, item.id)
            );
        });

        // Refresh UI
        $('#result_site_dropdown').trigger('change.select2');

        // Reopen dropdown
        resultSite_isReopening = true;
        setTimeout(() => {
            $('#result_site_dropdown').select2('open');
        }, 0);
    }
});

// Select2 refernence feature dropdown --------------------------------------------
$('#result_feature_dropdown').select2({
    placeholder: "",
    allowClear: true,
    width: "100%",
});

// remove arrow
$('#result_feature_dropdown')
    .next('.select2-container')
    .find('.select2-selection__arrow')
    .remove();

let resultFeature_isReopening = false;
$('#result_feature_dropdown').on('select2:opening', async function (e) {
    if (resultFeature_isReopening) {
        resultFeature_isReopening = false;
        return;
    }

    e.preventDefault(); // Prevent opening

    const selectedSite = result_site_dropdown.value;
    // Check if site is selcted
    if (!selectedSite) {
        toast.info("Before you can select a feature, you must select a site.");
        return;
    }

    // Disable dropdown and show "Loading..."
    $('#result_feature_dropdown')
        .empty()
        .append(new Option('Loading...', 'loading', true, true))
        .trigger('change')
        .prop('disabled', true); // Disable

    // Reset form except site dropdown
    resetResultForm();
    $('#result_sample_dropdown').val(null).trigger('change');
    result_site_dropdown.value = selectedSite;

    try {
        await getFeatures();
    } finally {
        // Enable and reset dropdown
        $('#result_feature_dropdown')
            .prop('disabled', false) // Enable
            .empty()
            .append(new Option('', '', false, false));

        // Update data
        features.filter(item => item.site?.id === selectedSite).forEach(item => {
            $('#result_feature_dropdown').append(
                new Option(item.label, item.id)
            );
        });

        // Refresh UI
        $('#result_feature_dropdown').trigger('change.select2');

        // Reopen dropdown
        resultFeature_isReopening = true;
        setTimeout(() => {
            $('#result_feature_dropdown').select2('open');
        }, 0);
    }
});

// Select2 reference sample dropdown ----------------------------------------------
$('#result_sample_dropdown').select2({
    placeholder: "",
    allowClear: true,
    width: "100%",
});

// remove arrow
$('#result_sample_dropdown')
    .next('.select2-container')
    .find('.select2-selection__arrow')
    .remove();

let resultSample_isReopening = false;
$('#result_sample_dropdown').on('select2:opening', async function (e) {
    if (resultSample_isReopening) {
        resultSample_isReopening = false;
        return;
    }

    e.preventDefault(); // Prevent opening

    const selectedFeature = result_feature_dropdown.value;
    // Check if sample is selcted
    if (!selectedFeature) {
        toast.info("Before you can select a sample, you must select a feature.");
        return;
    }

    // Disable dropdown and show "Loading..."
    $('#result_sample_dropdown')
        .empty()
        .append(new Option('Loading...', 'loading', true, true))
        .trigger('change')
        .prop('disabled', true); // Disable

    // Reset form except site and feature dropdown
    const selectedSite = result_site_dropdown.value;
    resetResultForm();
    result_site_dropdown.value = selectedSite;
    result_feature_dropdown.value = selectedFeature;

    try {
        await getSamples();
    } finally {
        // Enable and reset dropdown
        $('#result_sample_dropdown')
            .prop('disabled', false) // Enable
            .empty()
            .append(new Option('', '', false, false));

        // Update data
        samples.filter(sample => sample.feature?.id === selectedFeature).forEach(item => {
            const option = new Option(item.label, item.id);
            option.dataset.taxonomyUri = item.feature.site.taxonomy?.id ?? '';
            option.dataset.taxonomyLabel = item.feature.site.taxonomy?.label ?? '';
            $('#result_sample_dropdown').append(option);
        });

        // Refresh UI
        $('#result_sample_dropdown').trigger('change.select2');

        // Reopen dropdown
        resultSample_isReopening = true;
        setTimeout(() => {
            $('#result_sample_dropdown').select2('open');
        }, 0);
    }
});

const absDatingMultiselect = document.getElementById("result_datings");
const fractionDropdown = document.getElementById("result_fraction");

$('#result_sample_dropdown').on('select2:select', async function (event) {
    const selectedSampleId = event.target.value;

// Populate absolute dating multi-select  -----------------------------------------

    // Disable multi-select boxes and show "Loading..."
    $('#result_datings')
        .empty()
        .append(new Option('Loading...', 'loading', true, true))
        .trigger('change')
        .prop('disabled', true);

    try {
        // Get absolute datings
        const response = await axios.get('api/absolute_datings');

        // Reset multi-select boxes
        $('#result_datings')
            .empty()
        
        // Filter AbsDatings that match the selected sample
        const filteredItems = response.data.filter(item =>
        item.sample?.id == selectedSampleId
        );

        filteredItems.forEach(item => {
            const option = document.createElement('option');
            
            option.value = item.id;
            option.textContent = item.subSample;

            absDatingMultiselect.appendChild(option)
        });

    } catch(error) {
        console.error('Error during absolute dating GET request: ', error);
    } finally {
        // Enable and refresh dropdown
        $('#result_datings')
            .prop('disabled', false)
            .trigger('change');
    }

// Populate fraction dropdown -----------------------------------------------------

    // Disable dropdown and show "Loading..."
    $('#result_fraction')
        .empty()
        .append(new Option('Loading...', 'loading', true, true))
        .trigger('change')
        .prop('disabled', true);

    try {
        const response = await axios.get('api/fractions_analyzed');

        // Reset dropdown
        $('#result_fraction')
            .empty()
            .append(new Option('', '', false, false));

        // Filter fractions that match the selected sample
        const filteredItems = response.data.filter(item =>
            item.sample?.id == selectedSampleId
        );

        filteredItems.forEach(item => {
            const option = document.createElement('option');

            option.value = item.id;
            option.textContent = formatFraction(item);

            option.setAttribute('data-fractionAnalyzed', item.fractionAnalyzed);
            option.setAttribute('data-orgOrMin', item.orgOrMin);
            option.setAttribute('data-sieveSize', item.sieveSize);
            option.setAttribute('data-standardMultiplier', item.standardMultiplier);

            fractionDropdown.appendChild(option);
        });

    } catch (error) {
        console.error('Error during fraction analyzed GET request:', error);
    } finally {
        // Enable and refresh dropdown
        $('#result_fraction')
            .prop('disabled', false)
            .trigger('change');
    }

// Populate tax code dropdown -----------------------------------------------------
// Get taxonomy of corresponding site
    const option = event.params.data.element;

    const taxonomyUri   = option.dataset.taxonomyUri;
    const taxonomyLabel = option.dataset.taxonomyLabel;
    
    // Set taxonomy info
    if (taxonomyLabel) {
        taxonomy.textContent = `${taxonomyLabel}`;
        taxonomy.style.display = "inline-block";
    } else {
        taxonomy.textContent = '';
        taxonomy.style.display = "none";
    }

    await fetchDanteTaxCodes(taxonomyUri);
    populateTaxCodeDropdown(taxonomyUri, taxCodeDropdown);
});

// Populate fraction fields -------------------------------------------------------
const fractionAnalyzedField = document.getElementById("result_fractionAnalyzed");
const orgRadio = document.getElementById("result_org");
const minRadio = document.getElementById("result_min");
const sieveSizeField = document.getElementById("result_sieveSize");
const multiplierInput = document.getElementById("result_multiplier");

$('#result_fraction').on('change', function () {
    const selectedOption = fractionDropdown.options[fractionDropdown.selectedIndex];

    // fraction analyzed
    fractionAnalyzedField.value = selectedOption.getAttribute('data-fractionAnalyzed');

    // org or min
    const orgOrMin = selectedOption.getAttribute('data-orgOrMin');
    if (orgOrMin == "org") {
        orgRadio.checked = true;
    } else if (orgOrMin == "min") {
        minRadio.checked = true;
    } else {
        orgRadio.checked = false;
        minRadio.checked = false;
    }

    // sieve size
    sieveSizeField.value = selectedOption.getAttribute('data-sieveSize');

    // multiplier
    const multiplierValue = selectedOption.getAttribute('data-standardMultiplier');
    multiplierInput.value =
        (multiplierValue !== null && multiplierValue !== "null") ? multiplierValue : '';
});

const entryDateInput = document.getElementById("entryDate");
const stateOfPreservationDropdown = document.getElementById("state_of_preservation");
const classificationConferDropdown = document.getElementById("cf");
const remarksTaxonomyTextarea = document.getElementById("remarks_taxonomy");
const restTypeDropdown = document.getElementById("restType");
const restCountInput = document.getElementById("r_count");
const restFragmentInput = document.getElementById("r_fragment");
const restWeightInput = document.getElementById("r_weight");
const estimationCheckbox = document.getElementById("estimation");

// --------------------------------------------------------------------------------
function submitResult() {
    if (resultForm.checkValidity()) {
        const selectedFractionOption = fractionDropdown.options[fractionDropdown.selectedIndex]

        // Create result payload
        const payload = {
            // References ----------------------------------------
            sample: { id: result_sample_dropdown.value },
            absoluteDatingList: Array.from(absDatingMultiselect.selectedOptions).map(option => ({ id: option.value })),
            
            // Fraction ------------------------------------------
            fractionAnalyzed: selectedFractionOption.getAttribute('data-fractionAnalyzed'),
            orgOrMin: selectedFractionOption.getAttribute('data-orgOrMin'),
            sieveSize: selectedFractionOption.getAttribute('data-sieveSize'),
            multiplier:  selectedFractionOption.getAttribute('data-standardMultiplier'), // multiplierInput.value,
            
            // General -------------------------------------------
            entryDate: entryDateInput.value,
            stateOfPreservation: {
                id: stateOfPreservationDropdown.value,
                label: stateOfPreservationDropdown.selectedOptions[0].text
            },

            // Taxonomy ------------------------------------------
            classificationConfer: {
                id: classificationConferDropdown.value,
                label: classificationConferDropdown.selectedOptions[0].text
            },
            taxCode: { 
                id: taxCodeDropdown.value,
                label: taxCodeDropdown.selectedOptions[0].text,
                taxonomy: result_sample_dropdown.options[result_sample_dropdown.selectedIndex].getAttribute('data-taxonomyLabel')
            },
            remarksTaxonomy: remarksTaxonomyTextarea.value,

            // Result --------------------------------------------
            restType: {
                id: restTypeDropdown.value,
                label: restTypeDropdown.selectedOptions[0].text,
                structuralConcept: restTypeDropdown.selectedOptions[0].getAttribute('data-structuralConcept')
            },
            restCount: restCountInput.value,
            restFragment: restFragmentInput.value,
            restWeight: restWeightInput.value,
            estimation: estimationCheckbox.checked,
            // ---------------------------------------------------
        };
        
        axios.post('api/results', payload)
        .then(response => {
            if (response.data === "result is created") {
                toast.success("result created");
            }
            if (response.data === "result already exists") {
                toast.info("result already exists");
            }
            // Reset "Taxonomy" and "Results" fields -------------------
            const inputs = resultFormTaxonomy.querySelectorAll('input, select, textarea');
            
            inputs.forEach(input => {
                if (input.tagName.toLowerCase() === 'input') {
                    // Reset checkbox
                    if (input.type === 'checkbox') {
                        input.checked = false;
                    // Reset text and number input fields
                    } else if (input.type === 'number' || input.type === 'text') {
                        input.value = '';
                    }
                // Reset textareas
                } else if (input.tagName.toLowerCase() === 'textarea') {
                    input.value = '';
                }
            });
            // Reset select2 dropown 
            $('#cf').val(null).trigger('change');
            $('#taxCode').val(null).trigger('change');
            $('#restType').val(null).trigger('change'); 
            // ---------------------------------------------------------

            classificationConferDropdown.focus();
        })
        .catch(error => {
            console.error('Error during POST request to create result:', error);
            alert("action failed");
        });

    } else { // Report -----------------
        // Set focus on invalid field
        result_sample_dropdown.focus();

        // wait until focus is set
        setTimeout(() => {
            resultForm.reportValidity();
        }, 500);
    } // -------------------------------
}

// Populate DANTE dropdowns -------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
    await fetchDanteAttribute("stateOfPreservation");
    populateDanteDropdown("stateOfPreservation", stateOfPreservationDropdown);

    await fetchDanteAttribute("classificationConfer");
    populateDanteDropdown("classificationConfer", classificationConferDropdown);

    await fetchDanteAttribute("restType");
    populateDanteDropdown("restType", restTypeDropdown);
});
