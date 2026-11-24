// Site selection accordion: the sites of the ArboDat file as a Tabulator (choose the sites to migrate) and,
// after a migration, the not migrated, already existing sites / features / samples / datings (one Tabulator each).

let siteSelectionTable = null;

// Status of a site: "open" (still to migrate), "failed" (migration rolled back, can be migrated again),
// or after a migration (it can't be selected any more)
const SITE_STATUS_LABELS = { failed: "❗ failed, rolled back", migrated: "✅ migrated", existing: "❌ already existing" };
const isSelectableSite = data => data.status === "open" || data.status === "failed";

// Sites of the uploaded file (a new upload replaces them)
function populateSites(sites) {
    const rows = [...sites].sort(compareLabels).map(label => ({ id: label, label, status: "open", message: "" }));
    if (siteSelectionTable) {
        siteSelectionTable.replaceData(rows);
        return;
    }
    siteSelectionTable = newTabulator(document.getElementById("siteSelectionTable"), {
        data: rows,
        index: "id",
        maxHeight: "70vh",
        layout: "fitData", // columns as wide as their content, the rows end after the last column (as in the explorer)
        placeholder: "no sites",
        // Migrated / already existing sites can't be selected any more (checkbox disabled; see also rowSelected below)
        selectableRowsCheck: row => isSelectableSite(row.getData()),
        rowFormatter: row => {
            const checkbox = row.getElement().querySelector(".selectionColumn input[type=checkbox]");
            if (checkbox) checkbox.disabled = !isSelectableSite(row.getData());
        },
        columns: [
            selectionColumn(),
            filterValuesColumn("Site", "label"),
            {title: "status", field: "status", headerSort: false, minWidth: 140,
                formatter: cell => {
                    const label = SITE_STATUS_LABELS[cell.getValue()] ?? "";
                    const message = cell.getRow().getData().message;
                    return cell.getValue() === "failed" && message
                        ? `<span class="text-danger">${escapeHtml(label + ": " + message)}</span>`
                        : escapeHtml(label);
                },
                headerFilter: "list", headerFilterPlaceholder: "",
                headerFilterParams: { values: { open: "not migrated", ...SITE_STATUS_LABELS }, clearable: true },
                headerFilterFunc: "="},
        ],
    });
    setupMigrationTable(siteSelectionTable, { counter: document.getElementById("siteSelectionCounter") });
    // The checkbox in the header selects all filtered rows without asking selectableRowsCheck
    siteSelectionTable.on("rowSelected", row => {
        if (!isSelectableSite(row.getData())) row.deselect();
    });
}

// Labels of the selected sites
function selectedSiteLabels() {
    return siteSelectionTable ? siteSelectionTable.getSelectedData().map(site => site.label) : [];
}

// Sites whose migration failed (rolled back): status "failed" with the reason; they stay selectable for a new attempt
function markFailedSites(failedSites) {
    if (!siteSelectionTable || failedSites.size === 0) return;
    return updateTableRows(siteSelectionTable, [...failedSites]
        .filter(([label]) => siteSelectionTable.getRow(label))
        .map(([label, message]) => ({ id: label, status: "failed", message: message ?? "" })));
}

// After a migration: the migrated sites get their status (already existing ones see populateExistingLists)
function markSites(labels, status) {
    if (!siteSelectionTable || labels.length === 0) return;
    const ids = new Set(labels);
    siteSelectionTable.deselectRow(siteSelectionTable.getSelectedRows().filter(row => ids.has(row.getData().id)));
    return updateTableRows(siteSelectionTable, [...ids]
        .filter(id => siteSelectionTable.getRow(id))
        .map(id => ({ id, status })));
}

// Tabulator can't measure itself in a collapsed accordion -> redraw when it is opened
document.addEventListener("shown.bs.collapse", event => {
    if (event.target.id === "panelsStayOpen-collapseTwo") {
        [siteSelectionTable, ...existingTables.values()].forEach(table => table?.redraw());
    }
});

// Not migrated, already existing elements ----------------------------------------------------

// [list in the migration response, title, columns]
const EXISTING_LISTS = [
    ["existingSiteList", "Not migrated, already existing sites and additionally added research projects", [
        filterValuesColumn("site", "label"),
        filterTextColumn("site id", "id"),
        {title: "research projects", field: "researchProjectNames", headerSort: false, formatter: cell => escapeHtml((cell.getValue() ?? []).join(", "))},
        {title: "added research projects", field: "addedResearchProjectNames", headerSort: false, formatter: cell => escapeHtml((cell.getValue() ?? []).join(", "))},
    ]],
    ["existingFeatureList", "Not migrated, already existing features of the selected sites", [
        filterValuesColumn("feature", "label"),
        filterTextColumn("feature id", "id"),
        filterValuesColumn("site", "siteLabel"),
    ]],
    ["existingSampleList", "Not migrated, already existing samples of the selected sites", [
        filterValuesColumn("sample", "label"),
        filterTextColumn("sample id", "id"),
        filterValuesColumn("site", "siteLabel"),
        filterValuesColumn("feature", "featureLabel"),
    ]],
    ["existingAbsoluteDatingList", "Not migrated, already existing datings of the selected sites", [
        filterValuesColumn("sub sample", "subSample"),
        filterTextColumn("absolute dating id", "id"),
        filterValuesColumn("site", "siteLabel"),
        filterValuesColumn("feature", "featureLabel"),
        filterValuesColumn("sample", "sampleLabel"),
    ]],
];

const existingTables = new Map(); // list -> Tabulator
let existingRowCounter = 0;

// Lists of a migration response (rows of later migrations are added); a list is shown when it has rows
function populateExistingLists(response) {
    const container = document.getElementById("existingTables");
    EXISTING_LISTS.forEach(([list, title, columns]) => {
        // Own row ids: an element can be listed again by a later migration
        const rows = (response[list] ?? []).map(item => ({ ...item, rowId: `existing_${++existingRowCounter}` }));
        if (rows.length === 0) return;

        if (existingTables.has(list)) {
            existingTables.get(list).addData(rows);
            return;
        }
        const section = document.createElement("div");
        section.innerHTML = `
            <div class="d-flex flex-wrap align-items-center gap-3 mb-2 mt-4">
                <strong>${escapeHtml(title)}</strong>
                <span class="small text-muted" data-counter></span>
            </div>
            <div class="migration-result-table" data-table></div>`;
        container.appendChild(section);

        const table = newTabulator(section.querySelector("[data-table]"), {
            data: rows,
            index: "rowId",
            maxHeight: "50vh",
            layout: "fitData",
            columns,
        });
        const counter = section.querySelector("[data-counter]");
        const updateCounter = () => {
            const total = table.getDataCount(), active = table.getDataCount("active");
            counter.textContent = active === total ? `${total} rows` : `${active} of ${total} rows`;
        };
        table.on("dataFiltered", () => setTimeout(updateCounter));
        table.on("dataProcessed", updateCounter);
        stopRedrawWhenVisible(table);
        existingTables.set(list, table);
    });

    // The selected sites which already existed
    return markSites((response.existingSiteList ?? []).map(site => site.label), "existing");
}
