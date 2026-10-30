// Filters (and optional group-by) for the long tables on the migration page.
//
// createTableFilter({ tbody, fields, groups, counterColumns })
//   tbody   the <tbody> element (or its id) of the table to filter
//   fields  [{ key, label, column, getValue(row) }] -> one Select2 dropdown per field (single value, clearable),
//           placed in an extra header row above the column whose header text equals `column` (default: key).
//           Fields are combined with AND, a row is shown if getValue(row) equals the selected value.
//   counterColumns  optional [first, last] (1-based) header columns that are merged in the filter row
//           to show the "x of y rows" counter. Without it, the counter is shown above the table.
//   groups  optional [{ label, getKey(row), compare(rowA, rowB) }] -> adds a "group by" dropdown above the table
//           that sorts the rows and inserts a header row (with a 'select group' checkbox) per group.
//
// Rows hidden by a filter get the classes 'd-none filter-hidden' and are unchecked, so the bulk
// actions (select all, 'copy value to all checked rows', 'create all checked') skip them.
// The table is observed: rows added later (populate* functions) or removed (after Create / Add to JSON)
// update the filter options automatically.

const tableFilterCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
let tableFilterCounter = 0;

function createTableFilter({ tbody, fields = [], groups = [], counterColumns = null }) {
    tbody = typeof tbody === 'string' ? document.getElementById(tbody) : tbody;
    if (!tbody) return null;
    const table = tbody.closest('table');
    if (!table) return null;

    fields = fields.map(field => ({ ...field })); // each table keeps its own $select
    const filterId = ++tableFilterCounter;
    const active = {};          // field.key -> selected value
    let group = null;           // the selected entry of `groups`
    let refreshTimer = null;

    const isDataRow = row => !row.classList.contains('group-header');
    const dataRows = () => Array.from(tbody.rows).filter(isDataRow);

    // Filter row: one Select2 above each filtered column --------------------
    const normalize = text => text.replace(/[\s\u00a0\u202f]+/g, ' ').trim();
    let filterRow = null;
    const counter = document.createElement('span');
    counter.className = 'small text-muted';
    let counterInFilterRow = false;
    if (fields.length > 0) {
        const headerRow = table.querySelector('thead tr');
        filterRow = document.createElement('tr');
        filterRow.className = 'table-filter-row d-none';
        const [counterFirst, counterLast] = counterColumns ?? [0, 0];
        Array.from(headerRow.cells).forEach((headerCell, index) => {
            const column = index + 1;
            if (column > counterFirst && column <= counterLast) return; // merged into the counter cell
            const cell = document.createElement('th');
            if (column === counterFirst) {
                cell.colSpan = counterLast - counterFirst + 1;
                cell.className = 'align-middle';
                cell.appendChild(counter);
                counterInFilterRow = true;
            }
            const field = fields.find(field => normalize(headerCell.textContent) === (field.column ?? field.key));
            if (field) {
                const select = document.createElement('select');
                select.id = `tableFilter_${filterId}_${field.key}`;
                select.setAttribute('aria-label', `filter by ${field.label}`);
                cell.appendChild(select);
                field.$select = $(select);
            }
            filterRow.appendChild(cell);
        });
        headerRow.parentNode.insertBefore(filterRow, headerRow);
    }
    fields = fields.filter(field => field.$select); // fields without a matching column are ignored

    fields.forEach(field => {
        active[field.key] = '';
        field.$select.select2({
            placeholder: 'all',
            allowClear: true,
            width: '100%',
            dropdownCssClass: 'table-filter-dropdown',
        });
        field.$select.on('change', () => {
            active[field.key] = field.$select.val() || '';
            applyFilters();
        });
    });

    // Bar above the table: row counter and group by -------------------------
    const bar = document.createElement('div');
    bar.className = 'table-filter-bar d-flex flex-wrap align-items-center gap-3 mb-2 d-none';

    let groupSelect = null;
    if (groups.length > 0) {
        const label = document.createElement('label');
        label.innerHTML = `- group by <select>
            <option value="">-</option>
            ${groups.map((entry, index) => `<option value="${index}">${entry.label}</option>`).join('')}
        </select>`;
        groupSelect = label.querySelector('select');
        bar.appendChild(label);
    }

    if (!counterInFilterRow) bar.appendChild(counter);

    // Below the caption (if there is one), otherwise above the table
    if (bar.childElementCount > 0) {
        const caption = table.querySelector(':scope > caption');
        if (caption) {
            caption.appendChild(bar);
        } else {
            table.parentNode.insertBefore(bar, table);
        }
    }

    // Options ---------------------------------------------------------------

    // Distinct values of the table's rows. Returns true if the selected value had to be reset.
    function rebuildOptions(field) {
        const values = new Set();
        dataRows().forEach(row => {
            const value = field.getValue(row);
            if (value) values.add(value);
        });
        const sorted = Array.from(values).sort(tableFilterCollator.compare);

        let reset = false;
        if (active[field.key] && !values.has(active[field.key])) {
            active[field.key] = '';
            reset = true;
        }

        const $select = field.$select;
        $select.empty().append(new Option('', '', false, false));
        sorted.forEach(value => $select.append(new Option(value, value, false, value === active[field.key])));
        $select.val(active[field.key]).trigger('change.select2');
        return reset;
    }

    // The select-all checkbox in the header is checked only if all visible rows are checked
    function syncMasterCheckbox() {
        const master = table.querySelector('thead tr:not(.table-filter-row) input[type="checkbox"]');
        if (!master) return;
        const checkboxes = dataRows()
            .filter(row => !row.classList.contains('filter-hidden'))
            .map(rowCheckbox)
            .filter(checkbox => checkbox && !checkbox.disabled);
        master.checked = checkboxes.length > 0 && checkboxes.every(checkbox => checkbox.checked);
    }

    // Filtering -------------------------------------------------------------
    function applyFilters() {
        const rows = dataRows();
        let visible = 0;
        rows.forEach(row => {
            const show = fields.every(field => !active[field.key] || field.getValue(row) === active[field.key]);
            row.classList.toggle('d-none', !show);
            row.classList.toggle('filter-hidden', !show);
            if (show) {
                visible++;
            } else {
                row.querySelectorAll('input[type="checkbox"]:checked').forEach(checkbox => checkbox.checked = false);
            }
        });
        counter.textContent = visible === rows.length ? `${rows.length} rows` : `${visible} of ${rows.length} rows`;
        bar.classList.toggle('d-none', rows.length === 0);
        if (filterRow) filterRow.classList.toggle('d-none', rows.length === 0);
        updateGroupHeaders();
        syncMasterCheckbox();
    }

    // Grouping --------------------------------------------------------------
    function observeTbody() {
        observer.observe(tbody, { childList: true });
    }

    function rebuildGroups() {
        observer.disconnect(); // our own changes must not trigger the observer
        tbody.querySelectorAll('tr.group-header').forEach(header => header.remove());

        if (group) {
            const rows = dataRows().sort(group.compare); // stable sort
            const columnCount = table.querySelectorAll('thead th').length || 1;
            let currentKey = null;
            rows.forEach(row => {
                const key = group.getKey(row);
                if (key !== currentKey) {
                    currentKey = key;
                    const header = document.createElement('tr');
                    header.className = 'group-header table-active';
                    header.dataset.groupKey = key;
                    header.innerHTML = `
                        <td colspan="${columnCount}">
                            <label>
                                <input type="checkbox" class="group-select">
                                <strong></strong> <span class="group-count"></span>
                            </label>
                        </td>
                    `;
                    header.querySelector('strong').textContent = key || '(empty)';
                    tbody.appendChild(header);
                }
                tbody.appendChild(row);
            });
        }
        observeTbody();
        updateGroupHeaders();
    }

    // Rows that belong to a group header
    function rowsOfGroup(header) {
        const rows = [];
        let row = header.nextElementSibling;
        while (row && isDataRow(row)) {
            rows.push(row);
            row = row.nextElementSibling;
        }
        return rows;
    }

    const rowCheckbox = row => row.querySelector('input[type="checkbox"]');

    function updateGroupHeaders() {
        tbody.querySelectorAll('tr.group-header').forEach(header => {
            const visibleRows = rowsOfGroup(header).filter(row => !row.classList.contains('filter-hidden'));
            const checkboxes = visibleRows.map(rowCheckbox).filter(checkbox => checkbox && !checkbox.disabled);
            header.classList.toggle('d-none', visibleRows.length === 0);
            header.querySelector('.group-count').textContent = `(${visibleRows.length})`;
            header.querySelector('.group-select').checked = checkboxes.length > 0 && checkboxes.every(checkbox => checkbox.checked);
        });
    }

    if (groupSelect) {
        groupSelect.addEventListener('change', () => {
            group = groups[groupSelect.value] ?? null;
            rebuildGroups();
        });
    }

    // Select / deselect the visible rows of a group via its header checkbox
    tbody.addEventListener('change', event => {
        const target = event.target;
        if (target.classList && target.classList.contains('group-select')) {
            const header = target.closest('tr');
            rowsOfGroup(header)
                .filter(row => !row.classList.contains('filter-hidden'))
                .map(rowCheckbox)
                .forEach(checkbox => {
                    if (checkbox && !checkbox.disabled) checkbox.checked = target.checked;
                });
        }
        if (group) updateGroupHeaders();
        syncMasterCheckbox();
    });

    // Rows added or removed -------------------------------------------------
    function refresh() {
        clearTimeout(refreshTimer);
        refreshTimer = null;
        fields.forEach(rebuildOptions);
        if (group) rebuildGroups();
        applyFilters();
    }

    const observer = new MutationObserver(() => {
        if (refreshTimer) return;
        refreshTimer = setTimeout(refresh, 100);
    });
    observeTbody();
    refresh();

    return { refresh };
}
