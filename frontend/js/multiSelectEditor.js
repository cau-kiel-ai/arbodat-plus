// Searchable select for Tabulator (select2): cell editors for several values (multiSelectEditor) or one value
// (singleSelectEditor) and a header filter for several values (multiSelectFilter).
//
// Values come from editorParams / headerFilterParams (as for Tabulator's list editor, so code that reads them stays valid):
//   values:       [{ value, label }], plain values, or groups { label, options: [...] } (headings, can't be chosen);
//                 entries without a value (e.g. 'none') are left out: the x removes the value;
//                 a function returning them (filter only: called again whenever the filter is opened)
//   valuesLookup: true (filter only) -> the distinct values of the column (labels as in the download)
//                 a function (cell, term) (single editor only) -> the entries for a search term (e.g. taxCodes)
//   valuesInData: true (filter only) -> only the values which are in the column
//   tags:         true -> new values can be typed (Enter, or ';' for several values)
//   isTag:        term -> whether a typed term can be a new value (e.g. a year of 4 digits)
//   tagValue:     key -> the value of a typed term (e.g. Number)
// The original values are given back (e.g. numbers stay numbers).
//
// Behaviour:
// - chosen values are not offered again (removed with the x of their pill); the search is cleared after each choice
// - the list stays open on clicks into the field and on x; the dropdown is placed directly under the field
// - the pills stay in one line, the column grows with them (and keeps its width) up to MULTI_SELECT_MAX_WIDTH;
//   with more pills they wrap into several lines (the row / header gets higher)
// - an x at the right end removes all values (the cursor is in the search field afterwards); Esc closes the list
//   (also when the search field has no focus), as does the focus going to another field
// - editor: closing the list (click outside, Esc) takes the selection, an unchanged selection is no edit
// - single editor: the value is shown as text (no pill); choosing a value takes it at once;
//   required columns (title with '*') have no x
// - long lists show the first MULTI_SELECT_RESULT_LIMIT matching entries (typing narrows them)
// - a pill longer than the field is cut (...); filter: the header gets higher with wrapped pills
// - filter: filters while values are chosen / removed
// Needs jQuery and select2; styles see scss/_multiSelectEditor.scss.

const multiSelectDefaultMatcher = $.fn.select2.defaults.defaults.matcher;
const multiSelectUtils = $.fn.select2.amd.require("select2/utils");

// Widest a column grows for its pills (px); more pills wrap into several lines
const MULTI_SELECT_MAX_WIDTH = 500;

// Entries shown at once (long lists like samples, taxCodes); typing narrows them
const MULTI_SELECT_RESULT_LIMIT = 200;

// Fills the <select> with the values; returns Map(option value -> original value).
// chosen: values or { value, label } entries
function fillMultiSelect(select, values, chosen) {
    const originals = new Map();
    const chosenKeys = new Set(chosen.map(entry => String(typeof entry === "object" && entry !== null ? entry.value : entry)));

    const addOption = (parent, entry) => {
        const { value, label } = typeof entry === "object" && entry !== null ? entry : { value: entry, label: entry };
        if (value === null || value === undefined) return; // 'none': the x removes the value
        const key = String(value);
        if (originals.has(key)) return;
        originals.set(key, value);
        parent.appendChild(new Option(String(label ?? value), key, false, chosenKeys.has(key)));
    };
    const addEntries = (parent, entries, level) => entries.forEach(entry => {
        if (entry?.options) {
            if (level === 0) {
                const group = document.createElement("optgroup");
                group.label = entry.label;
                parent.appendChild(group);
                addEntries(group, entry.options, level + 1);
            } else {
                // optgroups can't be nested: a deeper heading is a disabled entry
                const heading = new Option(entry.label, "", false, false);
                heading.disabled = true;
                parent.appendChild(heading);
                addEntries(parent, entry.options, level + 1);
            }
        } else {
            addOption(parent, entry);
        }
    });

    select.replaceChildren();
    addEntries(select, values ?? [], 0);
    // Chosen values which are not in the list (e.g. typed tags) stay chosen
    chosen.forEach(value => addOption(select, value));
    return originals;
}

// The chosen values, as the original values
function multiSelectValues($select, originals, tagValue = key => key) {
    return ($select.val() ?? []).map(key => originals.has(key) ? originals.get(key) : tagValue(key));
}

// Distinct values of a column (also of array values), sorted
function distinctColumnValues(column) {
    const field = column.getField();
    const values = new Set();
    column.getTable().getData().forEach(row => {
        const value = field.split(".").reduce((object, key) => object?.[key], row);
        [].concat(value ?? []).forEach(item => { if (item !== "" && item !== null) values.add(item); });
    });
    return [...values].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
}

// editorParams for years (e.g. excavation years): the years in the column (newest first),
// a new year can be typed (4 digits)
function yearEditorParams(cell) {
    return {
        values: distinctColumnValues(cell.getColumn()).reverse(),
        tags: true,
        isTag: term => /^\d{4}$/.test(term),
        tagValue: Number,
    };
}

// Value -> label of the values in a column (labels as in the download, e.g. names instead of ids), sorted by label
function columnValueLabels(column) {
    const field = column.getField();
    const toLabel = column.getDefinition().accessorDownload;
    const labels = new Map();
    column.getTable().getData().forEach(row => {
        const value = field.split(".").reduce((object, key) => object?.[key], row);
        [].concat(value ?? []).forEach(item => {
            if (item === "" || item === null || labels.has(item)) return;
            // the download label is for the whole value: only for single values
            const label = toLabel && !Array.isArray(value) ? toLabel(item, row) : item;
            labels.set(item, label === "" || label === null || label === undefined ? item : label);
        });
    });
    return new Map([...labels].sort(([, a], [, b]) => String(a).localeCompare(String(b), undefined, { numeric: true })));
}

// Only the entries whose value is in the set (headings without entries are left out)
function entriesIn(values, keys) {
    return (values ?? [])
        .map(entry => entry?.options ? { ...entry, options: entriesIn(entry.options, keys) } : entry)
        .filter(entry => entry?.options
            ? entry.options.length > 0
            : keys.has(String(typeof entry === "object" && entry !== null ? entry.value : entry)));
}

// select2 on the <select> with the shared behaviour; anchor: the element the dropdown is placed under
//   single:    one value (shown as text, see singleSelectEditor)
//   clearable: x at the right end which removes all values
//   search:    term -> fills the <select> with the entries for the term itself (no matching by select2)
function attachMultiSelect(select, { anchor, column, placeholder, tags = false, cssClass, onResize = () => {},
                                     single = false, clearable = true, search, isTag }) {
    const $select = $(select).select2({
        placeholder: { id: "", text: placeholder },
        allowClear: clearable,          // x at the right end: removes all values
        closeOnSelect: false,           // several values one after another
        width: "100%",
        dropdownParent: $(document.body),
        tags,
        tokenSeparators: tags && !single ? [";"] : undefined,
        // only terms that can be a value (e.g. 4 digits for a year) are offered as new value
        ...(isTag ? { createTag: params => {
            const term = String(params.term ?? "").trim();
            return isTag(term) ? { id: term, text: term } : null;
        } } : {}),
        // Chosen values are not offered (and can't be highlighted / deselected by Enter);
        // also under a heading (select2 matches the entries of a group with its own matcher)
        matcher: (params, data) => {
            if (data.element?.selected) return null;
            if (data.children) {
                const children = data.children.filter(child => !child.element?.selected);
                if (children.length === 0) return null;
                data = { ...data, children };
            }
            return multiSelectDefaultMatcher(params, data);
        },
        // Pills without the indentation of entries under a heading (DANTE lists)
        templateSelection: data => String(data.text ?? "").replace(/^[\s\u00a0]+/, ""),
    });
    const select2 = $select.data("select2");
    select2.$container.addClass(cssClass);
    select2.dropdown.$dropdown.addClass("multi-select-dropdown");
    if (single) select2.$container.addClass("multi-select-single");

    // Searching: the entries for the term (search), at most MULTI_SELECT_RESULT_LIMIT of them
    const dataAdapter = select2.dataAdapter;
    const query = dataAdapter.query.bind(dataAdapter);
    dataAdapter.query = (params, callback) => {
        if (search) {
            search(params.term ?? "");
            params = { ...params, term: "" };
        }
        query(params, data => {
            const results = data.results ?? [];
            if (results.length <= MULTI_SELECT_RESULT_LIMIT) return callback(data);
            callback({ ...data, results: [...results.slice(0, MULTI_SELECT_RESULT_LIMIT),
                { id: "", text: `${results.length - MULTI_SELECT_RESULT_LIMIT} more: type to narrow the list`, disabled: true }] });
        });
    };

    // Not clearable (required): Backspace in the empty search field doesn't remove the value either
    if (!clearable) {
        select2.$container[0].addEventListener("keydown", event => {
            if (event.key === "Backspace" && event.target.value === "") {
                event.preventDefault();
                event.stopPropagation();
            }
        }, true);
        $select.on("select2:unselecting", event => event.preventDefault());
    }

    // One value: its text gives way to the typed search
    if (single) {
        select2.$container.on("input", ".select2-search__field", event =>
            select2.$container.toggleClass("multi-select-typing", event.target.value !== ""));
    }

    // The dropdown is placed directly under the anchor and as wide as it (select2 would align it to its own,
    // smaller field). select2 positions it on open, scroll and resize: corrected after it.
    const dropdown = select2.dropdown;
    const placeUnderAnchor = () => {
        const rect = anchor.getBoundingClientRect();
        const $parent = dropdown.$dropdownParent;
        const parentOffset = $parent.css("position") !== "static" ? $parent.offset() : { top: 0, left: 0 };
        const above = dropdown.$dropdown.hasClass("select2-dropdown--above");
        const top = above ? rect.top + window.scrollY - dropdown.$dropdown.outerHeight(false) : rect.bottom + window.scrollY;
        // 1px to the left: the dividing line on the left belongs to the cell before
        dropdown.$dropdownContainer.css({ top: top - parentOffset.top, left: rect.left - 1 + window.scrollX - parentOffset.left });
        dropdown.$dropdown.css({ width: rect.width + 1 });
    };
    for (const name of ["_positionDropdown", "_resizeDropdown"]) {
        const original = dropdown[name]?.bind(dropdown);
        if (original) dropdown[name] = (...args) => { original(...args); placeUnderAnchor(); };
    }

    // A cell that got higher (wrapped pills, e.g. in the last row) is scrolled into the table's view.
    // select2 locks the scroll position of the parents while the list is open (it resets them on scroll):
    // the new position is stored for it.
    const revealAnchor = () => {
        const holder = anchor.closest(".tabulator-tableholder");
        if (!holder) return; // header filter
        const view = holder.getBoundingClientRect();
        const rect = anchor.getBoundingClientRect();
        // down by the hidden part, but the top of the cell stays visible
        const delta = Math.min(rect.bottom - (view.top + holder.clientHeight), rect.top - view.top);
        if (delta <= 0) return;
        const y = holder.scrollTop + delta;
        multiSelectUtils.StoreData(holder, "select2-scroll-position", { x: holder.scrollLeft, y });
        holder.scrollTop = y;
    };

    // The column grows with the pills (and keeps its width); above MULTI_SELECT_MAX_WIDTH they wrap
    const fit = () => {
        if (!$select.data("select2")) return; // already closed
        const $container = select2.$container;
        const selection = $container.find(".select2-selection")[0];
        // width of the pills in one line, at their full length (otherwise they are cut to the field)
        $container.removeClass("multi-select-wrap");
        // what the column has around the field (padding of the cell / header filter)
        const around = Math.max(0, column.getWidth() - selection.getBoundingClientRect().width);
        $container.addClass("multi-select-measure"); // the field as wide as its content
        const needed = Math.ceil(selection.getBoundingClientRect().width + around);
        $container.removeClass("multi-select-measure");
        const width = Math.min(needed, MULTI_SELECT_MAX_WIDTH);
        if (width > column.getWidth()) column.setWidth(width);
        $container.toggleClass("multi-select-wrap", needed > column.getWidth());
        onResize();
        revealAnchor();
        if (select2.isOpen()) placeUnderAnchor();
    };
    $select.on("change", () => setTimeout(fit));

    // After a value is chosen (or removed with x): clear the search text and list the values again.
    // The query is triggered directly: select2 ignores an input event right after Enter, and Enter on a
    // stale, already chosen entry would close the list.
    $select.on("select2:select select2:unselect", () => setTimeout(() => {
        if (!$select.data("select2") || !select2.isOpen()) return;
        select2.$container.find(".select2-search__field").val("");
        select2.$container.removeClass("multi-select-typing");
        select2.trigger("query", { term: "" });
    }));

    // The list stays open when a value is removed with the x of its pill, and on a click into the field
    // (select2 would close it: a click on its field toggles the list).
    // Capture phase: before select2's own handler on its field.
    let keepOpen = false;
    const keepOpenNow = () => {
        keepOpen = true;
        setTimeout(() => keepOpen = false);
    };
    $select.on("select2:unselect", keepOpenNow);
    anchor.addEventListener("mousedown", keepOpenNow, true);
    anchor.addEventListener("click", keepOpenNow, true);
    $select.on("select2:closing", event => {
        if (keepOpen) event.preventDefault();
    });

    const searchField = () => select2.$container.find(".select2-search__field");

    // The x for all values toggles the list: it stays open if it was open, and closed if it was closed.
    // Afterwards the cursor is in the search field (typing searches again).
    let clearedWhileClosed = false;
    $select.on("select2:clear", () => {
        if (select2.isOpen()) {
            keepOpenNow();
        } else {
            clearedWhileClosed = true;
            setTimeout(() => clearedWhileClosed = false);
        }
        setTimeout(() => { if ($select.data("select2")) searchField().trigger("focus"); });
    });
    $select.on("select2:opening", event => {
        if (clearedWhileClosed) event.preventDefault();
    });

    // Esc closes the list, also when the search field has no focus (e.g. after a value was clicked)
    const closeOnEscape = event => {
        if (event.key === "Escape" && $select.data("select2") && select2.isOpen()) {
            event.preventDefault();
            event.stopPropagation();
            $select.select2("close");
        }
    };
    // The focus goes to another field (e.g. another header filter: Tabulator stops its mousedown,
    // on which select2 would close the list): the list closes
    const closeOnFocusElsewhere = event => {
        if (!$select.data("select2") || !select2.isOpen()) return;
        if (select2.$container[0].contains(event.target) || select2.dropdown.$dropdown[0].contains(event.target)) return;
        $select.select2("close");
    };
    // Only while the list is open (filters stay, a listener per filter would remain after a table switch)
    $select.on("select2:open", () => {
        document.addEventListener("keydown", closeOnEscape, true);
        document.addEventListener("focusin", closeOnFocusElsewhere, true);
    });
    $select.on("select2:close", () => {
        document.removeEventListener("keydown", closeOnEscape, true);
        document.removeEventListener("focusin", closeOnFocusElsewhere, true);
    });
    // Esc with closed list (e.g. after x): the field loses the focus
    select2.$container[0].addEventListener("keydown", event => {
        if (event.key === "Escape" && !select2.isOpen()) document.activeElement.blur();
    }, true);

    return {
        $select,
        open: () => { fit(); $select.select2("open"); fit(); },
        fit,
        // Removes the listeners on the anchor (it stays, e.g. a cell as long as its row)
        detach: () => {
            anchor.removeEventListener("mousedown", keepOpenNow, true);
            anchor.removeEventListener("click", keepOpenNow, true);
            document.removeEventListener("keydown", closeOnEscape, true);
            document.removeEventListener("focusin", closeOnFocusElsewhere, true);
        },
    };
}

// Wrapped pills: the row gets as high as needed (and back after closing). A table without a fixed height
// (e.g. the migration tables, maxHeight) gets as high as its rows again; without a redraw, which would end the edit.
function fitRowHeight(cell) {
    cell.getRow().normalizeHeight?.();
    cell.getTable().rowManager?.adjustTableSize?.(true);
}

// Cell editor
function multiSelectEditor(cell, onRendered, success, cancel, params = {}) {
    const before = cell.getValue() ?? [];
    const select = document.createElement("select");
    select.multiple = true;
    const originals = fillMultiSelect(select, params.values, before);

    onRendered(() => {
        const normalizeRowHeight = () => fitRowHeight(cell);
        const multiSelect = attachMultiSelect(select, {
            anchor: cell.getElement(), column: cell.getColumn(), placeholder: "search",
            tags: params.tags === true, isTag: params.isTag, cssClass: "multi-select-editor", onResize: normalizeRowHeight,
        });
        multiSelect.$select.one("select2:close", () => {
            multiSelect.detach();
            const values = multiSelectValues(multiSelect.$select, originals, params.tagValue);
            multiSelect.$select.select2("destroy");
            const unchanged = values.length === before.length && values.every(value => before.includes(value));
            unchanged ? cancel() : success(values);
            setTimeout(normalizeRowHeight);
        });
        multiSelect.open();
    });
    return select;
}

// Cell editor for one value: the search field as in multiSelectEditor, the value as text (no pill);
// choosing a value takes it at once, the x (not in required columns) removes it
function singleSelectEditor(cell, onRendered, success, cancel, params = {}) {
    const before = cell.getValue() ?? null;
    const select = document.createElement("select");
    select.multiple = true; // the search field in the cell (select2's single select has it in the dropdown)
    const lookup = typeof params.valuesLookup === "function" ? term => params.valuesLookup(cell, term) : null;
    const chosen = before === null || before === "" ? [] : [before];
    let originals = fillMultiSelect(select, lookup ? lookup("") : params.values, chosen);

    // valuesLookup: the entries of the term (the chosen value stays in the <select>)
    const search = lookup && (term => {
        const keep = [...select.selectedOptions].map(option =>
            ({ value: originals.has(option.value) ? originals.get(option.value) : option.value, label: option.text }));
        const entries = lookup(term);
        originals = fillMultiSelect(select, entries, keep); // keeps the chosen value (at the end if not an entry)
    });

    onRendered(() => {
        const normalizeRowHeight = () => fitRowHeight(cell);
        const required = String(cell.getColumn().getDefinition().title ?? "").startsWith("*");
        const multiSelect = attachMultiSelect(select, {
            anchor: cell.getElement(), column: cell.getColumn(), placeholder: "search",
            tags: params.tags === true, isTag: params.isTag, cssClass: "multi-select-editor", onResize: normalizeRowHeight,
            single: true, clearable: !required, search,
        });
        let picked; // key of the chosen entry
        multiSelect.$select.on("select2:select", event => {
            picked = event.params.data.id;
            setTimeout(() => { if (multiSelect.$select.data("select2")) multiSelect.$select.select2("close"); });
        });
        multiSelect.$select.one("select2:close", () => {
            multiSelect.detach();
            const keys = multiSelect.$select.val() ?? [];
            const key = picked !== undefined ? picked : keys[0];
            const value = key === undefined ? null : (originals.has(key) ? originals.get(key) : (params.tagValue ?? (k => k))(key));
            multiSelect.$select.select2("destroy");
            value === before ? cancel() : success(value);
            setTimeout(normalizeRowHeight);
        });
        multiSelect.open();
    });
    return select;
}

// headerFilterFunc of a multiSelectFilter on a column with one value: rows with one of the chosen values
function anyOfFilter(headerValue, rowValue) {
    return !Array.isArray(headerValue) || headerValue.length === 0 || headerValue.includes(rowValue);
}

// Header filter: filters while values are chosen / removed
function multiSelectFilter(cell, onRendered, success, cancel, params = {}) {
    const column = cell.getColumn();
    const select = document.createElement("select");
    select.multiple = true;
    let originals = new Map();
    const dynamic = params.valuesLookup === true || params.valuesInData === true || typeof params.values === "function";
    const load = () => {
        const chosen = select.isConnected ? [...select.selectedOptions].map(option => originals.get(option.value) ?? option.value) : [];
        let values = params.valuesLookup === true
            ? [...columnValueLabels(column)].map(([value, label]) => ({ value, label }))
            : typeof params.values === "function" ? params.values() : params.values;
        if (params.valuesInData === true) values = entriesIn(values, new Set(distinctColumnValues(column).map(String)));
        originals = fillMultiSelect(select, values, chosen);
    };
    load();

    onRendered(() => {
        // No placeholder, like the other filter fields
        const multiSelect = attachMultiSelect(select, {
            anchor: cell.getElement(), column, placeholder: "", cssClass: "multi-select-filter",
            // wrapped pills: the header gets as high as needed (Tabulator's own calculation of the header height)
            onResize: () => column.getTable().columnManager?.verticalAlignHeaders?.(),
        });
        // The values can change (edits, deleted rows)
        if (dynamic) multiSelect.$select.on("select2:opening", load);
        multiSelect.$select.on("change", () => {
            const values = multiSelectValues(multiSelect.$select, originals);
            success(values.length > 0 ? values : "");
        });
        // A click into the filter must not sort the column
        const container = multiSelect.$select.data("select2").$container;
        container.on("click", event => event.stopPropagation());
        // Closed by Esc or a click outside (e.g. into another filter): the filter loses the focus
        // (select2 would focus its search field again)
        multiSelect.$select.on("select2:close", () => setTimeout(() => {
            if (container[0].contains(document.activeElement)) document.activeElement.blur();
            container.removeClass("select2-container--focus");
        }));
    });
    return select;
}
