// Fractions analyzed accordion: one Tabulator for all sites.
// Tabulator renders only the visible rows (virtual DOM), the rows are plain objects (see toFractionRow).
// 'Create' and the result table (fillResultFractionCells, hasPendingFractionAnalyzedRow) use these objects.

let fractionTable = null;
let fractionRowCounter = 0;

// Fractions per bulk request (requests are sent one after another)
const FRACTION_CHUNK_SIZE = 500;

function toFractionRow(item) {
    return {
        id:               `fraction_${++fractionRowCounter}`,
        siteLabel:        item.siteLabel,
        featureLabel:     item.featureLabel,
        sampleLabel:      item.sampleLabel,
        sampleId:         String(item.sampleId),
        fractionAnalyzed: item.fractionAnalyzed,
        modifiedFraction: item.modifiedFraction ? item.fraction : "",
        originalFraction: item.fraction,
        orgOrMin:         item.orgOrMin ?? "",
        sieveSize:        item.sieveSize ?? "",
        error:            "", // reason, if the last 'Create' failed
    };
}

function populateFractionsAnalyzed(fractionAnalyzedList) {
    const rows = fractionAnalyzedList.map(toFractionRow);

    // Sites migrated later: add the rows to the table
    if (fractionTable) {
        fractionTable.addData(rows);
        return;
    }
    fractionTable = createFractionTable(rows);
}

function createFractionTable(rows) {
    const counter = document.getElementById("fractionAnalyzedCounter");

    const table = newTabulator(document.getElementById("fractionAnalyzedTable"), {
        data: rows,
        index: "id",
        maxHeight: "70vh",
        layout: "fitData", // columns as wide as their content, the rows end after the last column (as in the explorer)
        placeholder: "no fractions analyzed",
        groupHeader: (value, count, data, group) => {
            const allSelected = group.getRows().every(row => row.isSelected());
            return `<label class="mb-0">
                        <input type="checkbox" class="group-select" ${allSelected ? "checked" : ""}>
                        <strong>${escapeHtml(value || "(empty)")}</strong> (${count})
                    </label>`;
        },
        columns: [
            selectionColumn(),
            filterValuesColumn("Site", "siteLabel"),
            filterValuesColumn("Feature", "featureLabel"),
            filterValuesColumn("Sample", "sampleLabel"),
            {title: "fractionAnalyzed", field: "fractionAnalyzed", headerSort: false, formatter: "plaintext"},
            {title: "modifiedFraction", field: "modifiedFraction", headerSort: false, formatter: "plaintext"},
            {title: "orgOrMin", field: "orgOrMin", headerSort: false, minWidth: 90,
                editor: "list", editorParams: { values: ["org", "min"] },
                formatter: cell => escapeHtml(cell.getValue()) || `<span class="migration-result-placeholder">select</span>`},
            {title: "sieveSize", field: "sieveSize", sorter: "number", headerSortTristate: true, minWidth: 90,
                editor: "input",
                formatter: cell => escapeHtml(cell.getValue()) || `<span class="migration-result-placeholder">enter</span>`},
            {title: "Create", headerSort: false, hozAlign: "center", width: 80, // as wide as the button
                formatter: cell => {
                    const error = cell.getRow().getData().error;
                    return `<button type="button">Create</button>
                            ${error ? `<div class="text-danger small text-wrap">${escapeHtml(error)}</div>` : ""}`;
                },
                cellClick: (e, cell) => {
                    if (e.target.closest("button")) createFractionAnalyzed(cell.getRow());
                },
            },
        ],
    });

    // orgOrMin / sieveSize changed in a selected row is copied to the other selected rows
    setupMigrationTable(table, { counter, copyFields: { orgOrMin: () => true, sieveSize: () => true } });

    // Group header checkbox: (de)select the rows of the group
    table.on("groupClick", (e, group) => {
        const checkbox = e.target.closest("input.group-select");
        if (!checkbox) return;
        group.getRows().forEach(row => checkbox.checked ? row.select() : row.deselect());
    });

    return table;
}

// Group by orgOrMin and sieveSize (e.g. 'org 0.5') or by sieveSize only
const fractionGroups = {
    orgOrMinAndSieveSize: {
        groupBy: data => `${data.orgOrMin} ${data.sieveSize}`.trim(),
        sort:    [{ column: "orgOrMin", dir: "asc" }, { column: "sieveSize", dir: "asc" }],
    },
    sieveSize: {
        groupBy: data => String(data.sieveSize ?? ""),
        sort:    [{ column: "sieveSize", dir: "asc" }],
    },
};

document.getElementById("fractionAnalyzedGroupBy").addEventListener("change", event => {
    if (!fractionTable) return;
    const group = fractionGroups[event.target.value];
    if (group) {
        fractionTable.setSort(group.sort);
        fractionTable.setGroupBy(group.groupBy);
    } else {
        fractionTable.setGroupBy(false);
    }
});

// Tabulator can't measure itself in a collapsed accordion -> redraw when it is opened
document.addEventListener("shown.bs.collapse", event => {
    if (event.target.id === "panelsStayOpen-collapseEight" && fractionTable) {
        fractionTable.redraw();
    }
});

async function postFractionAnalyzed(payload) {
    const response = await fetch(
        'api/fractions_analyzed',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        }
    );
    if (!response.ok) {
        throw new Error(`HTTP Error! Status: ${response.status}`);
    }
    return await response.text();
}

// Fill fractionAnalyzed, orgOrMin and sieveSize in all matching result rows (see result.js)
function fillResultFractionCells(siteLabel, sampleId, originalFraction, fractionAnalyzed, orgOrMin, sieveSize) {
    fillResultFractions([{ siteLabel, sampleId, originalFraction, fractionAnalyzed, orgOrMin, sieveSize }]);
}

// The same for many fractions: one pass and one update per result table
function fillResultFractions(fractions) {
    const bySite = new Map(); // siteLabel -> Map("sampleId|originalFraction" -> fraction)
    fractions.forEach(fraction => {
        if (!bySite.has(fraction.siteLabel)) bySite.set(fraction.siteLabel, new Map());
        bySite.get(fraction.siteLabel).set(`${fraction.sampleId}|${fraction.originalFraction}`, fraction);
    });

    bySite.forEach((fractionsOfSite, siteLabel) => {
        const site = resultTables.get(siteLabel);
        if (!site) return;

        const updates = [];
        site.table.getData().forEach(data => {
            const fraction = fractionsOfSite.get(`${data.sampleId}|${data.originalFraction}`);
            if (fraction) {
                updates.push({ id: data.id, fractionAnalyzed: fraction.fractionAnalyzed,
                               orgOrMin: fraction.orgOrMin, sieveSize: fraction.sieveSize });
            }
        });
        if (updates.length > 0) updateTableRows(site.table, updates);
    });
}

// True if the 'Fractions Analyzed' table still has a row for this site + sample + fraction
function hasPendingFractionAnalyzedRow(siteLabel, sampleId, fraction) {
    if (!fractionTable) return false;
    return fractionTable.getData().some(data =>
        data.siteLabel === siteLabel &&
        data.sampleId === String(sampleId) &&
        data.originalFraction === fraction
    );
}

// Open popup to create a fraction analyzed for a result row without pending fraction analyzed row.
// rowData: the row of the result table (see result.js)
// onCreated: what to continue with after the fraction analyzed is created (create the result / add it to the JSON)
function openCreateFractionModal(rowData, onCreated) {
    const item             = rowData.item;
    const siteLabel        = rowData.siteLabel;
    const sampleId         = rowData.sampleId;
    const originalFraction = rowData.originalFraction;

    const modal        = document.getElementById("fractionAnalyzedModal");
    const select       = document.getElementById("fractionAnalyzedModalSelect");
    const orgRadio     = document.getElementById("fractionAnalyzedModalOrg");
    const minRadio     = document.getElementById("fractionAnalyzedModalMin");
    const sieveInput   = document.getElementById("fractionAnalyzedModalSieveSize");
    const submitButton = document.getElementById("fractionAnalyzedModalSubmitButton");

    // Reset form and prefill orgOrMin and sieveSize from the result row ---
    const orgOrMin  = item.fractionAnalyzed.orgOrMin;
    const sieveSize = item.fractionAnalyzed.sieveSize;

    select.value = "";
    orgRadio.checked = orgOrMin === "org";
    minRadio.checked = orgOrMin === "min";
    sieveInput.value = sieveSize ?? "";

    document.getElementById("fractionAnalyzedModalInfo").innerHTML =
        `${escapeHtml(siteLabel)}<br>${escapeHtml(rowData.featureLabel)}<br>${escapeHtml(rowData.sampleLabel)}`;

    // Show Popup ---------------------------------------------------
    modal.style.display = "block";

    const closeModal = () => { modal.style.display = "none"; };
    modal.querySelector(".close").onclick = closeModal;
    modal.onclick = function (event) {
        if (event.target === modal) { closeModal(); }
    };

    submitButton.onclick = async function () {
        const fractionAnalyzed = select.value;
        const orgOrMin         = (orgRadio.checked && "org") || (minRadio.checked && "min") || "";
        const sieveSize        = sieveInput.value;

        if (!fractionAnalyzed || !orgOrMin || !sieveSize) {
            toast.info("Please select fraction analyzed, organic / minerals and enter a sieve size.");
            return;
        }

        try {
            const responseMessage = await postFractionAnalyzed({
                fractionAnalyzed: fractionAnalyzed,
                orgOrMin: orgOrMin,
                sieveSize: sieveSize,
                sample: {
                    id: sampleId
                }
            });

            if (responseMessage === "fraction analyzed already exists") {
                toast.info("fraction analyzed already exists.");

            } else if (responseMessage === "fraction analyzed is created") {
                fillResultFractionCells(siteLabel, sampleId, originalFraction, fractionAnalyzed, orgOrMin, sieveSize);
                closeModal();

                // Continue with creating the result (or adding it to the JSON)
                onCreated();
            }
        } catch (error) {
            console.error('Error:', error);
            toast.error("Failed to create FractionAnalyzed.");
        }
    };
}

// Create ---------------------------------------------------------------------------------------

// Checks a fraction row. Returns { payload } or { reason, message } if it can not be created yet.
function buildFractionPayload(data) {
    // A decimal comma is accepted as well (e.g. '0,5')
    const sieveSize = parseFloat(String(data.sieveSize).trim().replace(",", "."));
    if (!data.orgOrMin || Number.isNaN(sieveSize)) {
        return { reason: "no orgOrMin and/or sieveSize", message: "No orgOrMin selected and/or sieveSize entered." };
    }
    return {
        payload: {
            fractionAnalyzed: data.fractionAnalyzed,
            orgOrMin:         data.orgOrMin,
            sieveSize:        sieveSize,
            sample:           { id: data.sampleId },
        },
    };
}

// 'Create' button: creates the fraction analyzed of the clicked row and of all other selected rows
async function createFractionAnalyzed(row) {
    const data = row.getData();

    const clicked = buildFractionPayload(data);
    if (!clicked.payload) {
        toast.info(clicked.message);
        return;
    }

    const items = [{ clientId: data.id, fractionAnalyzed: clicked.payload }];
    const skippedReasons = [];
    fractionTable.getSelectedData().forEach(other => {
        if (other.id === data.id) return;
        const entry = buildFractionPayload(other);
        if (entry.payload) {
            items.push({ clientId: other.id, fractionAnalyzed: entry.payload });
        } else {
            skippedReasons.push(entry.reason);
        }
    });

    await createFractionsAnalyzed(items, skippedReasons);
}

// Sends the fractions in chunks to the bulk endpoint. Created and already existing fractions are filled
// into the result table and removed from this table, rows which failed stay with the reason.
async function createFractionsAnalyzed(items, skippedReasons = []) {
    const payloads = new Map(items.map(item => [item.clientId, item.fractionAnalyzed]));
    const created = [];
    const existing = [];
    const errors = [];

    showLoading();
    try {
        for (let i = 0; i < items.length; i += FRACTION_CHUNK_SIZE) {
            const chunk = items.slice(i, i + FRACTION_CHUNK_SIZE);
            try {
                const response = await axios.post("api/fractions_analyzed/bulk", chunk);
                response.data.forEach(status => {
                    if (status.status === "created")     created.push(status.clientId);
                    else if (status.status === "exists") existing.push(status.clientId);
                    else errors.push({ id: status.clientId, error: status.message || "failed" });
                });
            } catch (error) {
                console.error("Error during bulk create of fractions analyzed: ", error);
                const message = getErrorMessage(error);
                chunk.forEach(item => errors.push({ id: item.clientId, error: message }));
            }
        }

        // The fraction is in the database now (created or already there): the results can use it
        const done = new Set([...created, ...existing]);
        fillResultFractions(fractionTable.getData()
            .filter(data => done.has(data.id))
            .map(data => ({ siteLabel: data.siteLabel, sampleId: data.sampleId, originalFraction: data.originalFraction,
                            ...payloads.get(data.id) })));

        if (done.size > 0)     await deleteTableRows(fractionTable, [...done]);
        if (errors.length > 0) await updateTableRows(fractionTable, errors);
    } finally {
        hideLoading();
    }

    // Summary --------------------------------------------------
    // A message also for one row (a failed single row: its error, below)
    if (items.length > 1 || skippedReasons.length > 0 || existing.length > 0 || errors.length === 0) {
        let message = `${created.length} ${created.length === 1 ? "fraction analyzed" : "fractions analyzed"} created.`;
        if (existing.length > 0) {
            message += ` ${existing.length} already existed.`;
        }
        if (skippedReasons.length > 0) {
            message += ` ${skippedReasons.length} selected skipped (${[...new Set(skippedReasons)].join(", ")}).`;
        }
        if (errors.length > 0) {
            message += ` ${errors.length} failed (see the rows).`;
        }
        (errors.length > 0 ? toast.error : toast.success)(message);
    } else if (errors.length > 0) {
        toast.error("Failed to create fraction analyzed: " + errors[0].error);
    }
}
