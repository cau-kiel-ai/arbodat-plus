// Settings page: edit the default values of the select fields in the input forms
// and the order of the options of the hierarchical select fields (sortable: true)

const SETTINGS_SECTIONS = [
    { title: "RESEARCH PROJECT", fields: [
        { key: "license", label: "license", attribute: "license" },
    ]},
    { title: "SITE", fields: [
        { key: "taxonomy",             label: "taxonomy",          attribute: "taxonomy" },
        { key: "siteType",             label: "site type",         attribute: "siteType", multiple: true },
        { key: "naturalUnit",          label: "natural unit",      attribute: "naturalUnit" },
        { key: "siteCoordinateSystem", label: "coordinate system", attribute: "coordinateSystem" },
    ]},
    { title: "FEATURE", fields: [
        { key: "featureType",           label: "feature type",           attribute: "featureType", sortable: true },
        { key: "preservationCondition", label: "preservation condition", attribute: "preservationCondition" },
    ]},
    { title: "SAMPLE", fields: [
        { key: "chronozone",             label: "chronozone",             attribute: "chronozone" },
        { key: "sampleType",             label: "sample type",            attribute: "sampleType" },
        { key: "seedsAndFruits",         label: "seeds and fruits",       attribute: "seedsAndFruits" },
        { key: "charcoalInvestigated",   label: "charcoal investigated",  attribute: "charcoalInvestigated" },
        { key: "woodSubfossile",         label: "wood subfossile",        attribute: "woodSubfossile" },
        { key: "sampleCoordinateSystem", label: "coordinate system",      attribute: "coordinateSystem" },
    ]},
    { title: "ABSOLUTE DATING", fields: [
        { key: "datingMethod",  label: "dating method",   attribute: "datingMethod", sortable: true },
        { key: "material",      label: "material",        attribute: "material" },
        { key: "c14Laboratory", label: "C14 laboratory",  attribute: "c14Laboratory" },
    ]},
    { title: "RESULTS", fields: [
        { key: "restType",             label: "rest type",             attribute: "restType", sortable: true },
        { key: "stateOfPreservation",  label: "state of preservation", attribute: "stateOfPreservation", sortable: true },
        { key: "classificationConfer", label: "classification confer", attribute: "classificationConfer", sortable: true },
    ]},
];

const settingsFields = SETTINGS_SECTIONS.flatMap(section => section.fields);
const settingsSelectId = field => `default_${field.key}`;
const orderListId = field => `order_list_${field.key}`;

// cached DANTE vocabulary of a sortable field (see fetchDanteAttribute.js)
const ORDER_CACHES = {
    featureType:          () => cachedFeatureTypes,
    datingMethod:         () => cachedDatingMethods,
    stateOfPreservation:  () => cachedStateOfPreservation,
    classificationConfer: () => cachedClassificationConfers,
    restType:             () => cachedRestTypes,
};

// 'custom': the order is saved with the next save; 'default': DANTE order, nothing is saved
const orderState = {};

// Custom order ---------------------------------------------------------------
function orderRowHtml(field) {
    return `
            <div class="row">
              <div class="accordion" style="margin-top: 12px; margin-bottom: 6px;">
                <div class="accordion-item">
                  <h2 class="accordion-header">
                    <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#order_collapse_${field.key}" aria-expanded="false">
                      Customize order of ${field.label}
                    </button>
                  </h2>
                  <div id="order_collapse_${field.key}" class="accordion-collapse collapse">
                    <div class="accordion-body"  style="margin-bottom: 0px;">
                      <button type="button" class="order-reset" data-field="${field.key}">Reset to default order</button>
                      <ul class="order-list" id="${orderListId(field)}"></ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>`;
}

function orderItemHtml(node, isNew) { // isNew: node -> bool
    return `
        <li data-uri="${escapeHtml(node.uri)}">
          <div class="order-item ${node.guide ? "guide" : ""}">
            <span class="order-handle" title="drag to move">&#x2807;</span>
            <span class="order-label">${escapeHtml(node.label)}</span>
            ${isNew(node) ? '<span class="order-badge">new</span>' : ""}
            <button type="button" class="order-move" data-direction="-1" aria-label="move up" title="move up">&#x25B2;</button>
            <button type="button" class="order-move" data-direction="1" aria-label="move down" title="move down">&#x25BC;</button>
          </div>
          ${node.children.length > 0 ? `<ul class="order-list">${node.children.map(child => orderItemHtml(child, isNew)).join("")}</ul>` : ""}
        </li>`;
}

// (Re)build the sortable tree of a field; savedOrder: uris of the stored order, [] for the default order
function renderOrderList(field, savedOrder) {
    const list = document.getElementById(orderListId(field));
    const tree = buildDisplayTree(field.attribute, ORDER_CACHES[field.key]());

    // values which are not in the stored order (e.g. new in DANTE) are marked
    const isNew = node => savedOrder.length > 0 && !savedOrder.includes(node.uri);
    list.innerHTML = tree.map(node => orderItemHtml(node, isNew)).join("");

    // one Sortable per level: items can only be moved among their siblings
    [list, ...list.querySelectorAll("ul")].forEach(ul => {
        Sortable.create(ul, {
            handle: ".order-handle",
            animation: 150,
            onEnd: () => { orderState[field.key] = "custom"; },
        });
    });
}

// Move an item up/down among its siblings (keyboard friendly alternative to drag & drop)
document.addEventListener("click", event => {
    const moveButton = event.target.closest(".order-move");
    if (moveButton) {
        const li = moveButton.closest("li");
        const direction = Number(moveButton.dataset.direction);
        const sibling = direction < 0 ? li.previousElementSibling : li.nextElementSibling;
        if (!sibling) return;

        direction < 0 ? li.parentElement.insertBefore(li, sibling) : li.parentElement.insertBefore(sibling, li);
        const field = settingsFields.find(f => f.sortable && li.closest(`#${orderListId(f)}`));
        orderState[field.key] = "custom";
        moveButton.focus();
        return;
    }

    const resetButton = event.target.closest(".order-reset");
    if (resetButton) {
        const field = settingsFields.find(f => f.key === resetButton.dataset.field);
        sortDisplayData(field.attribute, ORDER_CACHES[field.key](), []);
        renderOrderList(field, []);
        orderState[field.key] = "default";
    }
});

// DFS list of the uris of a field (parent followed by its children)
function serializeOrderList(field) {
    const uris = [];
    const walk = ul => {
        for (const li of ul.children) {
            uris.push(li.dataset.uri);
            const childList = li.querySelector(":scope > ul");
            if (childList) walk(childList);
        }
    };
    walk(document.getElementById(orderListId(field)));
    return uris;
}

// Build accordion ------------------------------------------------------------
function buildSettingsAccordion() {
    const accordion = document.getElementById("settingsAccordion");

    SETTINGS_SECTIONS.forEach((section, index) => {
        const rows = section.fields.map(field => `
            <div class="row">
              <div class="col-25">
                <label for="${settingsSelectId(field)}">${field.label}:</label>
              </div>
              <div class="col-75">
                <select id="${settingsSelectId(field)}" style="width: 100%;" ${field.multiple ? "multiple" : ""}>
                  ${field.multiple ? "" : '<option value=""></option>'}
                </select>
              </div>
            </div>${field.sortable ? orderRowHtml(field) : ""}`).join("");

        accordion.insertAdjacentHTML("beforeend", `
            <div class="accordion-item">
              <h2 class="accordion-header">
                <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#settings_collapse_${index}" aria-expanded="false">
                  ${section.title}
                </button>
              </h2>
              <div id="settings_collapse_${index}" class="accordion-collapse collapse">
                <div class="accordion-body">
                  <fieldset>${rows}</fieldset>
                </div>
              </div>
            </div>`);
    });
}

// Populate dropdowns and preselect stored defaults ---------------------------
document.addEventListener("DOMContentLoaded", async () => {
    buildSettingsAccordion();

    const displayOrder = await loadDisplayOrder();

    for (const field of settingsFields) {
        const select = document.getElementById(settingsSelectId(field));

        await fetchDanteAttribute(field.attribute);
        populateDanteDropdown(field.attribute, select);

        $(select).select2({ placeholder: "", allowClear: true, width: "100%" });
        $(select).next('.select2-container').find('.select2-selection__arrow').remove();

        if (field.sortable) {
            const savedOrder = displayOrder[field.key] || [];
            orderState[field.key] = savedOrder.length > 0 ? "custom" : "default";
            renderOrderList(field, savedOrder);
        }
    }

    const defaultValues = await loadDefaultValues();
    for (const field of settingsFields) {
        const select = document.getElementById(settingsSelectId(field));

        // skip stale defaults (uris which are not in the dropdown anymore)
        const availableUris = Array.from(select.options).map(option => option.value);
        const uris = (defaultValues[field.key] || []).filter(uri => availableUris.includes(uri));

        if (uris.length > 0) {
            $(select).val(field.multiple ? uris : uris[0]).trigger('change');
        }
    }
});

// Save -----------------------------------------------------------------------
document.getElementById("saveDefaultValuesButton").addEventListener("click", () => {
    const payload = {};
    for (const field of settingsFields) {
        const value = $(document.getElementById(settingsSelectId(field))).val();
        const uris = (Array.isArray(value) ? value : [value]).filter(uri => uri);
        if (uris.length > 0) {
            payload[field.key] = uris;
        }
    }

    // custom orders: only fields which were customized, all others fall back to the DANTE order
    const orderPayload = {};
    for (const field of settingsFields.filter(field => field.sortable)) {
        if (orderState[field.key] === "custom") {
            orderPayload[field.key] = serializeOrderList(field);
        }
    }

    Promise.all([
        axios.put('api/default_values', payload),
        axios.put('api/display_order', orderPayload),
    ])
        .then(responses => {
            responses.forEach(response => console.log(response.data));
            toast.success("settings saved");
        })
        .catch(error => {
            console.error('Error during PUT request to save settings:', error);
            alert("action failed");
        });
});
