function formatSite(sites, siteId) {
    if (!siteId) return "";
    const site = sites.find(s => s.id === siteId) || null;
    return site?.label ?? siteId
}

function formatFeature(features, featureId) {
    if (!featureId) return "";
    const feature = features.find(f => f.id === featureId) || null;
    return feature?.label ?? featureId
}

function formatSample(samples, sampleId) {
    if (!sampleId) return "";
    const sample = samples.find(s => s.id === sampleId) || null;
    return sample?.label ?? sampleId
}

function formatInst(institutions, institutionList) {
    if (!institutionList) return "";

    // HTML download
    if (!Array.isArray(institutionList)) return institutionList;

    return institutionList
        .map(id => {
            const institution = institutions.find(institution => institution.id === id)
            return institution?.label ?? id ?? "";
        })
        .filter(Boolean)
        .join(", ");
}

function formatLit(literature, literatureList) {
    if (!literatureList) return "";

    // HTML download
    if (!Array.isArray(literatureList)) return literatureList;

    return literatureList
        .map(id => {
            const lit = literature.find(lit => lit.id === id)
            return formatLiterature(lit) ?? id ?? "";
        })
        .filter(Boolean)
        .join(", ");
}

function formatUser(users, userList) {
    if (!userList) return "";

    // HTML download
    if (!Array.isArray(userList)) return userList;

    return userList
        .map(id => {
            const user = users.find(user => user.id === id)
            return formatName(user) ?? id ?? "";
        })
        .filter(Boolean)
        .join(", ");
}

function formatCoordinateSystem(coordinateSystemId) {
    if (!coordinateSystemId) return "";
    const coordinateSystem = cachedCoordinateSystems.find(cs => cs.uri === coordinateSystemId) || null;
    return [coordinateSystem?.prefLabel.en, coordinateSystem?.notation]
        .filter(Boolean)
        .join(" - ")
        || coordinateSystemId;
}

// Set a value in `obj` by a Tabulator field path, e.g. "taxCode.id" -> obj.taxCode.id
function setNestedValue(obj, path, value) {
    const keys = path.split(".");
    let target = obj;
    keys.slice(0, -1).forEach(key => {
        target[key] = target[key] ?? {};
        target = target[key];
    });
    target[keys[keys.length - 1]] = value;
}


// Start of every "cellEdited" handler: the rows the edit is saved to (the edited row and all selected rows).
// applies(row): optional filter for rows the edited field does not apply to.
// Asks for confirmation. Returns null if there is nothing to save or the user declines (the edit is taken back then).
async function getRowsToUpdate(table, cell, entity, plural, applies = () => true) {
    const rows = table.getSelectedRows();
    const editedRow = cell.getRow();
    if (!rows.includes(editedRow)) {
        rows.push(editedRow);
    }

    const rowsToUpdate = rows.filter(applies);
    if (rowsToUpdate.length === 0) return null;

    if (!await confirmCellUpdate(rowsToUpdate.length, entity, plural)) {
        cell.restoreOldValue();
        return null;
    }
    return rowsToUpdate;
}

// Set a (nested) field of a row after it was saved. row.update({"a.b": value}) would store a flat key "a.b"
// and blank the cell, so the top-level object ("a") is updated instead.
function updateRowField(row, field, value) {
    const root = field.split(".")[0];
    const copy = { [root]: JSON.parse(JSON.stringify(row.getData()[root] ?? null)) };
    if (field === root) {
        copy[root] = value;
    } else {
        copy[root] = copy[root] ?? {};
        setNestedValue(copy, field, value);
    }
    return row.update(copy);
}

// The same message of a multi-row action (it fails row by row) is shown only once
const reportedExplorerErrors = new Set();
function reportExplorerError(message) {
    if (reportedExplorerErrors.has(message)) return;
    reportedExplorerErrors.add(message);
    setTimeout(() => reportedExplorerErrors.delete(message), 3000);
    toast.error(message);
}

// A failed update: tell the user and take back the edit of the edited cell.
// The other selected rows are only changed in the table after their request succeeded.
function handleUpdateError(cell, row, entity, error) {
    console.error(`Error updating ${entity}:`, error);
    reportExplorerError(`Could not save ${entity}: ${getErrorMessage(error)}`);
    if (row === cell.getRow()) {
        cell.restoreOldValue();
    }
}

// A failed delete: the row stays in the table
function handleDeleteError(entity, error) {
    console.error(`Error deleting ${entity}:`, error);
    reportExplorerError(`Could not delete ${entity}: ${getErrorMessage(error)}`);
}


// Tabulator puts the string a formatter returns into innerHTML: escape the text of a label formatter.
// formatter.raw is the plain-text version, for code which needs the label itself (JSON download).
function textFormatter(format) {
    const formatter = (cell, formatterParams, onRendered) => {
        const text = format(cell, formatterParams, onRendered);
        return typeof text === "string" ? escapeHtml(text) : text;
    };
    formatter.raw = format;
    return formatter;
}

// The same for the labels of the list editors and list header filters (Tabulator puts them into innerHTML as well)
function escapeListLabels(columns) {
    const withItemFormatter = params => {
        const add = p => ({ itemFormatter: label => escapeHtml(label), ...p });
        return typeof params === "function" ? (...args) => add(params(...args)) : add(params);
    };
    for (const column of columns) {
        if (column.columns) escapeListLabels(column.columns);
        if (column.editor === "list") column.editorParams = withItemFormatter(column.editorParams);
        if (column.headerFilter === "list") column.headerFilterParams = withItemFormatter(column.headerFilterParams);
    }
}

// new Tabulator(...) for the explorer tables
function newTabulator(selector, options) {
    escapeListLabels(options.columns);
    return new Tabulator(selector, options);
}
