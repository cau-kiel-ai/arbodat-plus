// Default values for select fields in the input forms.
// The defaults are edited on settings.html and stored in the backend (api/default_values).

// entity -> [default key, select id, multiple]
const DEFAULT_VALUE_SELECTS = {
    project: [
        ["license", "licenseDropdown"],
    ],
    site: [
        ["taxonomy",             "taxonomy"],
        ["siteType",             "site_type", true],
        ["naturalUnit",          "natural_unit"],
        ["siteCoordinateSystem", "site_coordinate_system"],
    ],
    feature: [
        ["featureType",           "feature_type"],
        ["preservationCondition", "preservation_condition"],
    ],
    sample: [
        ["chronozone",             "chronozone"],
        ["sampleType",             "sample_type"],
        ["seedsAndFruits",         "seedsAndFruits"],
        ["charcoalInvestigated",   "charcoalInvestigated"],
        ["woodSubfossile",         "woodSubfossile"],
        ["sampleCoordinateSystem", "sample_coordinate_system"],
    ],
    absoluteDating: [
        ["datingMethod",  "dating_method"],
        ["material",      "material"],
        ["c14Laboratory", "c14_lab"],
    ],
    result: [
        ["restType",             "restType"],
        ["stateOfPreservation",  "state_of_preservation"],
        ["classificationConfer", "cf"],
    ],
};

// Load default values once ({key: [uri, ...]});
// forms keep working without defaults if the request fails
let defaultValuesPromise = null;
let defaultValuesLoadFailed = false; // the Settings page must not save then: the stored defaults would be deleted
function loadDefaultValues() {
    if (!defaultValuesPromise) {
        defaultValuesPromise = axios.get('api/default_values')
            .then(response => response.data || {})
            .catch(error => {
                console.error('Error during GET request to load default values:', error);
                defaultValuesLoadFailed = true;
                return {};
            });
    }
    return defaultValuesPromise;
}

// Preselect the default values of an entity's select fields (create mode only).
// selectIds: optional list of select ids to restrict the update to.
async function applyDefaults(entity, selectIds = null) {
    const defaultValues = await loadDefaultValues();

    for (const [key, selectId, multiple] of DEFAULT_VALUE_SELECTS[entity] || []) {
        if (selectIds && !selectIds.includes(selectId)) continue;

        const select = document.getElementById(selectId);
        if (!select) continue;

        // skip stale defaults (uris which are not in the dropdown anymore)
        const availableUris = Array.from(select.options).map(option => option.value);
        const uris = (defaultValues[key] || []).filter(uri => availableUris.includes(uri));
        if (uris.length === 0) continue;

        $(select).val(multiple ? uris : uris[0]).trigger('change');
    }
}
