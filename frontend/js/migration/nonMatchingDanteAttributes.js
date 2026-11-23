// Non-matching attributes accordion: one Tabulator per attribute (only the visible rows are rendered), the rows are plain objects.
// Each row is a value of ArboDat (nonMatchingLabel) of a site / feature / sample / absolute dating which is not in DANTE;
// a DANTE value is chosen for it (several for site types, they are added to the site's site types).

// The attributes in their order on the page: [attribute, title]
const NON_MATCHING_ATTRIBUTES = [
    ["siteType", "siteType (several values)"],
    ["naturalUnit", "naturalUnit"],
    ["featureType", "featureType"],
    ["preservationCondition", "preservationCondition"],
    ["sampleType", "sampleType"],
    ["chronozone", "chronozone"],
    ["seedsAndFruits", "seedsAndFruits"],
    ["charcoalInvestigated", "charcoalInvestigated"],
    ["woodSubfossile", "woodSubfossile"],
    ["material", "material"],
    ["datingMethod", "datingMethod"],
];

const nonMatchingTables = new Map(); // attribute -> Tabulator
let nonMatchingRowCounter = 0;

// Rows per bulk request (requests are sent one after another)
const NON_MATCHING_CHUNK_SIZE = 500;

const isMultipleAttribute = attribute => attribute === "siteType";

function toNonMatchingRow(item) {
    return {
        id:               `nonMatching_${++nonMatchingRowCounter}`,
        entityId:         item.id,
        attribute:        item.attribute,
        type:             item.type,  // site, feature, sample, absoluteDating
        label:            item.label,
        nonMatchingLabel: item.nonMatchingLabel,
        value:            isMultipleAttribute(item.attribute) ? [] : null, // uri(s) (DANTE)
        error:            "",         // reason, if the last 'Update' failed
    };
}

async function populateNonMatchingDanteAttributes(nonMatchingDanteAttributeList) {
    const rowsByAttribute = new Map();
    nonMatchingDanteAttributeList.map(toNonMatchingRow).forEach(row => {
        if (!rowsByAttribute.has(row.attribute)) rowsByAttribute.set(row.attribute, []);
        rowsByAttribute.get(row.attribute).push(row);
    });
    if (rowsByAttribute.size === 0) return;

    await loadDanteListOptions([...rowsByAttribute.keys()]);
    createNonMatchingSections();

    rowsByAttribute.forEach((rows, attribute) => {
        // Sites migrated later: add the rows to the table
        if (nonMatchingTables.has(attribute)) {
            nonMatchingTables.get(attribute).addData(rows);
            return;
        }
        const section = document.getElementById(`nonMatching_${attribute}`);
        if (!section) {
            console.error("Unknown non-matching attribute: ", attribute);
            return;
        }
        section.hidden = false;
        nonMatchingTables.set(attribute, createNonMatchingTable(attribute, rows, section));
    });
}

// A hidden section (title, counter, table) per attribute, shown when the attribute has rows
function createNonMatchingSections() {
    const container = document.getElementById("nonMatchingAttributeTables");
    if (container.children.length > 0) return;
    NON_MATCHING_ATTRIBUTES.forEach(([attribute, title]) => {
        const section = document.createElement("div");
        section.id = `nonMatching_${attribute}`;
        section.hidden = true;
        section.innerHTML = `
            <div class="d-flex flex-wrap align-items-center gap-3 mb-2 mt-4">
                <strong>${escapeHtml(title)}</strong>
                <span class="small text-muted" data-counter></span>
            </div>
            <div class="migration-result-table" data-table></div>`;
        container.appendChild(section);
    });
}

function createNonMatchingTable(attribute, rows, section) {
    const multiple = isMultipleAttribute(attribute);
    const labels = danteListOptions.get(attribute).labels;
    const valueLabels = value => [].concat(value ?? []).map(uri => labels.get(uri) ?? uri).join(", ");
    const table = () => nonMatchingTables.get(attribute);

    const instance = newTabulator(section.querySelector("[data-table]"), {
        data: rows,
        index: "id",
        maxHeight: "70vh",
        layout: "fitDataFill", // columns as wide as their content (no stretched last column)
        placeholder: `no non-matching ${attribute}`,
        columns: [
            selectionColumn(),
            filterTextColumn("Type", "type"),
            filterTextColumn("Label", "label"),
            filterListColumn("nonMatchingLabel", "nonMatchingLabel"),
            {title: "danteLabels", field: "value", headerSort: false, minWidth: 220, maxWidth: 360,
                tooltip: (e, cell) => cell.getElement().classList.contains("tabulator-editing") ? "" : escapeHtml(valueLabels(cell.getValue())),
                editor: multiple ? multiSelectEditor : singleSelectEditor,
                editorParams: danteEditorParams(attribute, { multiselect: multiple }),
                formatter: cell => valueLabels(cell.getValue())
                    ? escapeHtml(valueLabels(cell.getValue()))
                    : `<span class="migration-result-placeholder">select</span>`},
            {title: "Update", headerSort: false, hozAlign: "center", width: 80, // as wide as the button
                formatter: cell => {
                    const error = cell.getRow().getData().error;
                    return `<button type="button">Update</button>
                            ${error ? `<div class="text-danger small text-wrap">${escapeHtml(error)}</div>` : ""}`;
                },
                cellClick: (e, cell) => {
                    if (e.target.closest("button")) updateNonMatchingAttributes(table(), cell.getRow());
                },
            },
            {title: "Add to JSON", headerSort: false, hozAlign: "center", width: 110, // as wide as the button
                formatter: () => `<button type="button">Add&#8239;to&#8239;JSON</button>`,
                cellClick: (e, cell) => {
                    if (e.target.closest("button")) addNonMatchingLabelToJSON(table(), cell.getRow());
                },
            },
        ],
    });
    setupMigrationTable(instance, {
        counter: section.querySelector("[data-counter]"),
        copyFields: { value: () => true },
    });
    // All rows updated / added to the JSON: the section is hidden (again shown for sites migrated later)
    const toggleSection = () => setTimeout(() => section.hidden = instance.getDataCount() === 0);
    ["rowDeleted", "rowAdded", "dataProcessed"].forEach(event => instance.on(event, toggleSection));
    return instance;
}

// Tabulator can't measure itself in a collapsed accordion -> redraw when it is opened
document.addEventListener("shown.bs.collapse", event => {
    if (event.target.id === "panelsStayOpen-collapseFive") {
        nonMatchingTables.forEach(table => table.redraw());
    }
});

// Update ---------------------------------------------------------------------------------------

// Checks a row. Returns { item } or { reason, message } if it can not be updated yet.
function buildNonMatchingItem(data) {
    const uris = [].concat(data.value ?? []).filter(Boolean);
    if (uris.length === 0) {
        return { reason: `no ${data.attribute} selected`, message: `No ${data.attribute} selected.` };
    }
    const labels = danteListOptions.get(data.attribute).labels;
    return { item: {
        clientId:  data.id,
        attribute: data.attribute,
        id:        data.entityId,
        values:    uris.map(uri => ({ id: uri, label: labels.get(uri) ?? null })),
    } };
}

// 'Update' button: updates the clicked row and all other selected rows of the table
async function updateNonMatchingAttributes(table, row) {
    const data = row.getData();

    const clicked = buildNonMatchingItem(data);
    if (!clicked.item) {
        toast.info(clicked.message);
        return;
    }

    const items = [clicked.item];
    const skippedReasons = [];
    table.getSelectedData().forEach(other => {
        if (other.id === data.id) return;
        const entry = buildNonMatchingItem(other);
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
        for (let i = 0; i < items.length; i += NON_MATCHING_CHUNK_SIZE) {
            const chunk = items.slice(i, i + NON_MATCHING_CHUNK_SIZE);
            try {
                const response = await axios.put("api/migration/nonMatchingAttributes/bulk", chunk);
                response.data.forEach(status => {
                    if (status.status === "updated") updated.push(status.clientId);
                    else errors.push({ id: status.clientId, error: status.message || "failed" });
                });
            } catch (error) {
                console.error("Error during bulk update of non-matching attributes: ", error);
                const message = getErrorMessage(error);
                chunk.forEach(item => errors.push({ id: item.clientId, error: message }));
            }
        }

        if (updated.length > 0) await deleteTableRows(table, updated);
        if (errors.length > 0)  await updateTableRows(table, errors);
    } finally {
        hideLoading();
    }

    // Summary --------------------------------------------------
    if (items.length > 1 || skippedReasons.length > 0) {
        let message = `${updated.length} ${updated.length === 1 ? "row" : "rows"} updated.`;
        if (skippedReasons.length > 0) {
            message += ` ${skippedReasons.length} selected skipped (${[...new Set(skippedReasons)].join(", ")}).`;
        }
        if (errors.length > 0) {
            message += ` ${errors.length} failed (see the rows).`;
        }
        (errors.length > 0 ? toast.error : toast.success)(message);
    } else if (errors.length > 0) {
        toast.error("Failed to update DANTE Attribute: " + errors[0].error);
    }
}

// Add to JSON -----------------------------------------------------------------------------------

// Adds the clicked row and all rows of the attribute with the same nonMatchingLabel
// (for a value which is not in DANTE)
function addNonMatchingLabelToJSON(table, row) {
    const data = row.getData();
    const rows = table.getRows().filter(other => other === row || other.getData().nonMatchingLabel === data.nonMatchingLabel);

    addGroupToJSON({
        attribute: data.attribute,
        nonMatchingLabel: data.nonMatchingLabel,
        itemIds: rows.map(other => other.getData().entityId),
    }, rows, [], rows => deleteTableRows(table, rows.map(row => row.getData().id)));
}
