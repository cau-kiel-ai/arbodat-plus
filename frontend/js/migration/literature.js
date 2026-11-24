// Literature accordion: one Tabulator (only the visible rows are rendered), the rows are plain objects (see toLiteratureRow).
// Each row is a literature reference of a site in ArboDat (author, publication year); literature of ArboDat+ is chosen
// for it and added to the literature of the site ('Update'). A literature which doesn't exist yet is created in the popup
// ('Create', js/input/literature.js) and then chosen in the row.

let literatureTable = null;
let literatureRowCounter = 0;

// Literature of ArboDat+: [{ value: id, label }] (reloaded after a literature is created / changed in the popup)
let literatureOptions = [];

// Row which opened the popup (the literature created there is chosen in it)
let literatureWindowRowId = null;

// Rows per bulk request (requests are sent one after another)
const LITERATURE_CHUNK_SIZE = 500;

function toLiteratureRow(item) {
    return {
        id:              `literature_${++literatureRowCounter}`,
        siteId:          item.siteId,
        siteLabel:       item.siteLabel,
        author:          item.author,
        publicationYear: item.publicationYear,
        literature:      [], // ids of the chosen literature
        error:           "", // reason, if the last 'Update' failed
    };
}

async function populateLiterature(literatureList) {
    await fetchLiteratureOptions();

    const rows = literatureList.map(toLiteratureRow);

    // Sites migrated later: add the rows to the table
    if (literatureTable) {
        literatureTable.addData(rows);
        return;
    }
    literatureTable = createLiteratureTable(rows);
}

// Literature of ArboDat+ (also called by the literature popup, see js/input/literature.js)
async function fetchLiteratureOptions() {
    try {
        const data = (await axios.get("api/literature")).data;
        literatureOptions = data
            .map(item => ({ value: item.id, label: formatLiterature(item) }))
            .sort((a, b) => a.label.localeCompare(b.label));
    } catch (error) {
        console.error("Error during literature GET request: ", error);
    }
    // Show the labels of the reloaded literature
    if (literatureTable?.initialized) literatureTable.redraw(true);
}

// Called by the literature popup after a literature was created: it is chosen in the row which opened the popup
// (and in the other selected rows, if that row is selected); it is saved with 'Update'
async function onLiteratureCreated() {
    const known = new Set(literatureOptions.map(option => option.value));
    await fetchLiteratureOptions();
    const created = literatureOptions.map(option => option.value).filter(id => !known.has(id));
    await chooseInRows(literatureTable, literatureWindowRowId, "literature", created);
}

function createLiteratureTable(rows) {
    const literatureLabels = ids => ids
        .map(id => literatureOptions.find(option => option.value === id)?.label)
        .filter(Boolean)
        .join("; ");

    const table = newTabulator(document.getElementById("literatureTable"), {
        data: rows,
        index: "id",
        maxHeight: "70vh",
        layout: "fitData", // columns as wide as their content, the rows end after the last column (as in the explorer)
        placeholder: "no literature",
        columns: [
            selectionColumn(),
            filterValuesColumn("Site", "siteLabel"),
            filterTextColumn("author", "author"),
            filterTextColumn("publicationYear", "publicationYear"),
            {title: "literature", field: "literature", headerSort: false, minWidth: 260, maxWidth: MULTI_SELECT_MAX_WIDTH,
                editor: multiSelectEditor, editorParams: () => ({ values: literatureOptions }),
                formatter: cell => {
                    const labels = literatureLabels(cell.getValue() ?? []);
                    return labels ? escapeHtml(labels) : `<span class="migration-result-placeholder">select</span>`;
                },
                // not while the editor is open
                tooltip: (e, cell) => cell.getElement().classList.contains("tabulator-editing") ? "" : escapeHtml(literatureLabels(cell.getValue() ?? [])),
            },
            {title: "Update", headerSort: false, hozAlign: "center", width: 80, // as wide as the button
                formatter: cell => {
                    const error = cell.getRow().getData().error;
                    return `<button type="button">Update</button>
                            ${error ? `<div class="text-danger small text-wrap">${escapeHtml(error)}</div>` : ""}`;
                },
                cellClick: (e, cell) => {
                    if (e.target.closest("button")) updateLiterature(cell.getRow());
                },
            },
            {title: "New literature", headerSort: false, hozAlign: "center", width: 120, // as wide as the button
                formatter: () => `<button type="button">Create</button>`,
                cellClick: (e, cell) => {
                    if (e.target.closest("button")) openLiteraturWindow(cell.getRow());
                },
            },
        ],
    });
    setupMigrationTable(table, {
        counter: document.getElementById("literatureCounter"),
        copyFields: { literature: () => true },
    });
    return table;
}

// Tabulator can't measure itself in a collapsed accordion -> redraw when it is opened
document.addEventListener("shown.bs.collapse", event => {
    if (event.target.id === "panelsStayOpen-collapseFour" && literatureTable) {
        literatureTable.redraw();
    }
});

function openLiteraturWindow(row) {
    const data = row.getData();
    literatureWindowRowId = data.id;

    // Reset authorForm
    document.getElementById('authorForm').reset();
    document.getElementById("authorId").value = '';
    document.getElementById("authorSubmitButton").innerHTML = "create";

    // Reset literatureForm
    document.getElementById('literatureForm').reset();
    clearMultiSelect('#literatureAuthors');
    document.getElementById("literatureId").value = '';
    document.getElementById("literatureSubmitButton").innerHTML = "create";

    // Author and publication year of ArboDat as a hint (shown above the fields)
    document.getElementById("authorsFromMigration").textContent = data.author ?? "";
    document.getElementById("publicationYearFromMigration").textContent = data.publicationYear ?? "";

    // Show Popup ---------------------------------------------------
    const literaturModal = document.getElementById("literaturModal");
    literaturModal.style.display = "block";

    const closeButton = literaturModal.querySelector(".close");
    closeButton.onclick = function() {
        literaturModal.style.display = "none";
    }
    window.onclick = function(event) {
        if (event.target === literaturModal) {
            literaturModal.style.display = "none";
        }
    }
}

// Update ---------------------------------------------------------------------------------------

function buildLiteratureItem(data) {
    if (!data.literature || data.literature.length === 0) {
        return { reason: "no literature selected", message: "Select at least one literature." };
    }
    return { item: { clientId: data.id, siteId: data.siteId, literatureIds: data.literature } };
}

// 'Update' button: adds the literature of the clicked row and of all other selected rows to their sites
async function updateLiterature(row) {
    const data = row.getData();

    const clicked = buildLiteratureItem(data);
    if (!clicked.item) {
        toast.info(clicked.message);
        return;
    }

    const items = [clicked.item];
    const skippedReasons = [];
    literatureTable.getSelectedData().forEach(other => {
        if (other.id === data.id) return;
        const entry = buildLiteratureItem(other);
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
        for (let i = 0; i < items.length; i += LITERATURE_CHUNK_SIZE) {
            const chunk = items.slice(i, i + LITERATURE_CHUNK_SIZE);
            try {
                const response = await axios.put("api/literature/sites/bulk", chunk);
                response.data.forEach(status => {
                    if (status.status === "updated") updated.push(status.clientId);
                    else errors.push({ id: status.clientId, error: status.message || "failed" });
                });
            } catch (error) {
                console.error("Error during bulk update of the literature: ", error);
                const message = getErrorMessage(error);
                chunk.forEach(item => errors.push({ id: item.clientId, error: message }));
            }
        }

        if (updated.length > 0) await deleteTableRows(literatureTable, updated);
        if (errors.length > 0)  await updateTableRows(literatureTable, errors);
    } finally {
        hideLoading();
    }

    // Summary --------------------------------------------------
    // A message also for one row (a failed single row: its error, below)
    if (items.length > 1 || skippedReasons.length > 0 || errors.length === 0) {
        let message = `${updated.length} ${updated.length === 1 ? "row" : "rows"} updated.`;
        if (skippedReasons.length > 0) {
            message += ` ${skippedReasons.length} selected skipped (${[...new Set(skippedReasons)].join(", ")}).`;
        }
        if (errors.length > 0) {
            message += ` ${errors.length} failed (see the rows).`;
        }
        (errors.length > 0 ? toast.error : toast.success)(message);
    } else if (errors.length > 0) {
        toast.error("Failed to update literature: " + errors[0].error);
    }
}
