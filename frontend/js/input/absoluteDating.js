let absoluteDatings = [];

async function getAbsoluteDatings() {
    const { data } = await axios.get('api/absolute_datings');
    absoluteDatings = data;
}

// Form and Fields ------------------------------------------------------------
const absoluteDating_form = document.getElementById('absDatingForm');

const absoluteDating_site_dropdown    = document.getElementById("absDating_site_dropdown");
const absoluteDating_feature_dropdown = document.getElementById("absDating_feature_dropdown");
const absoluteDating_sample_dropdown  = document.getElementById("absDating_sample_dropdown");

const subSampleInput = document.getElementById("subsample");

const materialDropdown     = document.getElementById("material");
const remarksTextarea      = document.getElementById("absDating_remarks");
const datingMethodDropdown = document.getElementById("dating_method");

// Dendro dating
const dendroLabInput    = document.getElementById("dendro_lab");
const dendroNumberInput = document.getElementById("dendro_number");
const dendroAgeInput    = document.getElementById("dendro_age");
const waneyEdgeCheckbox = document.getElementById("waney_edge");
// C14 dating
const c14LabDropdown = document.getElementById("c14_lab");
const c14NumberInput = document.getElementById("c14_number");
const c14AgeBPInput  = document.getElementById("c14_age_bp");
const c14StdDevInput = document.getElementById("c14_std_dev");
const c14CalTextarea = document.getElementById("c14_calibration_bc_ad_2s");
const deltaC13Input  = document.getElementById("delta_C13");
const c13DevInput    = document.getElementById("c13_dev");
const pMCInput       = document.getElementById("pMC");
const pMCDevInput    = document.getElementById("pMC_dev");
// Other dating
const otherLabInput    = document.getElementById("other_lab");
const otherNumberInput = document.getElementById("other_number");
const otherAgeInput    = document.getElementById("other_age");

// Select2 reference site dropdown --------------------------------------------
$('#absDating_site_dropdown').select2({
    placeholder: "",
    allowClear: true,
    width: "100%",
});

// remove arrow
$('#absDating_site_dropdown')
    .next('.select2-container')
    .find('.select2-selection__arrow')
    .remove();

let absoluteDatingSite_isReopening = false;
$('#absDating_site_dropdown').on('select2:opening', async function (e) {
    if (absoluteDatingSite_isReopening) {
        absoluteDatingSite_isReopening = false;
        return;
    }

    e.preventDefault(); // Prevent opening

    // Disable dropdown and show "Loading..."
    $('#absDating_site_dropdown')
        .empty()
        .append(new Option('Loading...', 'loading', true, true))
        .trigger('change')
        .prop('disabled', true); // Disable

    // Reset form
    resetAbsoluteDatingForm();
    $('#absDating_feature_dropdown').val(null).trigger('change');
    $('#absDating_sample_dropdown').val(null).trigger('change');

    try {
        await getSites();
    } finally {
        // Enable and reset dropdown
        $('#absDating_site_dropdown')
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
            $('#absDating_site_dropdown').append(
                new Option(itemName, item.id)
            );
        });

        // Refresh UI
        $('#absDating_site_dropdown').trigger('change.select2');

        // Reopen dropdown
        absoluteDatingSite_isReopening = true;
        setTimeout(() => {
            $('#absDating_site_dropdown').select2('open');
        }, 0);
    }
});

// Select2 refernence feature dropdown ----------------------------------------
$('#absDating_feature_dropdown').select2({
    placeholder: "",
    allowClear: true,
    width: "100%",
});

// remove arrow
$('#absDating_feature_dropdown')
    .next('.select2-container')
    .find('.select2-selection__arrow')
    .remove();

let absoluteDatingFeature_isReopening = false;
$('#absDating_feature_dropdown').on('select2:opening', async function (e) {
    if (absoluteDatingFeature_isReopening) {
        absoluteDatingFeature_isReopening = false;
        return;
    }

    e.preventDefault(); // Prevent opening

    const selectedSite = absoluteDating_site_dropdown.value;
    // Check if site is selcted
    if (!selectedSite) {
        toast.info("Before you can select a feature, you must select a site.");
        return;
    }

    // Disable dropdown and show "Loading..."
    $('#absDating_feature_dropdown')
        .empty()
        .append(new Option('Loading...', 'loading', true, true))
        .trigger('change')
        .prop('disabled', true); // Disable

    // Reset form except site dropdown
    resetAbsoluteDatingForm();
    $('#absDating_sample_dropdown').val(null).trigger('change');
    absoluteDating_site_dropdown.value = selectedSite;

    try {
        await getFeatures();
    } finally {
        // Enable and reset dropdown
        $('#absDating_feature_dropdown')
            .prop('disabled', false) // Enable
            .empty()
            .append(new Option('', '', false, false));

        // Update data
        features.filter(item => item.site?.id === selectedSite).forEach(item => {
            $('#absDating_feature_dropdown').append(
                new Option(item.label, item.id)
            );
        });

        // Refresh UI
        $('#absDating_feature_dropdown').trigger('change.select2');

        // Reopen dropdown
        absoluteDatingFeature_isReopening = true;
        setTimeout(() => {
            $('#absDating_feature_dropdown').select2('open');
        }, 0);
    }
});

// Select2 reference sample dropdown ------------------------------------------
$('#absDating_sample_dropdown').select2({
    placeholder: "",
    allowClear: true,
    width: "100%",
});

// remove arrow
$('#absDating_sample_dropdown')
    .next('.select2-container')
    .find('.select2-selection__arrow')
    .remove();

let absoluteDatingSample_isReopening = false;
$('#absDating_sample_dropdown').on('select2:opening', async function (e) {
    if (absoluteDatingSample_isReopening) {
        absoluteDatingSample_isReopening = false;
        return;
    }

    e.preventDefault(); // Prevent opening

    const selectedFeature = absoluteDating_feature_dropdown.value;
    // Check if sample is selcted
    if (!selectedFeature) {
        toast.info("Before you can select a sample, you must select a feature.");
        return;
    }

    // Disable dropdown and show "Loading..."
    $('#absDating_sample_dropdown')
        .empty()
        .append(new Option('Loading...', 'loading', true, true))
        .trigger('change')
        .prop('disabled', true); // Disable
    
    // Reset form except site dropdown
    const selectedSite = absoluteDating_site_dropdown.value;
    resetAbsoluteDatingForm();
    absoluteDating_site_dropdown.value = selectedSite;
    absoluteDating_feature_dropdown.value = selectedFeature;

    try {
        await getSamples();
    } finally {
        // Enable and reset dropdown
        $('#absDating_sample_dropdown')
            .prop('disabled', false) // Enable
            .empty()
            .append(new Option('', '', false, false));

        // Update data
        samples.filter(sample => sample.feature?.id === selectedFeature).forEach(item => {
            $('#absDating_sample_dropdown').append(
                new Option(item.label, item.id)
            );
        });

        // Refresh UI
        $('#absDating_sample_dropdown').trigger('change.select2');

        // Reopen dropdown
        absoluteDatingSample_isReopening = true;
        setTimeout(() => {
            $('#absDating_sample_dropdown').select2('open');
        }, 0);
    }
});

// Select2 refernce literature dropdown ---------------------------------------
$('#datingLiterature').select2({
    placeholder: "",
    allowClear: true,
    width: "100%",
});

// remove arrow
$('#datingLiterature')
    .next('.select2-container')
    .find('.select2-selection__arrow')
    .remove();

let datingLiterature_isReopening = false;
$('#datingLiterature').on('select2:opening', async function (e) {
    if (datingLiterature_isReopening) {
        datingLiterature_isReopening = false;
        return;
    }

    e.preventDefault(); // Prevent opening

    // Disable dropdown and show "Loading..."
    $('#datingLiterature')
        .empty()
        .append(new Option('Loading...', 'loading', true, true))
        .trigger('change')
        .prop('disabled', true); // Disable

    try {
        await getLiterature();
    } finally {
        // Enable and reset dropdown
        $('#datingLiterature')
            .prop('disabled', false) // Enable
            .empty()
            .append(new Option('', '', false, false));

        // Update data
        literature.forEach(item => {
            $('#datingLiterature').append(
                new Option(formatLiterature(item), item.id)
            );
        });

        // Refresh UI
        $('#datingLiterature').trigger('change.select2');

        // Reopen dropdown
        datingLiterature_isReopening = true;
        setTimeout(() => {
            $('#datingLiterature').select2('open');
        }, 0);
    }
});

// Populate DANTE dropdowns ---------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
    await fetchDanteAttribute("material");
    populateDanteDropdown("material", materialDropdown);

    await fetchDanteAttribute("datingMethod");
    populateDanteDropdown("datingMethod", datingMethodDropdown);

    await fetchDanteAttribute("c14Laboratory");
    populateDanteDropdown("c14Laboratory", c14LabDropdown);
});

// Manage dating accordions ---------------------------------------------------
// DendroDating accordion
const dendroDating_AccordionItem = document.getElementById("dendroDating_AccordionItem");
const dendroDating_AccordionButton = dendroDating_AccordionItem.querySelector(".accordion-button");
const dendroDating_AccordionCollapseElem = document.getElementById("dendroDating_AccordionCollapseElem");

// C14Dating accordion
const c14Dating_AccordionItem = document.getElementById("c14Dating_AccordionItem");
const c14Dating_AccordionButton = c14Dating_AccordionItem.querySelector(".accordion-button");
const c14Dating_AccordionCollapseElem = document.getElementById("c14Dating_AccordionCollapseElem");

// OtherDating accordion
const otherDating_AccordionItem = document.getElementById("otherDating_AccordionItem");
const otherDating_AccordionButton = otherDating_AccordionItem.querySelector(".accordion-button");
const otherDating_AccordionCollapseElem = document.getElementById("otherDating_AccordionCollapseElem");

$('#dating_method').on('change', function () {
    const selectedValue = this.selectedOptions[0].text;

    if (selectedValue === "Dendrochronology") {
        c14LabDropdown.required = false;

        populateLabList();

        // Activate accordion
        dendroDating_AccordionItem.style.pointerEvents = "auto";
        dendroDating_AccordionItem.style.opacity = "1";

        // Open accordion
        dendroDating_AccordionButton.classList.remove("collapsed");
        dendroDating_AccordionButton.setAttribute("aria-expanded", "true");
        dendroDating_AccordionCollapseElem.classList.add("show");

        // Deactivate remaining accordions
        c14Dating_AccordionItem.style.pointerEvents = "none";
        c14Dating_AccordionItem.style.opacity = "0.5";

        otherDating_AccordionItem.style.pointerEvents = "none";
        otherDating_AccordionItem.style.opacity = "0.5";

        // Close remaining accordions
        c14Dating_AccordionButton.classList.add("collapsed");
        c14Dating_AccordionButton.setAttribute("aria-expanded", "false");
        c14Dating_AccordionCollapseElem.classList.remove("show");

        otherDating_AccordionButton.classList.add("collapsed");
        otherDating_AccordionButton.setAttribute("aria-expanded", "false");
        otherDating_AccordionCollapseElem.classList.remove("show");

    } else if (selectedValue === "Radiocarbon Dating") {
        c14LabDropdown.required = true;

        // Activate accordion
        c14Dating_AccordionItem.style.pointerEvents = "auto";
        c14Dating_AccordionItem.style.opacity = "1";

        // Open accordion
        c14Dating_AccordionButton.classList.remove("collapsed");
        c14Dating_AccordionButton.setAttribute("aria-expanded", "true");
        c14Dating_AccordionCollapseElem.classList.add("show");

        // Deactivate remaining accordions
        dendroDating_AccordionItem.style.pointerEvents = "none";
        dendroDating_AccordionItem.style.opacity = "0.5";

        otherDating_AccordionItem.style.pointerEvents = "none";
        otherDating_AccordionItem.style.opacity = "0.5";

        // Close remaining accordions
        dendroDating_AccordionButton.classList.add("collapsed");
        dendroDating_AccordionButton.setAttribute("aria-expanded", "false");
        dendroDating_AccordionCollapseElem.classList.remove("show");

        otherDating_AccordionButton.classList.add("collapsed");
        otherDating_AccordionButton.setAttribute("aria-expanded", "false");
        otherDating_AccordionCollapseElem.classList.remove("show");

    } else if (selectedValue === "") {
        c14LabDropdown.required = false;

        // Deactivate all accordions
        dendroDating_AccordionItem.style.pointerEvents = "none";
        dendroDating_AccordionItem.style.opacity = "0.5";

        c14Dating_AccordionItem.style.pointerEvents = "none";
        c14Dating_AccordionItem.style.opacity = "0.5";

        otherDating_AccordionItem.style.pointerEvents = "none";
        otherDating_AccordionItem.style.opacity = "0.5";

        // Close all accordions
        dendroDating_AccordionButton.classList.add("collapsed");
        dendroDating_AccordionButton.setAttribute("aria-expanded", "false");
        dendroDating_AccordionCollapseElem.classList.remove("show");

        c14Dating_AccordionButton.classList.add("collapsed");
        c14Dating_AccordionButton.setAttribute("aria-expanded", "false");
        c14Dating_AccordionCollapseElem.classList.remove("show");

        otherDating_AccordionButton.classList.add("collapsed");
        otherDating_AccordionButton.setAttribute("aria-expanded", "false");
        otherDating_AccordionCollapseElem.classList.remove("show");
    
    } else { // Other Dating
        c14LabDropdown.required = false;
        
        populateLabList();

        // Activate accordion
        otherDating_AccordionItem.style.pointerEvents = "auto";
        otherDating_AccordionItem.style.opacity = "1";

        // Open accordion
        otherDating_AccordionButton.classList.remove("collapsed");
        otherDating_AccordionButton.setAttribute("aria-expanded", "true");
        otherDating_AccordionCollapseElem.classList.add("show");

        // Deactivate remaining accordions
        dendroDating_AccordionItem.style.pointerEvents = "none";
        dendroDating_AccordionItem.style.opacity = "0.5";

        c14Dating_AccordionItem.style.pointerEvents = "none";
        c14Dating_AccordionItem.style.opacity = "0.5";

        // Close remaining accordions
        dendroDating_AccordionButton.classList.add("collapsed");
        dendroDating_AccordionButton.setAttribute("aria-expanded", "false");
        dendroDating_AccordionCollapseElem.classList.remove("show");

        c14Dating_AccordionButton.classList.add("collapsed");
        c14Dating_AccordionButton.setAttribute("aria-expanded", "false");
        c14Dating_AccordionCollapseElem.classList.remove("show");
    }
});

// Populate laboratory input list ---------------------------------------------
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


// ----------------------------------------------------------------------------
function create_update_absoulteDating() {
    if (absoluteDating_form.checkValidity()) {
        const absoluteDatingId = document.getElementById("absDating_id").value;
        const datingMethodLabel = datingMethodDropdown.selectedOptions[0].text

        // Create absolute dating payload
        const payload = {            
            // References ----------------------------------------
            sample: { id: absoluteDating_sample_dropdown.value },
            literatureList: absoluteDatingLiteratureList,
            
            // Absolute dating -----------------------------------
            subSample: subSampleInput.value,
            remarks: remarksTextarea.value
        };
        // Absolte dating id
        if (absoluteDatingId) {
            payload.id = absoluteDatingId;
        }
            // material
        if (materialDropdown.value) {
            payload.material = {
                id: materialDropdown.value,
                label: materialDropdown.selectedOptions[0].text
            };
        }
            // dating method
        if (datingMethodDropdown.value) {
            payload.datingMethod = {
                id: datingMethodDropdown.value,
                label: datingMethodLabel
            };

            // Dendro dating -------------------------------------
            if (datingMethodLabel === "Dendrochronology") {

                const labLabel = dendroLabInput.value;
                // Get labId
                const matchedOption = Array.from(lab_list.options).find(opt => opt.value === labLabel);
                const labId = matchedOption ? matchedOption.getAttribute("data-id") : null;

                payload.dendrochronologicalDating = {
                    dendrochronologicalAge: dendroAgeInput.value,
                    waneyEdge: waneyEdgeCheckbox.checked
                };

                if (labLabel) {
                    payload.dendrochronologicalDating.laboratory = {
                        id: labId,
                        label: labLabel
                    };
                    payload.dendrochronologicalDating.number = dendroNumberInput.value
                }                

            // C14 Dating ----------------------------------------
            } else if (datingMethodLabel === "Radiocarbon Dating") {
                payload.c14Dating = {
                    c14Laboratory: {
                        id: c14LabDropdown.value,
                        label: c14LabDropdown.selectedOptions[0].getAttribute("data-label")
                    },
                    number: c14NumberInput.value,

                    c14AgeBp: c14AgeBPInput.value,
                    c14StdDev: c14StdDevInput.value,
                    c14CalibrationBcAd2s: c14CalTextarea.value,
                    deltaC13: deltaC13Input.value,
                    deltaC13Uncertainty: c13DevInput.value,
                    pmc: pMCInput.value,
                    pmcUncertainty: pMCDevInput.value
                };

            // Other Dating --------------------------------------
            } else {
                const labLabel = otherLabInput.value;
                // Get labId
                const matchedOption = Array.from(lab_list.options).find(opt => opt.value === labLabel);
                const labId = matchedOption ? matchedOption.getAttribute("data-id") : null;

                payload.otherDating = {
                    ageDivers: otherAgeInput.value
                };

                if (labLabel) {
                    payload.otherDating.laboratory = {
                        id: labId,
                        label: labLabel
                    };
                    payload.otherDating.number = otherNumberInput.value
                } 
            }
        }
        
        if (absoluteDatingId) { // Update (PUT) --------------------------------------------
            axios.put(`api/absolute_datings/${absoluteDatingId}`, payload)
            .then(response => {
                console.log(response.data);
                toast.success("dating updated");
            })
            .catch(error => {
                console.error('Error during PUT request to update absolute dating:', error);
                alert("action failed");
            });

        } else { // Create (POST) ----------------------------------------------------------
            axios.post('api/absolute_datings', payload)
            .then(response => {
                console.log(response.data);
                toast.success("dating created");

                // Reset form except site, feature and sample dropdown ------------
                const selectedSiteValue    = absoluteDating_site_dropdown.value;
                const selectedFeatureValue = absoluteDating_feature_dropdown.value;
                const selectedSampleValue  = absoluteDating_sample_dropdown.value;
                resetAbsoluteDatingForm();
                absoluteDating_site_dropdown.value    = selectedSiteValue;
                absoluteDating_feature_dropdown.value = selectedFeatureValue;
                absoluteDating_sample_dropdown.value  = selectedSampleValue;
                // ----------------------------------------------------------------
            })
            .catch(error => {
                console.error('Error during POST request to create absolute dating:', error);
                alert("action failed");
            });
        }        

    } else { // Report --------------------------
        // Set focus on invalid field
        absoluteDating_sample_dropdown.focus();

        // wait until focus is set
        setTimeout(() => {
            absoluteDating_form.reportValidity();
        }, 450);
    } // ----------------------------------------
}

function resetAbsoluteDatingForm() {
    absoluteDating_form.reset();

    absoluteDatingLiteratureList = [];
    document.getElementById("absDating_literature_container").innerHTML = "";

    $('#material').val(null).trigger('change');
    $('#dating_method').val(null).trigger('change');
    $('#c14_lab').val(null).trigger('change');
}
