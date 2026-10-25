// Settings page: edit the default values of the select fields in the input forms

const SETTINGS_SECTIONS = [
    { title: "RESEARCH PROJECT", fields: [
        { key: "license", label: "license", attribute: "license" },
    ]},
    { title: "SITE", fields: [
        { key: "taxonomy",             label: "taxonomy",          attribute: "taxonomy" },
        { key: "siteType",             label: "site type",         attribute: "siteType", multiple: true },
        { key: "naturalUnit",          label: "natural unit",      attribute: "naturalUnit" },
        { key: "siteCoordinateSystem", label: "coordinate system", attribute: "coordinateSystem" },
    ]},
    { title: "FEATURE", fields: [
        { key: "featureType",           label: "feature type",           attribute: "featureType" },
        { key: "preservationCondition", label: "preservation condition", attribute: "preservationCondition" },
    ]},
    { title: "SAMPLE", fields: [
        { key: "chronozone",             label: "chronozone",             attribute: "chronozone" },
        { key: "sampleType",             label: "sample type",            attribute: "sampleType" },
        { key: "seedsAndFruits",         label: "seeds and fruits",       attribute: "seedsAndFruits" },
        { key: "charcoalInvestigated",   label: "charcoal investigated",  attribute: "charcoalInvestigated" },
        { key: "woodSubfossile",         label: "wood subfossile",        attribute: "woodSubfossile" },
        { key: "sampleCoordinateSystem", label: "coordinate system",      attribute: "coordinateSystem" },
    ]},
    { title: "ABSOLUTE DATING", fields: [
        { key: "datingMethod",  label: "dating method",   attribute: "datingMethod" },
        { key: "material",      label: "material",        attribute: "material" },
        { key: "c14Laboratory", label: "C14 laboratory",  attribute: "c14Laboratory" },
    ]},
    { title: "RESULTS", fields: [
        { key: "restType",             label: "rest type",             attribute: "restType" },
        { key: "stateOfPreservation",  label: "state of preservation", attribute: "stateOfPreservation" },
        { key: "classificationConfer", label: "classification confer", attribute: "classificationConfer" },
    ]},
];

const settingsFields = SETTINGS_SECTIONS.flatMap(section => section.fields);
const settingsSelectId = field => `default_${field.key}`;

// Build accordion ------------------------------------------------------------
function buildSettingsAccordion() {
    const accordion = document.getElementById("settingsAccordion");

    SETTINGS_SECTIONS.forEach((section, index) => {
        const rows = section.fields.map(field => `
            <div class="row">
              <div class="col-25">
                <label for="${settingsSelectId(field)}">${field.label}:</label>
              </div>
              <div class="col-75">
                <select id="${settingsSelectId(field)}" style="width: 100%;" ${field.multiple ? "multiple" : ""}>
                  ${field.multiple ? "" : '<option value=""></option>'}
                </select>
              </div>
            </div>`).join("");

        accordion.insertAdjacentHTML("beforeend", `
            <div class="accordion-item">
              <h2 class="accordion-header">
                <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#settings_collapse_${index}" aria-expanded="false">
                  ${section.title}
                </button>
              </h2>
              <div id="settings_collapse_${index}" class="accordion-collapse collapse">
                <div class="accordion-body">
                  <fieldset>${rows}</fieldset>
                </div>
              </div>
            </div>`);
    });
}

// Populate dropdowns and preselect stored defaults ---------------------------
document.addEventListener("DOMContentLoaded", async () => {
    buildSettingsAccordion();

    for (const field of settingsFields) {
        const select = document.getElementById(settingsSelectId(field));

        await fetchDanteAttribute(field.attribute);
        populateDanteDropdown(field.attribute, select);

        $(select).select2({ placeholder: "", allowClear: true, width: "100%" });
        $(select).next('.select2-container').find('.select2-selection__arrow').remove();
    }

    const defaultValues = await loadDefaultValues();
    for (const field of settingsFields) {
        const select = document.getElementById(settingsSelectId(field));

        // skip stale defaults (uris which are not in the dropdown anymore)
        const availableUris = Array.from(select.options).map(option => option.value);
        const uris = (defaultValues[field.key] || []).filter(uri => availableUris.includes(uri));

        if (uris.length > 0) {
            $(select).val(field.multiple ? uris : uris[0]).trigger('change');
        }
    }
});

// Save -----------------------------------------------------------------------
document.getElementById("saveDefaultValuesButton").addEventListener("click", () => {
    const payload = {};
    for (const field of settingsFields) {
        const value = $(document.getElementById(settingsSelectId(field))).val();
        const uris = (Array.isArray(value) ? value : [value]).filter(uri => uri);
        if (uris.length > 0) {
            payload[field.key] = uris;
        }
    }

    axios.put('api/default_values', payload)
        .then(response => {
            console.log(response.data);
            toast.success("default values saved");
        })
        .catch(error => {
            console.error('Error during PUT request to save default values:', error);
            alert("action failed");
        });
});
