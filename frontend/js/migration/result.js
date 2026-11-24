// Results accordion: one Tabulator per site.
// Tabulator renders only the visible rows (virtual DOM), so sites with thousands of results stay fast.
// The rows are plain objects (see toResultRow); 'Create', 'Add to JSON' and the fraction popup read
// and update these objects, never the cells.

const resultTables = new Map(); // siteLabel -> { table, taxonomyUri, taxonomyLabel }
let resultRowCounter = 0;

// Results per bulk request (requests are sent one after another)
const RESULT_CHUNK_SIZE = 500;

function toResultRow(item) {
    const result = item.result;
    return {
        id:                       `result_${++resultRowCounter}`,
        item:                     item, // as received from the migration, item.result is sent back on create
        siteLabel:                item.siteLabel,
        featureLabel:             item.featureLabel,
        sampleId:                 String(item.sampleId),
        sampleLabel:              item.sampleLabel,

        taxCode:                  result.taxCode?.label ?? item.nonMatchingTaxCode,
        needsTaxCode:             result.taxCode == null,
        danteTaxCode:             null, // uri

        originalFraction:         item.fractionAnalyzed.fraction,
        fractionAnalyzed:         "",   // set when the fraction analyzed is created (see fractionAnalyzed.js)
        orgOrMin:                 item.fractionAnalyzed.orgOrMin ?? "",
        sieveSize:                item.fractionAnalyzed.sieveSize ?? "",

        // INFO: No extension in ArboDat2018 possible
        cf:                       item.nonMatchingClassificationConfer || (result.classificationConfer?.label ?? ""),

        restType:                 result.restType?.label ?? item.nonMatchingRestType,
        needsRestType:            result.restType == null,
        danteRestType:            null, // uri

        stateOfPreservation:      result.stateOfPreservation?.label ?? item.nonMatchingStateOfPreservation,
        needsStateOfPreservation: result.stateOfPreservation == null,
        danteStateOfPreservation: null, // uri

        error:                    "", // reason, if the last 'Create' failed
    };
}

// Table ----------------------------------------------------------------------------------------

async function populateResults(resultList) {

    const resultForm = document.getElementById("resultForm");

    // Load the dante lists once for all tables (requests run in parallel, see danteListEditor.js)
    await Promise.all([
        loadDanteListOptions(["restType", "stateOfPreservation"]),
        fetchDanteAttribute("taxonomy"),
    ]);

    for (const entry of resultList) {
        const siteLabel = Object.keys(entry)[0];
        const rows = entry[siteLabel].map(toResultRow);

        // Site migrated again: add the rows to its table
        if (resultTables.has(siteLabel)) {
            resultTables.get(siteLabel).table.addData(rows);
            continue;
        }

        const siteResultsContainer = document.createElement("div");
        siteResultsContainer.className = "migration-result-site";
        siteResultsContainer.innerHTML = `
            <div class="migration-result-header">
                <span class="migration-result-site-text">Site:</span>
                <span class="migration-result-site-label"></span>
                <div class="table-filter-select migration-result-taxonomy">
                    <select><option value=""></option></select>
                </div>
                <span class="small text-muted migration-result-counter"></span>
            </div>
            <div class="migration-result-table"></div>
        `;
        siteResultsContainer.querySelector(".migration-result-site-label").textContent = siteLabel;
        resultForm.appendChild(siteResultsContainer);

        // Taxonomy dropdown
        const taxonomySelect = siteResultsContainer.querySelector("select");
        taxonomySelect.id = `taxonomyDropdown_${siteLabel.replace(/\s+/g, '_')}`;
        populateDanteDropdown("taxonomy", taxonomySelect);
        $(taxonomySelect).select2({
            placeholder: 'select Taxonomy',
            allowClear: true,
            width: '100%',
            dropdownCssClass: 'table-filter-dropdown',
        }).on('change', () => handleTaxonomyChange(siteLabel, taxonomySelect));

        const entryOfSite = { table: null, taxonomyUri: "", taxonomyLabel: "" };
        entryOfSite.table = createResultTable(siteResultsContainer.querySelector(".migration-result-table"),
                                              siteResultsContainer.querySelector(".migration-result-counter"),
                                              rows, entryOfSite);
        resultTables.set(siteLabel, entryOfSite);
    }
}

function createResultTable(element, counter, rows, site) {

    // Cell of a dante dropdown: the label of the chosen value, "select" if none is chosen yet,
    // empty in rows where the value matched (no dropdown needed)
    const danteFormatter = (needsField, labelOf) => cell => {
        if (!cell.getRow().getData()[needsField]) return "";
        const value = cell.getValue();
        return value
            ? escapeHtml(labelOf(value) ?? value)
            : `<span class="migration-result-placeholder">select</span>`;
    };

    // Column of a dante dropdown: only editable in rows where the value didn't match
    const danteColumn = (title, field, needsField, attribute) => ({
        title, field, headerSort: false, minWidth: 140,
        editable: cell => cell.getRow().getData()[needsField],
        editor: "list",
        editorParams: { ...danteEditorParams(attribute), clearable: true, allowEmpty: true },
        formatter: danteFormatter(needsField, value => danteListOptions.get(attribute).labels.get(value)),
    });


    const table = newTabulator(element, {
        data: rows,
        index: "id",
        maxHeight: "70vh",
        layout: "fitData", // columns as wide as their content, the rows end after the last column (as in the explorer)
        placeholder: "no results",
        columns: [
            selectionColumn(),
            {title: "Feature", field: "featureLabel", headerSort: false, formatter: "plaintext"},
            {title: "Sample",  field: "sampleLabel",  headerSort: false, formatter: "plaintext"},

            filterValuesColumn("taxCode", "taxCode"),
            {title: "dante taxCode", field: "danteTaxCode", headerSort: false, minWidth: 160,
                editable: cell => cell.getRow().getData().needsTaxCode && !!site.taxonomyUri,
                editor: "list",
                editorParams: taxCodeEditorParams(() => site.taxonomyUri),
                formatter: danteFormatter("needsTaxCode", value => getTaxCodeOptions(site.taxonomyUri).labels.get(value)),
                cellClick: (e, cell) => {
                    if (cell.getRow().getData().needsTaxCode && !site.taxonomyUri) {
                        toast.info("Please select a 'Taxonomy' for this site.");
                    }
                },
            },

            {title: "fraction analyzed", field: "fractionAnalyzed", headerSort: false, formatter: "plaintext"},
            {title: "orgOrMin",          field: "orgOrMin",         headerSort: false, formatter: "plaintext"},
            {title: "sieve size",        field: "sieveSize",        headerSort: false, formatter: "plaintext"},

            {title: "cf", field: "cf", headerSort: false, formatter: "plaintext"},

            filterValuesColumn("restType", "restType"),
            danteColumn("dante restType", "danteRestType", "needsRestType", "restType"),

            filterValuesColumn("stateOfPreservation", "stateOfPreservation"),
            danteColumn("dante stateOfPreservation", "danteStateOfPreservation", "needsStateOfPreservation", "stateOfPreservation"),

            {title: "Create", headerSort: false, hozAlign: "center", width: 80, // as wide as the button
                formatter: cell => {
                    const error = cell.getRow().getData().error;
                    return `<button type="button">Create</button>
                            ${error ? `<div class="text-danger small text-wrap">${escapeHtml(error)}</div>` : ""}`;
                },
                cellClick: (e, cell) => {
                    if (e.target.closest("button")) createResult(cell.getRow());
                },
            },
            {title: "Add to JSON", headerSort: false, hozAlign: "center", width: 110, // as wide as the button
                formatter: () => `<button type="button">Add&#8239;to&#8239;JSON</button>`,
                cellClick: (e, cell) => {
                    if (e.target.closest("button")) addResultsToJSON(cell.getRow());
                },
            },
        ],
    });

    // A value chosen in a selected row is copied to the other selected rows which need it
    setupMigrationTable(table, { counter, copyFields: {
        danteTaxCode:             data => data.needsTaxCode,
        danteRestType:            data => data.needsRestType,
        danteStateOfPreservation: data => data.needsStateOfPreservation,
    } });

    return table;
}

// Tabulator can't measure itself in a collapsed accordion -> redraw when it is opened
document.addEventListener("shown.bs.collapse", event => {
    if (event.target.id === "panelsStayOpen-collapseTen") {
        resultTables.forEach(site => site.table.redraw());
    }
});

// Clears the chosen taxCodes: they belong to the previous taxonomy
async function handleTaxonomyChange(siteLabel, select) {
    const site = resultTables.get(siteLabel);
    const uri = select.value;

    showLoading();
    try {
        if (uri) await fetchDanteTaxCodes(uri);

        site.taxonomyUri   = uri;
        site.taxonomyLabel = uri ? select.options[select.selectedIndex].text : "";

        const updates = site.table.getData()
            .filter(data => data.danteTaxCode)
            .map(data => ({ id: data.id, danteTaxCode: null }));
        if (updates.length > 0) await updateTableRows(site.table, updates);
    } finally {
        hideLoading();
    }
}

// Create ---------------------------------------------------------------------------------------

// Checks a result row. Returns { payload } or { reason, message } if the result can not be created yet.
function buildResultPayload(data, site) {
    if (!site.taxonomyLabel) {
        return { reason: "no taxonomy selected", message: "Please select a 'Taxonomy' for this site." };
    }
    if (data.needsTaxCode && !data.danteTaxCode) {
        return { reason: "no dante taxCode", message: "Please select a 'dante taxCode'." };
    }
    if (data.fractionAnalyzed === "") {
        return { reason: NO_FRACTION_ANALYZED, message: "Before you can create a result, you must create the corresponding fraction analysed for the corresponding sample in the ‘Fraction Analyzed’ accordion." };
    }
    if (data.needsRestType && !data.danteRestType) {
        return { reason: "no restType", message: "Please select a restType." };
    }
    if (data.needsStateOfPreservation && !data.danteStateOfPreservation) {
        return { reason: "no stateOfPreservation", message: "Please select a stateOfPreservation." };
    }
    return { payload: resultPayload(data, site) };
}

// The result to send to the backend, with the values chosen in the dante dropdowns
// (also used for 'Add to JSON', where some of them may still be missing)
function resultPayload(data, site) {
    const result = { ...data.item.result };

    if (data.needsTaxCode && data.danteTaxCode) {
        result.taxCode = {
            id:       data.danteTaxCode,
            label:    getTaxCodeOptions(site.taxonomyUri).labels.get(data.danteTaxCode),
            taxonomy: site.taxonomyLabel,
        };
    }
    if (data.needsRestType && data.danteRestType) {
        result.restType = {
            id:    data.danteRestType,
            label: danteListOptions.get("restType").labels.get(data.danteRestType),
        };
    }
    if (data.needsStateOfPreservation && data.danteStateOfPreservation) {
        result.stateOfPreservation = {
            id:    data.danteStateOfPreservation,
            label: danteListOptions.get("stateOfPreservation").labels.get(data.danteStateOfPreservation),
        };
    }
    if (data.fractionAnalyzed !== "") {
        result.fractionAnalyzed = data.fractionAnalyzed;
        result.orgOrMin         = data.orgOrMin;
        result.sieveSize        = parseDecimal(data.sieveSize);
    }

    // Only the sample id, to parse the JSON in the backend correctly
    result.sample = { id: data.sampleId };
    return result;
}

// 'Create' button: creates the result of the clicked row and of all other selected rows
async function createResult(row) {
    const data = row.getData();
    const site = resultTables.get(data.siteLabel);

    const clicked = buildResultPayload(data, site);
    if (!clicked.payload) {
        if (clicked.reason === NO_FRACTION_ANALYZED &&
            !hasPendingFractionAnalyzedRow(data.siteLabel, data.sampleId, data.originalFraction)) {
            openCreateFractionModal(data, () => createResult(site.table.getRow(data.id)));
        } else {
            toast.info(clicked.message);
        }
        return;
    }

    const items = [{ clientId: data.id, result: clicked.payload }];
    const skippedReasons = [];
    site.table.getSelectedData().forEach(other => {
        if (other.id === data.id) return;
        const entry = buildResultPayload(other, site);
        if (entry.payload) {
            items.push({ clientId: other.id, result: entry.payload });
        } else {
            skippedReasons.push(entry.reason);
        }
    });

    await createResults(site, items, skippedReasons);
}

// Sends the results in chunks to the bulk endpoint. Created (and already existing) results are removed
// from the table, rows which failed stay with the reason.
async function createResults(site, items, skippedReasons = []) {
    const done   = [];
    const errors = [];
    const notes  = []; // created, but not meeting a result rule (e.g. no quantity in ArboDat)

    showLoading();
    try {
        for (let i = 0; i < items.length; i += RESULT_CHUNK_SIZE) {
            const chunk = items.slice(i, i + RESULT_CHUNK_SIZE);
            try {
                const response = await axios.post(
                    `api/results/createViaMigration/bulk/${encodeURIComponent(site.taxonomyLabel)}`, chunk);
                response.data.forEach(status => {
                    if (status.status === "error") {
                        errors.push({ id: status.clientId, error: status.message || "failed" });
                    } else {
                        done.push(status.clientId);
                        if (status.status === "created" && status.message) notes.push(status.message);
                    }
                });
            } catch (error) {
                console.error("Error during bulk create of results: ", error);
                const message = getErrorMessage(error);
                chunk.forEach(item => errors.push({ id: item.clientId, error: message }));
            }
        }

        if (done.length > 0)   await deleteTableRows(site.table, done);
        if (errors.length > 0) await updateTableRows(site.table, errors);
    } finally {
        hideLoading();
    }

    // Summary --------------------------------------------------
    // A message also for one row (a failed single row: its error, below)
    if (items.length > 1 || skippedReasons.length > 0 || errors.length === 0) {
        let message = `${done.length} ${done.length === 1 ? "result" : "results"} created.`;
        if (skippedReasons.length > 0) {
            message += ` ${skippedReasons.length} selected skipped (${[...new Set(skippedReasons)].join(", ")}).`;
        }
        if (errors.length > 0) {
            message += ` ${errors.length} failed (see the rows).`;
        }
        (errors.length > 0 ? toast.error : toast.success)(message);
    } else if (errors.length > 0) {
        toast.error("Failed to create result: " + errors[0].error);
    }
    if (notes.length > 0) {
        toast.info(`${notes.length} created ${notes.length === 1 ? "result doesn't" : "results don't"} meet a rule `
                   + `of ArboDat+ (taken over as in ArboDat): ${[...new Set(notes)].join(" ")} `
                   + "Please check them in the Data Explorer.");
    }
}
