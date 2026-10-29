// "filter by: code / name" for Select2 dropdowns.
//
// The radios decide whether the typed search text is matched against the code
// (starts with) or the name (contains), and by which field the options are sorted.
// The options need the lowercased attributes `data-code-lc` and `data-name-lc`
// (see populateDanteDropdown.js; the code attribute holds all notations as "|a|b"). Expected markup per dropdown with id `<selectId>`:
//   container  id="<filterName>"
//   radios     name="<filterName>", ids "<selectId>_filter_code" / "<selectId>_filter_name"
// <filterName> defaults to "<selectId>FilterBy".

const codeNameFilters = {}; // selectId -> { restore }

function initCodeNameFilter(selectId, filterName = `${selectId}FilterBy`) {
    const storageKey = filterName; // also the radios' name, the container's id and the localStorage key
    const radios = document.querySelectorAll(`input[name="${storageKey}"]`);
    const $select = $(`#${selectId}`);
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

    let mode = 'code';
    let termRaw = null;
    let term = '';

    // Match the typed search text against the code (starts with) or the name (contains).
    // Runs once per option and keystroke -> keep it cheap (no DOM queries, no repeated lowercasing).
    function matcher(params, data) {
        if (!params.term) return data;
        if (params.term !== termRaw) {
            termRaw = params.term;
            term = params.term.trim().toLowerCase();
        }
        if (!term) return data;
        const el = data.element;
        if (!el) return null;

        const matches = mode === 'name'
            ? (el.getAttribute('data-name-lc') || '').includes(term)
            : (el.getAttribute('data-code-lc') || '').includes('|' + term); // any notation starts with term
        return matches ? data : null;
    }

    // Sort the options alphabetically by code or name (according to the filter mode).
    // Keys are read once per option (decorate-sort-undecorate), natural order for numbers.
    function sorter(results) {
        const attr = mode === 'name' ? 'data-name-lc' : 'data-code-lc';
        const placeholder = [];
        const decorated = [];
        for (const result of results) {
            if (!result.element || result.id === '') {
                placeholder.push(result);
            } else {
                decorated.push({ result, key: result.element.getAttribute(attr) || '' });
            }
        }
        decorated.sort((a, b) => {
            // options without a value for the sort field go to the end
            if (!a.key !== !b.key) return a.key ? -1 : 1;
            return collator.compare(a.key, b.key);
        });
        return placeholder.concat(decorated.map(d => d.result));
    }

    // Select the remembered filter mode (default: code)
    function restore() {
        mode = 'code';
        try {
            mode = localStorage.getItem(storageKey) === 'name' ? 'name' : 'code';
        } catch (e) {}
        document.getElementById(`${selectId}_filter_${mode}`).checked = true;
    }

    $select.select2({
        placeholder: '',
        allowClear: true,
        width: '100%',
        matcher,
        sorter
    });
    // remove arrow
    $select.next('.select2-container').find('.select2-selection__arrow').remove();

    restore();

    // Keep the dropdown open (and the search field focused) when clicking the radios
    $(`#${storageKey}`).on('mousedown', function(e) {
        e.preventDefault();
        e.stopPropagation();
    });

    radios.forEach(radio => radio.addEventListener('change', function() {
        mode = this.value;
        try {
            localStorage.setItem(storageKey, this.value);
        } catch (e) {}
        // Re-run the search with the new mode
        // (only this dropdown's search field: other select2 fields would open)
        const select2 = $select.data('select2');
        if (select2.isOpen()) {
            const search = select2.dropdown.$search;
            search.trigger('input');
            // Clicking the radio/label moves the focus to the radio -> give it back to the search field
            search[0].focus();
            setTimeout(() => search[0].focus(), 0);
        }
    }));

    codeNameFilters[selectId] = { restore };
}

// Reset the radios to the remembered mode (e.g. after form.reset())
function restoreCodeNameFilterMode(selectId) {
    codeNameFilters[selectId]?.restore();
}
