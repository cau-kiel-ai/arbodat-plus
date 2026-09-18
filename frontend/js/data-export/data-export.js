// Export file name placeholder -------------------------------------------------
/*
Recomputes the current export file name and shows it as placeholder text
(only visible while the input itself is empty, it never overwrites a typed value)
*/
function updateExportFileNamePlaceholder() {
    const { level, names } = determineExportFilter();
    const exportFileName = buildExportFileName(level, names);

    document.getElementById('exportFileNameInput').placeholder = exportFileName;
}

// React to any dropdown change
$('#researchProjectDropdown, #siteDropdown, #featureDropdown, #sampleDropdown')
    .on('change', updateExportFileNamePlaceholder);

// Set the initial placeholder ("ArboDat+_Export_all_<date>") on page load
updateExportFileNamePlaceholder();

// Lookup maps: id -> display name (used for export file name)
let researchProjectNames = {};
let siteLabels           = {};
let featureLabels        = {};
let sampleLabels         = {};

// Select2 research project multi-select boxes ----------------------------------
$('#researchProjectDropdown')
    .select2({placeholder: 'Loading ...'})
    .prop('disabled', true);

$(document).ready(async function () {
    try {
        // Get research projects
        const response = await axios.get('api/research_projects');
        const researchProjects = response.data;

        // Reset multi-select
        $('#researchProjectDropdown')
            .select2('destroy')
            .select2({placeholder: ''})
            .prop('disabled', true);

        researchProjects.forEach(item => {
            const option = document.createElement('option');
            
            option.value = item.id;
            option.textContent = item.projectName;

            researchProjectNames[item.id] = item.projectName;

            $('#researchProjectDropdown').append(option);
        });

    } catch(error) {
        console.error('Error during research projects GET request: ', error);

    } finally {
        // Enable multi-select
        $('#researchProjectDropdown').prop('disabled', false);
    }
});

// Select2 site multi-select boxes ----------------------------------------------
$('#siteDropdown')
    .select2({placeholder: ''})
    .prop('disabled', true);

$('#researchProjectDropdown').on('change', async function () {
    const selectedResearchProjectIds = $('#researchProjectDropdown').val() || [];

    if (selectedResearchProjectIds.length === 0) {
        // Reset and disable multi-select
        $('#siteDropdown')
            .empty()
            .trigger('change')
            .prop('disabled', true);

        return
    }

    // Disable multi-select and show "Loading ..."
    $('#siteDropdown')
        .select2('destroy')
        .select2({placeholder: 'Loading ...'})
        .prop('disabled', true)
        .empty()
        .trigger('change');

    try {
        // Get sites
        const response = await axios.get('api/sites');

        // Reset multi-select
        $('#siteDropdown')
            .select2('destroy')
            .select2({placeholder: ''})
            .prop('disabled', true);
        
        // Filter sites that match the selected research projects
        const filteredItems = response.data.filter(item =>
            item.researchProjectList.some(rp =>
                selectedResearchProjectIds.includes(rp.id)
            )
        );

        filteredItems.forEach(item => {
            const option = document.createElement('option');

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
            
            option.value = item.id;
            option.textContent = itemName;

            siteLabels[item.id] = item.label;

            $('#siteDropdown').append(option);
        });

    } catch(error) {
        console.error('Error during sites GET request: ', error);

    } finally {
        // Enable multi-select
        $('#siteDropdown').prop('disabled', false)
    }
});

// Select2 feature multi-select boxes -------------------------------------------
$('#featureDropdown')
    .select2({placeholder: ''})
    .prop('disabled', true);

$('#siteDropdown').on('change', async function () {
    const selectedSiteIds = $('#siteDropdown').val() || [];

    if (selectedSiteIds.length === 0) {
        // Reset and disable dropdown
        $('#featureDropdown')
            .empty()
            .trigger('change')
            .prop('disabled', true);

        return
    }

    // Disable multi-select and show "Loading ..."
    $('#featureDropdown')
        .select2('destroy')
        .select2({placeholder: 'Loading ...'})
        .prop('disabled', true)
        .empty()
        .trigger('change');

    try {
        // Get features
        const response = await axios.get('api/features');

        // Reset multi-select
        $('#featureDropdown')
            .select2('destroy')
            .select2({placeholder: ''})
            .prop('disabled', true);
        
        // Filter features that match the selected sites
        const filteredItems = response.data.filter(item =>
            selectedSiteIds.includes(item.site?.id)
        );

        filteredItems.forEach(item => {
            const option = document.createElement('option');
            
            option.value = item.id;
            option.textContent = item.label;

            featureLabels[item.id] = item.label;

            $('#featureDropdown').append(option);
        });

    } catch(error) {
        console.error('Error during features GET request: ', error);

    } finally {
        // Enable multi-select
        $('#featureDropdown').prop('disabled', false)
    }
});

// Select2 sample multi-select boxes --------------------------------------------
$('#sampleDropdown')
    .select2({placeholder: ''})
    .prop('disabled', true);

$('#featureDropdown').on('change', async function () {
    const selectedFeatureIds = $('#featureDropdown').val() || [];

    if (selectedFeatureIds.length === 0) {
        // Reset and disable multi-select
        $('#sampleDropdown')
            .empty()
            .trigger('change')
            .prop('disabled', true);

        return
    }

    // Disable multi-select and show "Loading ..."
    $('#sampleDropdown')
        .select2('destroy')
        .select2({placeholder: 'Loading ...'})
        .prop('disabled', true)
        .empty()
        .trigger('change');

    try {
        // Get samples
        const response = await axios.get('api/samples');

        // Reset multi-select
        $('#sampleDropdown')
            .select2('destroy')
            .select2({placeholder: ''})
            .prop('disabled', true)
        
        // Filter samples that match the selected features
        const filteredItems = response.data.filter(item =>
            selectedFeatureIds.includes(item.feature?.id)
        );

        filteredItems.forEach(item => {
            const option = document.createElement('option');
            
            option.value = item.id;
            option.textContent = item.label;

            sampleLabels[item.id] = item.label;

            $('#sampleDropdown').append(option);
        });

    } catch(error) {
        console.error('Error during samples GET request: ', error);

    } finally {
        // Enable multi-select
        $('#sampleDropdown').prop('disabled', false)
    }
});

// Export -----------------------------------------------------------------------

/*  
Determines the deepest selected dropdown level
and returns its ids + display names. Deepest wins:
samples > features > sites > researchProjects > none.
*/
function determineExportFilter() {
    const selectedSamples = $('#sampleDropdown').val() || [];
    if (selectedSamples.length > 0) {
        return {
            level: 'samples',
            ids: selectedSamples,
            names: selectedSamples.map(id => sampleLabels[id] || id)
        };
    }

    const selectedFeatures = $('#featureDropdown').val() || [];
    if (selectedFeatures.length > 0) {
        return {
            level: 'features',
            ids: selectedFeatures,
            names: selectedFeatures.map(id => featureLabels[id] || id)
        };
    }

    const selectedSites = $('#siteDropdown').val() || [];
    if (selectedSites.length > 0) {
        return {
            level: 'sites',
            ids: selectedSites,
            names: selectedSites.map(id => siteLabels[id] || id)
        };
    }

    const selectedResearchProjects = $('#researchProjectDropdown').val() || [];
    if (selectedResearchProjects.length > 0) {
        return {
            level: 'research_projects',
            ids: selectedResearchProjects,
            names: selectedResearchProjects.map(id => researchProjectNames[id] || id)
        };
    }

    return { level: 'NONE', ids: [], names: [] };
}

/*
Removes diacritics and anything that isn't alphanumeric, mirrors the backend sanitizing.
*/
function sanitizeNamePart(raw) {
    const MAX_NAME_PART_LENGTH = 40;

    if (!raw) return 'untitled';

    const normalized = raw.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    let cleaned = normalized
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    if (!cleaned) cleaned = 'untitled';
    if (cleaned.length > MAX_NAME_PART_LENGTH) {
        cleaned = cleaned.substring(0, MAX_NAME_PART_LENGTH);
    }
    return cleaned;
}

/*
Builds "ArboDat+_Export_<level>_<name1>_<name2>_..._<date>"
*/
function buildExportFileName(level, names) {
    const MAX_NAMES_IN_FILENAME = 5;
    const MAX_TOTAL_LENGTH = 150;

    const date = new Date().toISOString().slice(0, 10); // yyyy-MM-dd

    let base = 'ArboDat+_Export';

    if (level !== 'NONE') {
        if (level === "research_projects") {
            base += `_researchProjects`;
        } else {
            base += `_${level}`;
        }

        const limit = Math.min(names.length, MAX_NAMES_IN_FILENAME);
        for (let i = 0; i < limit; i++) {
            base += `_${sanitizeNamePart(names[i])}`;
        }

        const remaining = names.length - limit;
        if (remaining > 0) {
            base += `_and_${remaining}_more`;
        }
    }

    base += `_${date}`;

    if (base.length > MAX_TOTAL_LENGTH) {
        base = base.substring(0, MAX_TOTAL_LENGTH);
    }

    return base;
}

/*
Light sanitizing for a manually typed file name
(only strips filesystem-unsafe characters)
*/
function sanitizeCustomFileName(raw) {
    return raw.replace(/[\\/:*?"<>|]+/g, '-').trim();
}

/*
Triggers a browser download for the given blob data
*/
function downloadBlob(blobData, fileName) {
    const blob = new Blob([blobData], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();

    // Revoke later: WebKit (macOS app window) cancels downloads whose blob URL is already revoked.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/*
Reads the error message out of the (blob-typed) error response
*/
async function handleExportError(error) {
    console.error('Error during data export: ', error);

    let message = 'Data export failed.';
    if (error.response?.data instanceof Blob) {
        try {
            const text = await error.response.data.text();
            if (text) message = text;
        } catch (_) {
            // keep default message
        }
    }
    alert(message);
}

async function exportData() {
    const exportButton = document.getElementById('exportButton');

    const { level, ids, names } = determineExportFilter();

    const customExportFileName = $('#exportFileNameInput').val().trim();
    const exportFileName = customExportFileName
        ? sanitizeCustomFileName(customExportFileName)
        : buildExportFileName(level, names);

    const params = { export_file_name: exportFileName };
    if (level !== 'NONE') {
        params[level] = ids.join(',');
    }

    exportButton.disabled = true;
    exportButton.textContent = 'Exporting ...';

    try {
        const response = await axios.get(`api/data_export`, {
            params,
            responseType: 'blob'
        });

        downloadBlob(response.data, `${exportFileName}.json`);

    } catch (error) {
        await handleExportError(error);

    } finally {
        exportButton.disabled = false;
        exportButton.textContent = "Export";
    }
}
