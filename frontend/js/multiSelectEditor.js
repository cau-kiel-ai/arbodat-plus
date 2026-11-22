// Searchable multi-select for Tabulator (select2): cell editor (multiSelectEditor) and header filter (multiSelectFilter).
//
// Values come from editorParams / headerFilterParams (as for Tabulator's list editor, so code that reads them stays valid):
//   values:      [{ value, label }], plain values, or groups { label, options: [...] } (headings, can't be chosen);
//                a function returning them (filter only: called again whenever the filter is opened)
//   valuesLookup: true (filter only) -> the distinct values of the column
//   tags:        true -> new values can be typed (Enter or ';')
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
// - filter: filters while values are chosen / removed
// Needs jQuery and select2; styles see scss/_multiSelectEditor.scss.

const multiSelectDefaultMatcher = $.fn.select2.defaults.defaults.matcher;
const multiSelectUtils = $.fn.select2.amd.require("select2/utils");

// Widest a column grows for its pills (px); more pills wrap into several lines
const MULTI_SELECT_MAX_WIDTH = 500;

// Fills the <select> with the values; returns Map(option value -> original value)
function fillMultiSelect(select, values, chosen) {
    const originals = new Map();
    const chosenKeys = new Set(chosen.map(String));

    const addOption = (parent, entry) => {
        const { value, label } = typeof entry === "object" && entry !== null ? entry : { value: entry, label: entry };
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
function multiSelectValues($select, originals) {
    return ($select.val() ?? []).map(key => originals.has(key) ? originals.get(key) : key);
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

// select2 on the <select> with the shared behaviour; anchor: the element the dropdown is placed under
function attachMultiSelect(select, { anchor, column, placeholder, tags = false, cssClass, onResize = () => {} }) {
    const $select = $(select).select2({
        placeholder: { id: "", text: placeholder },
        allowClear: true,               // x at the right end: removes all values
        closeOnSelect: false,           // several values one after another
        width: "100%",
        dropdownParent: $(document.body),
        tags,
        tokenSeparators: tags ? [";"] : undefined,
        // Chosen values are not offered (and can't be highlighted / deselected by Enter)
        matcher: (params, data) => data.element?.selected ? null : multiSelectDefaultMatcher(params, data),
        // Pills without the indentation of entries under a heading (DANTE lists)
        templateSelection: data => String(data.text ?? "").replace(/^[\s\u00a0]+/, ""),
    });
    const select2 = $select.data("select2");
    select2.$container.addClass(cssClass);
    select2.dropdown.$dropdown.addClass("multi-select-dropdown");

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
        $container.removeClass("multi-select-wrap"); // width of the pills in one line
        const needed = selection.scrollWidth + 12; // + cell padding
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

// Cell editor
function multiSelectEditor(cell, onRendered, success, cancel, params = {}) {
    const before = cell.getValue() ?? [];
    const select = document.createElement("select");
    select.multiple = true;
    const originals = fillMultiSelect(select, params.values, before);

    onRendered(() => {
        // Wrapped pills: the row gets as high as needed (and back after closing)
        const normalizeRowHeight = () => cell.getRow().normalizeHeight?.();
        const multiSelect = attachMultiSelect(select, {
            anchor: cell.getElement(), column: cell.getColumn(), placeholder: "search",
            tags: params.tags === true, cssClass: "multi-select-editor", onResize: normalizeRowHeight,
        });
        multiSelect.$select.one("select2:close", () => {
            multiSelect.detach();
            const values = multiSelectValues(multiSelect.$select, originals);
            multiSelect.$select.select2("destroy");
            const unchanged = values.length === before.length && values.every(value => before.includes(value));
            unchanged ? cancel() : success(values);
            setTimeout(normalizeRowHeight);
        });
        multiSelect.open();
    });
    return select;
}

// Header filter: filters while values are chosen / removed
function multiSelectFilter(cell, onRendered, success, cancel, params = {}) {
    const column = cell.getColumn();
    const select = document.createElement("select");
    select.multiple = true;
    let originals = new Map();
    const dynamic = params.valuesLookup === true || typeof params.values === "function";
    const load = () => {
        const chosen = select.isConnected ? [...select.selectedOptions].map(option => originals.get(option.value) ?? option.value) : [];
        const values = params.valuesLookup === true ? distinctColumnValues(column)
                     : typeof params.values === "function" ? params.values() : params.values;
        originals = fillMultiSelect(select, values, chosen);
    };
    load();

    onRendered(() => {
        // No placeholder, like the other filter fields
        const multiSelect = attachMultiSelect(select, {
            anchor: cell.getElement(), column, placeholder: "", cssClass: "multi-select-filter",
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
