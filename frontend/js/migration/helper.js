function toggleAllCheckboxes(masterCheckbox, tableBodyId) {
    const tableBody = document.getElementById(tableBodyId);
    if (tableBody) {
      // Rows hidden by a table filter (tableFilter.js) and group header checkboxes are skipped
      const checkboxes = tableBody.querySelectorAll('input[type="checkbox"]:not(.group-select)');
      checkboxes.forEach(checkbox => {
        if (!checkbox.disabled && !checkbox.closest('tr.filter-hidden')) {
          checkbox.checked = masterCheckbox.checked;
        }
      });
      // Let the table filter update its group header checkboxes
      tableBody.dispatchEvent(new Event('change'));
    }
}

let updatingDropdowns = false;
function updateCheckedDropdowns(value, tableBodyId, selectIdPrefix) {
    if (updatingDropdowns) return;
    updatingDropdowns = true;

    const tableBody = document.getElementById(tableBodyId);
    if (tableBody) {
        const checkboxes = tableBody.querySelectorAll('input[type="checkbox"]:checked');
        // Update value in checked Dropdowns
        checkboxes.forEach(checkbox => {
            if (!checkbox.disabled) {
                const row = checkbox.closest('tr');
                const dropdown = row.querySelector(`select[id^=${selectIdPrefix}]`);
                if (dropdown) {
                    dropdown.value = value;
                    if(selectIdPrefix === "coordinateSystemDropdown_") {
                        $(dropdown).trigger('change');
                    }
                    if ([
                        "c14LabDropdown_",
                        "taxCodeDropdown_",
                        "restTypeDropdown_",
                        "stateOfPreservationDropdown_",
                        "coordinateSystemDropdown_",
                        "danteDropdown_",
                    ].includes(selectIdPrefix)) {
                        $(dropdown).trigger('change.select2');
                    }
                }
            }
        });
    }
    updatingDropdowns = false;
}

let updatingDropdownsMultiple = false;
function updateCheckedDropdownsMultiple(values, tableBodyId, selectIdPrefix) {
    if (updatingDropdownsMultiple) return;
    updatingDropdownsMultiple = true;

    const tableBody = document.getElementById(tableBodyId);
    if (tableBody) {
        const checkboxes = tableBody.querySelectorAll('input[type="checkbox"]:checked');
        // Update values in checked Dropdowns
        checkboxes.forEach(checkbox => {
            if (!checkbox.disabled) {
                const row = checkbox.closest('tr');
                const dropdown = row.querySelector(`select[id^=${selectIdPrefix}]`);
                if (dropdown) {
                    // Clear previous selections
                    Array.from(dropdown.options).forEach(option => {
                        option.selected = values.includes(option.value);
                    });
                    if ([
                        "userDropdown_",
                        "danteDropdown_",
                    ].includes(selectIdPrefix)) {
                        $(dropdown).trigger('change.select2');
                    }
                }
            }
        });
    }
    updatingDropdownsMultiple = false;
}

function updateCheckedInputs(value, tableBodyId, inputIdPrefix) {
    const tableBody = document.getElementById(tableBodyId);
    if (tableBody) {
        const checkboxes = tableBody.querySelectorAll('input[type="checkbox"]:checked');
        // Update value in checked inputs
        checkboxes.forEach(checkbox => {
            if (!checkbox.disabled) {
                const row = checkbox.closest('tr');
                const input = row.querySelector(`input[id^=${inputIdPrefix}]`);
                if (input) {
                    input.value = value;
                }
            }
        });
    }
}

// Escape a value for a single quoted JS string inside an inline handler (onclick="fn('${escapeJsArg(value)}')"):
// first for the JS string, then for the HTML attribute
function escapeJsArg(value) {
    return String(value ?? "")
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;");
}

// Encode an item for the single quoted data-item attribute of the 'Add to JSON' button.
// encodeURIComponent keeps the apostrophe, which would end the attribute value.
function encodeRowItem(item) {
    return encodeURIComponent(JSON.stringify(item)).replace(/'/g, "%27");
}

// Add one grouped entry to the JSON, remove all rows it covers and tell the user
// how many rows were added and how many rows with the same label had to be skipped
function addGroupToJSON(entry, rows, skippedReasons = [], removeRows = rows => rows.forEach(row => row.remove())) {
    jsonData.push(entry);
    removeRows(rows);
    displayJSON();
    console.log(`${rows.length} row(s) added to JSON`);

    if (rows.length > 1 || skippedReasons.length > 0) {
        let message = `${rows.length} ${rows.length === 1 ? "row" : "rows"} added to JSON.`;
        if (skippedReasons.length > 0) {
            const reasons = [...new Set(skippedReasons)].join(", ");
            message += ` ${skippedReasons.length} more with the same label skipped (${reasons}).`;
        }
        toast.success(message);
    }
}

// Adds all rows with the same attribute and nonMatchingLabel as the clicked row
function addLabelToJSON(itemId, attribute, button) {
    const clickedRow = button.closest("tr");
    const label = clickedRow.dataset.nonMatchingLabel;

    const rows = Array.from(document.querySelectorAll("tr[data-attribute]"))
        .filter(row => row.dataset.attribute === attribute && row.dataset.nonMatchingLabel === label);
    if (!rows.includes(clickedRow)) {
        rows.push(clickedRow);
    }

    addGroupToJSON({
        attribute: attribute,
        nonMatchingLabel: label,
        itemIds: rows.map(row => row.dataset.id ?? itemId)
    }, rows);
}

function addLabelToJSONWithItem(button, attribute) {
    // attributes: 'coordinateSystemSite', 'coordinateSystemSample' (results: addResultsToJSON, C14 laboratories: addC14LabCodesToJSON)
    const row = button.closest("tr");

    if (attribute == "coordinateSystemSite" || attribute == "coordinateSystemSample") {
        addCoordinatesToJSON(row, attribute);
    }
}

// Results -------------------------------------------------------------------
// (rows are Tabulator rows of the result tables, see result.js)

const NO_FRACTION_ANALYZED = "no fraction analyzed";

// Checks one result row and collects its non matching values.
// Returns { data, payload } or { message, reason } if the row can not be added to the JSON.
// 'data' (itemType + the not set non matching values) is also returned with a message,
// except if the taxonomy is missing.
function buildResultEntry(rowData) {
    const site = resultTables.get(rowData.siteLabel);

    // The empty option of the dropdown has no text, "select Taxonomy" is only the select2 placeholder
    if (!site.taxonomyLabel) {
        return {
            message: "Before you can 'Add to JSON', you must select a 'Taxonomy' for this site.",
            reason: "no taxonomy selected"
        };
    }

    const data = {
        itemType: "result",
    };

    // Values which are not set by a dropdown are added to the JSON
    const taxCodeIsSet = !rowData.needsTaxCode || !!rowData.danteTaxCode;
    if (!taxCodeIsSet) {
        data.nonMatching_taxCode = {
            nonMatching_taxCode: rowData.taxCode,
            taxonomy: site.taxonomyLabel
        };
    }

    const restTypeIsSet = !rowData.needsRestType || !!rowData.danteRestType;
    if (!restTypeIsSet) {
        data.nonMatching_restType = rowData.restType;
    }

    const stateOfPreservationIsSet = !rowData.needsStateOfPreservation || !!rowData.danteStateOfPreservation;
    if (!stateOfPreservationIsSet) {
        data.nonMatching_stateOfPreservation = rowData.stateOfPreservation;
    }

    // 'data' is returned with the messages, so the caller can still compare the non matching values
    if (rowData.fractionAnalyzed === "") {
        return {
            data: data,
            message: "Before you can 'Add to JSON', you must create the corresponding fraction analysed for the corresponding sample in the ‘Fraction Analyzed’ accordion.",
            reason: NO_FRACTION_ANALYZED
        };
    }

    if (taxCodeIsSet && restTypeIsSet && stateOfPreservationIsSet) {
        return {
            data: data,
            message: "Everything to create a result is set correctly. Please use 'Create' option instead of 'Add to JSON'.",
            reason: "everything is set, use 'Create'"
        };
    }

    return {
        data: data,
        payload: resultPayload(rowData, site)
    };
}

// Removes result rows (of possibly several site tables), one delete per table
function removeResultRows(rows) {
    const idsBySite = new Map();
    rows.forEach(row => {
        const { siteLabel, id } = row.getData();
        if (!idsBySite.has(siteLabel)) idsBySite.set(siteLabel, []);
        idsBySite.get(siteLabel).push(id);
    });
    idsBySite.forEach((ids, siteLabel) => deleteTableRows(resultTables.get(siteLabel).table, ids));
}

// Adds the clicked result and all results with the same non matching values
// (and the same taxonomy) to the JSON
function addResultsToJSON(row) {
    const rowData = row.getData();
    const clicked = buildResultEntry(rowData);
    if (clicked.message) {
        // No fraction analyzed and nothing to create it from: offer to create it, then add again
        if (clicked.reason === NO_FRACTION_ANALYZED &&
            !hasPendingFractionAnalyzedRow(rowData.siteLabel, rowData.sampleId, rowData.originalFraction)) {
            const table = resultTables.get(rowData.siteLabel).table;
            openCreateFractionModal(rowData, () => addResultsToJSON(table.getRow(rowData.id)));
        } else {
            toast.info(clicked.message);
        }
        return;
    }

    const signature = JSON.stringify(clicked.data);
    const rows     = [row];
    const payloads = [clicked.payload];
    const skippedReasons = [];

    resultTables.forEach(site => {
        site.table.getRows().forEach(otherRow => {
            const otherData = otherRow.getData();
            if (otherData.id === rowData.id) return;

            // Only rows with the same not set values (and taxonomy); values set by a dropdown are not compared
            const other = buildResultEntry(otherData);
            if (!other.data || JSON.stringify(other.data) !== signature) return;

            if (other.message) {
                skippedReasons.push(other.reason);
            } else {
                rows.push(otherRow);
                payloads.push(other.payload);
            }
        });
    });

    addGroupToJSON({ ...clicked.data, items: payloads }, rows, skippedReasons, removeResultRows);
}

// Coordinates ---------------------------------------------------------------

function readCoordinateRow(row, attribute) {
    // Get latitude, longitude, altitude, remarks from input
    const longitude = parseFloat(row.cells[2].querySelector("input").value);
    const latitude  = parseFloat(row.cells[3].querySelector("input").value);
    const altitude  = parseFloat(row.cells[4].querySelector("input").value);

    // WGS84 and remarks are shifted by one cell in the sample table
    const offset = attribute == "coordinateSystemSite" ? 0 : 1;
    const longitudeWgs84 = parseFloat(row.cells[7 + offset].querySelector("input").value);
    const latitudeWgs84  = parseFloat(row.cells[8 + offset].querySelector("input").value);
    const remarks        = row.cells[9 + offset].querySelector("textarea").value;

    return {
        [attribute == "coordinateSystemSite" ? "siteId" : "sampleId"]: row.dataset.itemId,
        latitude:       latitude,
        longitude:      longitude,
        altitude:       altitude,
        longitudeWgs84: longitudeWgs84,
        latitudeWgs84:  latitudeWgs84,
        remarks:        remarks,
    };
}

// Adds the clicked coordinate and all coordinates of the same table with the same coordinate system
function addCoordinatesToJSON(row, attribute) {
    const label = row.dataset.coordinateSystem;

    const rows = Array.from(row.closest("tbody").rows)
        .filter(otherRow => otherRow === row || otherRow.dataset.coordinateSystem === label);

    addGroupToJSON({
        itemType: attribute === "coordinateSystemSite" ? "coordinateSite" : "coordinateSample",
        nonMatching_coordinateSystem: label,
        items: rows.map(otherRow => readCoordinateRow(otherRow, attribute))
    }, rows);
}

// C14 laboratories ----------------------------------------------------------
// (rows are Tabulator rows of the C14 table, see labsAndNumbers.js)

// Adds the clicked C14 dating and all C14 datings with the same new laboratory entered
function addC14LabCodesToJSON(row) {
    const data = row.getData();

    const number = String(data.number ?? "").trim();
    if (!number) {
        toast.info(`No number entered.`);
        return;
    }
    const newC14LabCode = String(data.newC14Laboratory ?? "").trim();
    if (!newC14LabCode) {
        toast.info(`No new C14Laboratory entered.`);
        return;
    }

    const rows  = [row];
    const items = [{ absoluteDatingId: data.absoluteDatingId, number: number }];
    const skippedReasons = [];

    c14LabTable.getRows().forEach(otherRow => {
        const other = otherRow.getData();
        if (other.id === data.id) return;
        if (String(other.newC14Laboratory ?? "").trim() !== newC14LabCode) return;

        const otherNumber = String(other.number ?? "").trim();
        if (!otherNumber) {
            skippedReasons.push("no number entered");
            return;
        }
        rows.push(otherRow);
        items.push({ absoluteDatingId: other.absoluteDatingId, number: otherNumber });
    });

    addGroupToJSON({
        itemType: "C14Dating",
        nonMatching_C14LabCode: newC14LabCode,
        items: items
    }, rows, skippedReasons, rows => deleteTableRows(c14LabTable, rows.map(row => row.getData().id)));
}

// Common parts of the migration Tabulators (results, fractions analyzed, labs and numbers) ----------

// Checkbox column; the checkbox in the header (de)selects only the filtered rows
function selectionColumn() {
    return {cssClass: "selectionColumn", formatter: "rowSelection", titleFormatter: "rowSelection",
            titleFormatterParams: { rowRange: "active" }, hozAlign: "center", headerSort: false, width: 40};
}

// Text column with a filter field in the header (site, feature, sample, ...)
function filterTextColumn(title, field) {
    return {title, field, headerSort: false, minWidth: 90, formatter: "plaintext",
            headerFilter: "input", headerFilterPlaceholder: "filter"};
}

// - counter: element for "x rows" / "x of y rows"
// - rows hidden by a filter are deselected, so the bulk actions skip them
// - a value edited in a selected row is copied to the other selected rows:
//   copyFields = { field: canCopy(rowData) } (rows for which canCopy is false keep their value)
function setupMigrationTable(table, { counter, copyFields = {} }) {
    table.on("cellEdited", cell => {
        const row = cell.getRow();
        const canCopy = copyFields[cell.getField()];
        if (!row.isSelected() || !canCopy) return;

        const updates = table.getSelectedData()
            .filter(data => data.id !== row.getData().id && canCopy(data))
            .map(data => ({ id: data.id, [cell.getField()]: cell.getValue() }));
        if (updates.length > 0) updateTableRows(table, updates);
    });

    const updateCounter = () => {
        const total  = table.getDataCount();
        const active = table.getDataCount("active");
        counter.textContent = active === total ? `${total} rows` : `${active} of ${total} rows`;
    };
    table.on("dataFiltered", (filters, activeRows) => {
        const active = new Set(activeRows);
        table.getSelectedRows().filter(row => !active.has(row)).forEach(row => row.deselect());
        setTimeout(updateCounter);
    });
    table.on("dataChanged",   updateCounter);
    table.on("rowDeleted",    updateCounter);
    table.on("dataProcessed", updateCounter);
}

// Tabulator can't measure itself in a collapsed accordion: redraw the migration tables once they are visible.
// Tables which are still being built measure themselves (the accordions are open then).
function redrawMigrationTables() {
    const tables = [fractionTable, c14LabTable, labTable, ...[...resultTables.values()].map(site => site.table)];
    tables.forEach(table => {
        if (table?.initialized) table.redraw(true);
    });
}

// Bulk changes of the migration Tabulators. Tabulator updates and deletes rows one by one
// (thousands of rows take seconds), so for many rows the data is replaced instead (~100x faster).
// replaceData keeps filters, sorting and the scroll position; the selection is restored.
const BULK_ROWS = 50;

async function replaceTableData(table, data) {
    const selected = table.getSelectedData().map(row => row.id);
    await table.replaceData(data);
    if (selected.length > 0) {
        const remaining = new Set(data.map(row => row.id));
        table.selectRow(selected.filter(id => remaining.has(id)));
    }
}

// Updates rows by id: updates = [{ id, ...changed fields }]
function updateTableRows(table, updates) {
    if (updates.length < BULK_ROWS) return table.updateData(updates);
    const byId = new Map(updates.map(update => [update.id, update]));
    return replaceTableData(table, table.getData().map(row => byId.has(row.id) ? { ...row, ...byId.get(row.id) } : row));
}

// Removes rows by id
function deleteTableRows(table, ids) {
    const remove = new Set(ids);
    if (remove.size < BULK_ROWS) return table.deleteRow([...remove]);
    return replaceTableData(table, table.getData().filter(row => !remove.has(row.id)));
}

function hideTableIfTbodyEmpty(tbody) {
    if (tbody) {
        const table = tbody.closest('table');
        if (table) {
            // hide if empty
            if (tbody.rows.length === 0) {
                table.style.display = 'none';
            } else { // display
                table.style.display = 'table';
            }
        }
    }
}

// Open an accordion section without animation and mark its header button as expanded,
// so it is styled like a section opened by a click
function showAccordionSection(collapseId) {
    const collapseElement = document.getElementById(collapseId);
    if (!collapseElement) return;
    collapseElement.classList.add("show");
    document.querySelectorAll(`[data-bs-target="#${collapseId}"]`).forEach(button => {
        button.classList.remove("collapsed");
        button.setAttribute("aria-expanded", "true");
    });
}
