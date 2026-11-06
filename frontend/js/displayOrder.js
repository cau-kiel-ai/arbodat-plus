// Custom order of the options of hierarchical dropdowns.
// The order is edited on settings.html and stored in the backend (api/display_order) as one flat list of
// uris per field in tree order (a parent followed by its children): {key: [uri, ...]}.
// A uri which is not in the list (e.g. new in DANTE) is sorted behind its siblings in the default order.

// attributes with a custom order (key = attribute name of fetchDanteAttribute.js)
//   narrower: two levels, parents carry their children in 'narrower'
//   ancestors: flat list, every entry carries its parents in 'ancestors' (nearest parent first)
const DISPLAY_ORDER_ATTRIBUTES = {
    featureType:          "narrower",
    datingMethod:         "narrower",
    stateOfPreservation:  "narrower",
    classificationConfer: "narrower",
    restType:             "ancestors",
};

// Load the custom orders once ({key: [uri, ...]});
// dropdowns keep the default order if the request fails
let displayOrderPromise = null;
let displayOrderLoadFailed = false; // the Settings page must not save then: the stored orders would be deleted
function loadDisplayOrder() {
    if (!displayOrderPromise) {
        displayOrderPromise = axios.get('api/display_order')
            .then(response => response.data || {})
            .catch(error => {
                console.error('Error during GET request to load display order:', error);
                displayOrderLoadFailed = true;
                return {};
            });
    }
    return displayOrderPromise;
}

// Default position of every uri (parent before its children, in the order delivered by DANTE).
// Recorded when an attribute is sorted for the first time, so that the default order can be restored later.
const defaultPositions = {};

function pathOf(item) {
    const ancestors = item.ancestors ? [...item.ancestors].reverse() : []; // root first
    return [...ancestors.map(ancestor => ancestor.uri), item.uri];
}

function recordDefaultPositions(attribute, data) {
    if (defaultPositions[attribute]) return;

    const positions = new Map();
    const record = uri => { if (!positions.has(uri)) positions.set(uri, positions.size); };

    for (const item of data) {
        if (DISPLAY_ORDER_ATTRIBUTES[attribute] === "ancestors") {
            pathOf(item).forEach(record);
        } else {
            record(item.uri);
            (item.narrower || []).forEach(narrower => narrower && record(narrower.uri));
        }
    }
    defaultPositions[attribute] = positions;
}

// Sort the cached vocabulary in place; order = list of uris (empty/undefined -> default order)
function sortDisplayData(attribute, data, order = []) {
    recordDefaultPositions(attribute, data);

    const ranks = new Map(order.map((uri, index) => [uri, index]));
    const positions = defaultPositions[attribute];

    // [custom rank (unknown uris last), default position]
    const keyOf = uri => [ranks.has(uri) ? ranks.get(uri) : Infinity, positions.get(uri)];
    const compareUris = (a, b) => {
        const [rankA, positionA] = keyOf(a);
        const [rankB, positionB] = keyOf(b);
        return rankA === rankB ? positionA - positionB : (rankA < rankB ? -1 : 1);
    };

    if (DISPLAY_ORDER_ATTRIBUTES[attribute] === "ancestors") {
        // compare the paths root -> entry element by element, a parent comes before its children
        const paths = new Map(data.map(item => [item, pathOf(item)]));
        data.sort((a, b) => {
            const pathA = paths.get(a);
            const pathB = paths.get(b);
            for (let i = 0; i < Math.min(pathA.length, pathB.length); i++) {
                if (pathA[i] !== pathB[i]) return compareUris(pathA[i], pathB[i]);
            }
            return pathA.length - pathB.length;
        });
    } else {
        data.sort((a, b) => compareUris(a.uri, b.uri));
        for (const item of data) {
            if (item.narrower && item.narrower.length > 1) {
                item.narrower.sort((a, b) => a && b ? compareUris(a.uri, b.uri) : 0);
            }
        }
    }
}

// Sort a freshly fetched vocabulary by the stored custom order (no-op for other attributes)
function applyDisplayOrder(attribute, data, displayOrder) {
    if (!(attribute in DISPLAY_ORDER_ATTRIBUTES)) return;
    sortDisplayData(attribute, data, displayOrder[attribute]);
}

// Tree of the vocabulary in its current order: [{uri, label, guide, children: [...]}]
function buildDisplayTree(attribute, data) {
    const isGuide = entry => (entry.type || []).includes("http://vocab.getty.edu/ontology#GuideTerm");
    const labelOf = entry => entry.prefLabel?.en ?? Object.values(entry.prefLabel ?? {})[0] ?? entry.uri;
    // groups of 'ancestors' attributes are labelled like in populateDanteDropdown
    const ancestorLabelOf = entry => entry.prefLabel?.de ?? entry.prefLabel?.en ?? "";

    const roots = [];

    if (DISPLAY_ORDER_ATTRIBUTES[attribute] === "narrower") {
        for (const item of data) {
            roots.push({
                uri: item.uri, label: labelOf(item), guide: isGuide(item),
                children: (item.narrower || []).filter(Boolean).map(narrower => ({
                    uri: narrower.uri, label: labelOf(narrower), guide: isGuide(narrower), children: [],
                })),
            });
        }
        return roots;
    }

    const nodes = new Map();
    const ensureNode = (entry, parentNode, label = labelOf(entry)) => {
        if (!nodes.has(entry.uri)) {
            const node = { uri: entry.uri, label, guide: isGuide(entry), children: [] };
            nodes.set(entry.uri, node);
            (parentNode ? parentNode.children : roots).push(node);
        }
        return nodes.get(entry.uri);
    };

    for (const item of data) {
        let parentNode = null;
        for (const ancestor of [...(item.ancestors || [])].reverse()) {
            parentNode = ensureNode(ancestor, parentNode, ancestorLabelOf(ancestor));
        }
        ensureNode(item, parentNode);
    }
    return roots;
}
