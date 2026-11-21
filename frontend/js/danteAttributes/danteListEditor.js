// DANTE dropdowns for Tabulator list editors (migration result table, explorer and input tables).
// The lists contain the same entries as the dropdowns of the input page (populateDanteDropdown):
// hierarchy (indentation), custom display order (displayOrder.js), guide terms as headings which can't be chosen.
// Needs fetchDanteAttribute.js and populateDanteDropdown.js.

// attribute -> { values: [{ value, label } | { label, options }], labels: Map(uri -> label) }
const danteListOptions = new Map();

// Builds the options of the attributes (once per attribute); call before danteEditorParams
async function loadDanteListOptions(attributes) {
    await Promise.all(attributes.map(getDanteListOptions));
}

async function getDanteListOptions(attribute) {
    if (!danteListOptions.has(attribute)) {
        await fetchDanteAttribute(attribute);

        const select = document.createElement("select");
        populateDanteDropdown(attribute, select);

        const values = [];
        const labels = new Map();
        const groups = []; // open groups: [{ indent, options }]
        Array.from(select.options).forEach(option => {
            if (!option.value && !option.disabled) return;

            // The hierarchy level is the indentation (non-breaking spaces) of the text
            const indent = option.textContent.match(/^ */)[0].length;
            while (groups.length > 0 && groups[groups.length - 1].indent >= indent) groups.pop();
            const parent = groups.length > 0 ? groups[groups.length - 1].options : values;

            if (option.disabled) {
                const group = { label: option.textContent, options: [] };
                parent.push(group);
                groups.push({ indent, options: group.options });
            } else {
                parent.push({ value: option.value, label: option.textContent });
                labels.set(option.value, option.getAttribute("data-label") ?? option.textContent.trim());
            }
        });
        danteListOptions.set(attribute, { values: withoutEmptyGroups(values), labels });
    }
    return danteListOptions.get(attribute);
}

function withoutEmptyGroups(values) {
    return values
        .map(value => value.options ? { ...value, options: withoutEmptyGroups(value.options) } : value)
        .filter(value => !value.options || value.options.length > 0);
}

// editorParams of a list editor for a DANTE attribute (loaded with loadDanteListOptions)
//   none:        first entry "none" (removes the value)
//   multiselect: several values (Tabulator: no search then)
//   fallback:    values if the vocabulary could not be loaded from DANTE
//                (columns whose dropdown used the backend copy before keep working without DANTE)
function danteEditorParams(attribute, { none = false, multiselect = false, fallback = [] } = {}) {
    let { values } = danteListOptions.get(attribute) ?? { values: [] };
    if (values.length === 0) values = fallback;
    return {
        values: none ? [{ value: null, label: "none" }, ...values] : values,
        // search while typing (Tabulator allows it only without multiselect)
        ...(multiselect ? { multiselect: true } : { autocomplete: true, listOnEmpty: true }),
        emptyValue: multiselect ? [] : null,
        placeholderEmpty: "no results",
    };
}

// taxCodes -------------------------------------------------------------------------------------
// A taxonomy has thousands of taxCodes: the dropdown shows only TAX_CODE_SUGGESTIONS of them,
// typing searches the code (starts with) and the name (contains).

const TAX_CODE_SUGGESTIONS = 100;

// taxCodes of a taxonomy with lowercased search keys, built once per taxonomy
const taxCodeOptions = new Map(); // taxonomyUri -> { values: [{ value, label, codeKey, nameKey }], labels: Map(uri -> label) }

function getTaxCodeOptions(taxonomyUri) {
    if (!taxCodeOptions.has(taxonomyUri)) {
        const values = (cachedTaxCodesForURI.get(taxonomyUri) || []).map(item => ({
            value:   item.uri,
            label:   [item.notation, item.prefLabel?.la].filter(Boolean).join(", "),
            codeKey: codeSearchKey(item.notation),                     // "|a|b"
            nameKey: String(item.prefLabel?.la ?? "").toLowerCase(),
        }));
        const labels = new Map(values.map(option => [option.value, option.label]));
        taxCodeOptions.set(taxonomyUri, { values, labels });
    }
    return taxCodeOptions.get(taxonomyUri);
}

// The first TAX_CODE_SUGGESTIONS taxCodes whose code starts with the typed text,
// followed by those whose name contains it. Without text: the first taxCodes,
// the chosen one (currentValue) on top, so the list shows it as selected.
function suggestTaxCodes(taxonomyUri, term, currentValue) {
    term = String(term ?? "").trim().toLowerCase();
    if (!term) {
        const { values, labels } = getTaxCodeOptions(taxonomyUri);
        const first = values.filter(option => option.value !== currentValue).slice(0, TAX_CODE_SUGGESTIONS);
        const current = labels.has(currentValue) ? [{ value: currentValue, label: labels.get(currentValue) }] : [];
        return current.concat(first.map(option => ({ value: option.value, label: option.label })));
    }

    const byCode = [];
    const byName = [];
    for (const option of getTaxCodeOptions(taxonomyUri).values) {
        if (option.codeKey.includes("|" + term)) {
            byCode.push(option);
            if (byCode.length >= TAX_CODE_SUGGESTIONS) break;
        } else if (byName.length < TAX_CODE_SUGGESTIONS && option.nameKey.includes(term)) {
            byName.push(option);
        }
    }
    return byCode.concat(byName).slice(0, TAX_CODE_SUGGESTIONS)
        .map(option => ({ value: option.value, label: option.label }));
}

// Label of a taxCode of any loaded taxonomy
function taxCodeLabel(uri) {
    for (const taxonomyUri of cachedTaxCodesForURI.keys()) {
        const label = getTaxCodeOptions(taxonomyUri).labels.get(uri);
        if (label) return label;
    }
    return undefined;
}

// editorParams of a taxCode list editor; taxonomyUriOf(cell): taxonomy of the row
function taxCodeEditorParams(taxonomyUriOf) {
    return {
        valuesLookup: (cell, term) => suggestTaxCodes(taxonomyUriOf(cell), term, cell.getValue()),
        filterRemote: true, filterDelay: 150, filterFunc: () => true,
        autocomplete: true, listOnEmpty: true, clearable: true, allowEmpty: true,
        emptyValue: null, placeholderEmpty: "no matching taxCode",
    };
}
