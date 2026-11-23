// Labs and numbers accordion: two Tabulators (only the visible rows are rendered), the rows are plain objects.
//   C14 datings:   C14 laboratory from DANTE (or a new code for the JSON) + number
//   other datings: laboratory of ArboDat+ (or a new one, typed in) + number

let c14LabTable = null;
let labTable = null;
let labRowCounter = 0;

// Laboratories of ArboDat+ (dendrochronology and other datings): [{ id, label }]
let laboratories = [];

// Datings per bulk request (requests are sent one after another)
const LAB_CHUNK_SIZE = 500;

function toLabRow(item) {
    return {
        id:               `lab_${++labRowCounter}`,
        absoluteDatingId: item.absoluteDatingId,
        datingMethod:     item.datingMethod, // c14Dating, dendroDating, otherDating
        siteLabel:        item.siteLabel,
        featureLabel:     item.featureLabel,
        sampleLabel:      item.sampleLabel,
        subSample:        item.subSample,
        labAndNumber:     item.labAndNumber,
        c14Laboratory:    null, // uri (DANTE)
        newC14Laboratory: "",   // code which is not in DANTE (for the JSON)
        laboratory:       "",   // label (existing or new laboratory)
        number:           "",
        error:            "",   // reason, if the last 'Update' failed
    };
}

async function loadLaboratories() {
    try {
        laboratories = (await axios.get("api/laboratories")).data;
    } catch (error) {
        console.error("Error during laboratory GET request: ", error);
    }
}

async function populateLabsAndNumbers(labAndNumberList) {
    await Promise.all([loadLaboratories(), loadDanteListOptions(["c14Laboratory"])]);

    const rows = labAndNumberList.map(toLabRow);
    const c14Rows   = rows.filter(row => row.datingMethod === "c14Dating");
    const otherRows = rows.filter(row => row.datingMethod !== "c14Dating");

    // Sites migrated later: add the rows to the tables
    if (c14LabTable) {
        c14LabTable.addData(c14Rows);
        labTable.addData(otherRows);
        return;
    }
    c14LabTable = createC14LabTable(c14Rows);
    labTable    = createLabTable(otherRows);
}

const datingColumns = () => [
    selectionColumn(),
    filterTextColumn("Site", "siteLabel"),
    filterTextColumn("Feature", "featureLabel"),
    filterTextColumn("Sample", "sampleLabel"),
    filterTextColumn("SubSample", "subSample"),
];

const updateColumn = table => ({
    title: "Update", headerSort: false, hozAlign: "center", width: 80, // as wide as the button
    formatter: cell => {
        const error = cell.getRow().getData().error;
        return `<button type="button">Update</button>
                ${error ? `<div class="text-danger small text-wrap">${escapeHtml(error)}</div>` : ""}`;
    },
    cellClick: (e, cell) => {
        if (e.target.closest("button")) updateLabAndNumber(table(), cell.getRow());
    },
});

const numberColumn = {
    title: "Number", field: "number", headerSort: false, minWidth: 100,
    editor: "input", formatter: placeholderFormatter("enter"),
};

function createC14LabTable(rows) {
    const c14Labels = danteListOptions.get("c14Laboratory").labels;

    const table = newTabulator(document.getElementById("C14LabAndNumberTable"), {
        data: rows,
        index: "id",
        maxHeight: "70vh",
        layout: "fitDataFill", // columns as wide as their content (no stretched last column)
        placeholder: "no C14 datings",
        columns: [
            ...datingColumns(),
            {title: "labAndNumber", field: "labAndNumber", headerSort: false, formatter: "plaintext"},
            {title: "C14 laboratory", field: "c14Laboratory", headerSort: false, minWidth: 200, maxWidth: 260,
                tooltip: (e, cell) => c14Labels.get(cell.getValue()) ?? "", // long names are cut off in the cell
                editor: "list", editorParams: { ...danteEditorParams("c14Laboratory"), clearable: true },
                formatter: placeholderFormatter("select", uri => c14Labels.get(uri) ?? uri)},
            numberColumn,
            updateColumn(() => c14LabTable),
            {title: "new C14 laboratory", field: "newC14Laboratory", headerSort: false, minWidth: 130,
                editor: "input", formatter: placeholderFormatter("enter")},
            {title: "Add to JSON", headerSort: false, hozAlign: "center", width: 110, // as wide as the button
                formatter: () => `<button type="button">Add&#8239;to&#8239;JSON</button>`,
                cellClick: (e, cell) => {
                    if (e.target.closest("button")) addC14LabCodesToJSON(cell.getRow());
                },
            },
        ],
    });
    setupMigrationTable(table, {
        counter: document.getElementById("C14LabAndNumberCounter"),
        copyFields: { c14Laboratory: () => true, newC14Laboratory: () => true },
    });
    return table;
}

function createLabTable(rows) {
    const table = newTabulator(document.getElementById("LabAndNumberTable"), {
        data: rows,
        index: "id",
        maxHeight: "70vh",
        layout: "fitDataFill", // columns as wide as their content (no stretched last column)
        placeholder: "no dendrochronological / other datings",
        columns: [
            ...datingColumns(),
            {title: "datingMethod", field: "datingMethod", headerSort: false, formatter: "plaintext"},
            {title: "labAndNumber", field: "labAndNumber", headerSort: false, formatter: "plaintext"},
            // Existing laboratory from the list, or a new one typed in
            {title: "laboratory (select or enter new)", field: "laboratory", headerSort: false, minWidth: 220,
                editor: "list", editorParams: {
                    valuesLookup: () => [...new Set(laboratories.map(laboratory => laboratory.label))],
                    autocomplete: true, freetext: true, listOnEmpty: true, allowEmpty: true, emptyValue: "",
                },
                formatter: placeholderFormatter("select / enter")},
            numberColumn,
            updateColumn(() => labTable),
        ],
    });
    setupMigrationTable(table, {
        counter: document.getElementById("LabAndNumberCounter"),
        copyFields: { laboratory: () => true },
    });
    return table;
}

// Tabulator can't measure itself in a collapsed accordion -> redraw when it is opened
document.addEventListener("shown.bs.collapse", event => {
    if (event.target.id === "panelsStayOpen-collapseNine" && c14LabTable) {
        c14LabTable.redraw();
        labTable.redraw();
    }
});

// Update ---------------------------------------------------------------------------------------

// Checks a dating row. Returns { item } or { reason, message } if it can not be updated yet.
function buildLabAndNumberItem(data) {
    const number = String(data.number ?? "").trim();
    if (!number) {
        return { reason: "no number", message: "No number entered." };
    }

    const item = { clientId: data.id, absoluteDatingId: data.absoluteDatingId, datingMethod: data.datingMethod, number };

    if (data.datingMethod === "c14Dating") {
        if (!data.c14Laboratory) {
            return { reason: "no C14 laboratory", message: "No existing C14Laboratory selected." };
        }
        item.c14Laboratory = { id: data.c14Laboratory, label: danteListOptions.get("c14Laboratory").labels.get(data.c14Laboratory) };
    } else {
        const label = String(data.laboratory ?? "").trim();
        if (!label) {
            return { reason: "no laboratory", message: "Either enter a label to create a new laboratory OR select an existing laboratory from the list." };
        }
        // Without id: the backend uses the laboratory with this label or creates it (once)
        item.laboratory = { label };
    }
    return { item };
}

// 'Update' button: updates the dating of the clicked row and of all other selected rows of the table
async function updateLabAndNumber(table, row) {
    const data = row.getData();

    const clicked = buildLabAndNumberItem(data);
    if (!clicked.item) {
        toast.info(clicked.message);
        return;
    }

    const items = [clicked.item];
    const skippedReasons = [];
    table.getSelectedData().forEach(other => {
        if (other.id === data.id) return;
        const entry = buildLabAndNumberItem(other);
        if (entry.item) {
            items.push(entry.item);
        } else {
            skippedReasons.push(entry.reason);
        }
    });

    const updated = [];
    const errors = [];
    showLoading();
    try {
        for (let i = 0; i < items.length; i += LAB_CHUNK_SIZE) {
            const chunk = items.slice(i, i + LAB_CHUNK_SIZE);
            try {
                const response = await axios.put("api/absolute_datings/labAndNumber/bulk", chunk);
                response.data.forEach(status => {
                    if (status.status === "updated") updated.push(status.clientId);
                    else errors.push({ id: status.clientId, error: status.message || "failed" });
                });
            } catch (error) {
                console.error("Error during bulk update of laboratories and numbers: ", error);
                const message = getErrorMessage(error);
                chunk.forEach(item => errors.push({ id: item.clientId, error: message }));
            }
        }

        if (updated.length > 0) await deleteTableRows(table, updated);
        if (errors.length > 0)  await updateTableRows(table, errors);

        // New laboratories are in the list now
        if (table === labTable && updated.length > 0) await loadLaboratories();
    } finally {
        hideLoading();
    }

    // Summary --------------------------------------------------
    if (items.length > 1 || skippedReasons.length > 0) {
        let message = `${updated.length} ${updated.length === 1 ? "dating" : "datings"} updated.`;
        if (skippedReasons.length > 0) {
            message += ` ${skippedReasons.length} selected skipped (${[...new Set(skippedReasons)].join(", ")}).`;
        }
        if (errors.length > 0) {
            message += ` ${errors.length} failed (see the rows).`;
        }
        (errors.length > 0 ? toast.error : toast.success)(message);
    } else if (errors.length > 0) {
        toast.error("Failed to update dating: " + errors[0].error);
    }
}
