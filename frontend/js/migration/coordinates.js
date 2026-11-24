// Coordinates accordion: two Tabulators (sites, samples; only the visible rows are rendered), the rows are plain objects.
// The coordinate system of ArboDat is shown; the DANTE coordinate system is chosen (copied to the other selected rows),
// lon / lat WGS84 are computed from it (not for coordinate systems without EPSG code, e.g. 'local').

let siteCoordinateTable = null;
let sampleCoordinateTable = null;
let coordinateRowCounter = 0;

// Coordinates per bulk request (requests are sent one after another)
const COORDINATE_CHUNK_SIZE = 500;

function toCoordinateRow(item) {
    const isSample = item.type === "sample";
    return {
        id:                      `coordinate_${++coordinateRowCounter}`,
        type:                    item.type, // site or sample
        entityId:                item.id,
        siteLabel:               isSample ? item.siteLabel : item.label,
        featureLabel:            isSample ? item.featureLabel : "",
        sampleLabel:             isSample ? item.label : "",
        longitude:               item.longitude,
        latitude:                item.latitude,
        altitude:                item.altitude,
        zcoordinate:             item.zcoordinate, // shown only, the new database uses the altitude
        arbodatCoordinateSystem: item.coordinateSystem ?? "",
        coordinateSystem:        null, // uri (DANTE)
        longitudeWgs84:          null,
        latitudeWgs84:           null,
        remarks:                 item.remarks ?? "",
        error:                   "",   // reason, if the last 'Create' failed
    };
}

async function populateCoordinates(coordinateList) {
    await loadDanteListOptions(["coordinateSystem"]);

    const rows = coordinateList.map(toCoordinateRow);
    const siteRows   = rows.filter(row => row.type === "site");
    const sampleRows = rows.filter(row => row.type === "sample");

    // Sites migrated later: add the rows to the tables
    if (siteCoordinateTable) {
        siteCoordinateTable.addData(siteRows);
        sampleCoordinateTable.addData(sampleRows);
        return;
    }
    siteCoordinateTable   = createCoordinateTable("site", siteRows);
    sampleCoordinateTable = createCoordinateTable("sample", sampleRows);
}

// WGS84 -----------------------------------------------------------------------------------------

// EPSG code of a DANTE coordinate system (none e.g. for 'local')
function coordinateSystemEpsg(uri) {
    const notation = cachedCoordinateSystems.find(system => system.uri === uri)?.notation;
    return Array.isArray(notation) ? notation[0] : notation;
}

// lon / lat WGS84 of a row, or null if they can't be computed (the fields then keep their values)
async function computeWgs84(data) {
    const longitude = parseFloat(data.longitude);
    const latitude  = parseFloat(data.latitude);
    const epsg = coordinateSystemEpsg(data.coordinateSystem);
    if (!longitude || !latitude || !epsg) return null;

    try {
        const { transformedLongitude, transformedLatitude } = await transformCoordinatesToWGS84(longitude, latitude, epsg);
        if (transformedLongitude == null || transformedLatitude == null
                || isNaN(transformedLongitude) || isNaN(transformedLatitude)) return null;
        return { longitudeWgs84: Number(transformedLongitude), latitudeWgs84: Number(transformedLatitude) };
    } catch {
        console.log("failed to transform coordinates to WGS84");
        return null;
    }
}

// The coordinate system chosen in a selected row goes to all selected rows; lon / lat WGS84 of the rows are computed
async function applyCoordinateSystem(table, row, uri) {
    const rows = row.isSelected() ? table.getSelectedData() : [row.getData()];
    const updates = await Promise.all(rows.map(async data => ({
        id: data.id,
        coordinateSystem: uri,
        ...await computeWgs84({ ...data, coordinateSystem: uri }),
    })));
    await updateTableRows(table, updates);
}

// Table -------------------------------------------------------------------------------------------

function createCoordinateTable(type, rows) {
    const isSample = type === "sample";
    const systemLabels = danteListOptions.get("coordinateSystem").labels;
    const table = () => isSample ? sampleCoordinateTable : siteCoordinateTable;

    const numberColumn = (title, field) => ({
        title, field, headerSort: false, minWidth: 100,
        editor: "number", formatter: placeholderFormatter("enter"),
    });

    // alt of a sample: empty with a z value of ArboDat -> button which takes the z value
    // (a press on the button doesn't start editing the cell; a click beside it does)
    let pressedUseZ = false;
    const altitudeColumn = {
        ...numberColumn("alt", "altitude"),
        formatter: cell => usesZValue(cell.getRow().getData())
            ? `<button type="button" class="use-z-value">use z value</button>`
            : placeholderFormatter("enter")(cell),
        editable: () => !pressedUseZ,
        cellClick: (e, cell) => {
            pressedUseZ = false;
            if (e.target.closest(".use-z-value")) useZValue(table(), cell.getRow());
        },
    };

    const instance = newTabulator(document.getElementById(isSample ? "sampleCoordinateTable" : "siteCoordinateTable"), {
        data: rows,
        index: "id",
        maxHeight: "70vh",
        layout: "fitData", // columns as wide as their content, the rows end after the last column (as in the explorer)
        placeholder: isSample ? "no sample coordinates" : "no site coordinates",
        columns: [
            selectionColumn(),
            filterValuesColumn("Site", "siteLabel"),
            ...(isSample ? [filterValuesColumn("Feature", "featureLabel"), filterValuesColumn("Sample", "sampleLabel")] : []),
            numberColumn(isSample ? "lon/x" : "lon", "longitude"),
            numberColumn(isSample ? "lat/y" : "lat", "latitude"),
            ...(isSample ? [{title: "z", field: "zcoordinate", headerSort: false, formatter: "plaintext"}] : []),
            isSample ? altitudeColumn : numberColumn("alt", "altitude"),
            filterValuesColumn("coordinateSystem", "arbodatCoordinateSystem"),
            {title: "dante coordinateSystem", field: "coordinateSystem", headerSort: false, minWidth: 220, maxWidth: 320,
                tooltip: (e, cell) => cell.getElement().classList.contains("tabulator-editing") ? "" : escapeHtml(systemLabels.get(cell.getValue()) ?? ""),
                editor: singleSelectEditor, editorParams: danteEditorParams("coordinateSystem"),
                formatter: placeholderFormatter("select", uri => systemLabels.get(uri) ?? uri)},
            numberColumn("lon WGS84", "longitudeWgs84"),
            numberColumn("lat WGS84", "latitudeWgs84"),
            {title: "remarks", field: "remarks", headerSort: false, minWidth: 140,
                editor: "input", formatter: placeholderFormatter("enter")},
            {title: "Create", headerSort: false, hozAlign: "center", width: 80, // as wide as the button
                formatter: cell => {
                    const error = cell.getRow().getData().error;
                    return `<button type="button">Create</button>
                            ${error ? `<div class="text-danger small text-wrap">${escapeHtml(error)}</div>` : ""}`;
                },
                cellClick: (e, cell) => {
                    if (e.target.closest("button")) createCoordinates(table(), cell.getRow());
                },
            },
            {title: "Add to JSON", headerSort: false, hozAlign: "center", width: 110, // as wide as the button
                formatter: () => `<button type="button">Add&#8239;to&#8239;JSON</button>`,
                cellClick: (e, cell) => {
                    if (e.target.closest("button")) addCoordinatesToJSON(table(), cell.getRow());
                },
            },
        ],
    });
    // Before the cell gets the focus (Tabulator starts editing on focus)
    instance.element.addEventListener("mousedown", event => {
        pressedUseZ = !!event.target.closest(".use-z-value");
    }, true);
    // The coordinate system is copied to the selected rows by applyCoordinateSystem (with their WGS84 values)
    setupMigrationTable(instance, {
        counter: document.getElementById(isSample ? "sampleCoordinateCounter" : "siteCoordinateCounter"),
    });
    instance.on("cellEdited", async cell => {
        const field = cell.getField();
        if (field === "coordinateSystem") {
            await applyCoordinateSystem(instance, cell.getRow(), cell.getValue());
        } else if (field === "longitude" || field === "latitude") {
            const wgs84 = await computeWgs84(cell.getRow().getData());
            if (wgs84) await updateTableRows(instance, [{ id: cell.getRow().getData().id, ...wgs84 }]);
        }
    });
    return instance;
}

// alt is empty, but ArboDat has a z value
function usesZValue(data) {
    const empty = value => value === null || value === undefined || value === "";
    return empty(data.altitude) && !empty(data.zcoordinate);
}

// 'use z value': alt = z for the clicked row and for the other selected rows with an empty alt and a z value
function useZValue(table, row) {
    const rows = row.isSelected() ? table.getSelectedData().filter(usesZValue) : [row.getData()];
    return updateTableRows(table, rows.map(data => ({ id: data.id, altitude: Number(data.zcoordinate) })));
}

// Tabulator can't measure itself in a collapsed accordion -> redraw when it is opened
document.addEventListener("shown.bs.collapse", event => {
    if (event.target.id === "panelsStayOpen-collapseSix" && siteCoordinateTable) {
        siteCoordinateTable.redraw();
        sampleCoordinateTable.redraw();
    }
});

// Create ----------------------------------------------------------------------------------------

const numberOrNull = value => {
    const number = parseFloat(value);
    return isNaN(number) ? null : number;
};

// Checks a coordinate row. Returns { item } or { reason, message } if it can not be created yet.
function buildCoordinateItem(data) {
    const longitude = numberOrNull(data.longitude);
    if (!longitude) {
        return { reason: "no longitude", message: "No longitude entered." };
    }
    const latitude = numberOrNull(data.latitude);
    if (!latitude) {
        return { reason: "no latitude", message: "No latitude entered." };
    }
    if (!data.coordinateSystem) {
        return { reason: "no coordinate system", message: "No coordinateSystem selected." };
    }
    const system = cachedCoordinateSystems.find(item => item.uri === data.coordinateSystem);

    return { item: {
        clientId: data.id,
        type: data.type,
        id: data.entityId,
        coordinate: {
            longitude,
            latitude,
            altitude:          numberOrNull(data.altitude),
            longitudeWgs84:    numberOrNull(data.longitudeWgs84),
            latitudeWgs84:     numberOrNull(data.latitudeWgs84),
            remarksCoordinate: data.remarks,
            // label and EPSG code only for a coordinate system which is not stored yet (an existing one is only referenced)
            coordinateSystem: {
                id:    data.coordinateSystem,
                label: system?.prefLabel?.en ?? null,
                epsg:  coordinateSystemEpsg(data.coordinateSystem) ?? null,
            },
        },
    } };
}

// 'Create' button: creates the coordinate of the clicked row and of all other selected rows of the table
async function createCoordinates(table, row) {
    const data = row.getData();

    const clicked = buildCoordinateItem(data);
    if (!clicked.item) {
        toast.info(clicked.message);
        return;
    }

    const items = [clicked.item];
    const skippedReasons = [];
    table.getSelectedData().forEach(other => {
        if (other.id === data.id) return;
        const entry = buildCoordinateItem(other);
        if (entry.item) {
            items.push(entry.item);
        } else {
            skippedReasons.push(entry.reason);
        }
    });

    const created = [];
    const errors = [];
    showLoading();
    try {
        for (let i = 0; i < items.length; i += COORDINATE_CHUNK_SIZE) {
            const chunk = items.slice(i, i + COORDINATE_CHUNK_SIZE);
            try {
                const response = await axios.post("api/coordinates/bulk", chunk);
                response.data.forEach(status => {
                    if (status.status === "created") created.push(status.clientId);
                    else errors.push({ id: status.clientId, error: status.message || "failed" });
                });
            } catch (error) {
                console.error("Error during bulk creation of coordinates: ", error);
                const message = getErrorMessage(error);
                chunk.forEach(item => errors.push({ id: item.clientId, error: message }));
            }
        }

        if (created.length > 0) await deleteTableRows(table, created);
        if (errors.length > 0)  await updateTableRows(table, errors);
    } finally {
        hideLoading();
    }

    // Summary --------------------------------------------------
    // A message also for one row (a failed single row: its error, below)
    if (items.length > 1 || skippedReasons.length > 0 || errors.length === 0) {
        let message = `${created.length} ${created.length === 1 ? "coordinate" : "coordinates"} created.`;
        if (skippedReasons.length > 0) {
            message += ` ${skippedReasons.length} selected skipped (${[...new Set(skippedReasons)].join(", ")}).`;
        }
        if (errors.length > 0) {
            message += ` ${errors.length} failed (see the rows).`;
        }
        (errors.length > 0 ? toast.error : toast.success)(message);
    } else if (errors.length > 0) {
        toast.error("Failed to create coordinate: " + errors[0].error);
    }
}

// Add to JSON -----------------------------------------------------------------------------------

// Adds the clicked coordinate and all coordinates of the same table with the same coordinate system of ArboDat
// (for a coordinate system which is not in DANTE)
function addCoordinatesToJSON(table, row) {
    const data = row.getData();
    const label = data.arbodatCoordinateSystem;
    const rows = table.getRows().filter(other => other === row || other.getData().arbodatCoordinateSystem === label);

    addGroupToJSON({
        itemType: data.type === "site" ? "coordinateSite" : "coordinateSample",
        nonMatching_coordinateSystem: label,
        items: rows.map(other => {
            const values = other.getData();
            return {
                [values.type === "site" ? "siteId" : "sampleId"]: values.entityId,
                latitude:       numberOrNull(values.latitude),
                longitude:      numberOrNull(values.longitude),
                altitude:       numberOrNull(values.altitude),
                longitudeWgs84: numberOrNull(values.longitudeWgs84),
                latitudeWgs84:  numberOrNull(values.latitudeWgs84),
                remarks:        values.remarks,
            };
        }),
    }, rows, [], rows => deleteTableRows(table, rows.map(row => row.getData().id)));
}
