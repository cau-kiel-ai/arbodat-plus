// Ascending, natural sort of entity lists for dropdowns ---------------------------
/*
Natural order ("1, 2, 10, 12a" instead of "1, 10, 12a, 2"), case-insensitive.
Every sort* helper returns a new array; later keys only break ties of earlier keys.
sortInstitutions / sortLiterature call formatService.js lazily (only on pages that load it).
*/
const labelCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function compareLabels(a, b) {
    return labelCollator.compare(a == null ? '' : String(a), b == null ? '' : String(b));
}

function sortByKeys(list, keysOf) {
    return [...(list || [])].sort((a, b) => {
        const keysA = keysOf(a);
        const keysB = keysOf(b);
        for (let i = 0; i < keysA.length; i++) {
            const result = compareLabels(keysA[i], keysB[i]);
            if (result !== 0) return result;
        }
        return 0;
    });
}

function sortResearchProjects(list) {
    return sortByKeys(list, rp => [rp.projectName]);
}

// Also sorts the research projects of each site (they come from a HashSet)
function sortSites(list) {
    (list || []).forEach(site => {
        if (Array.isArray(site.researchProjectList)) {
            site.researchProjectList = sortResearchProjects(site.researchProjectList);
        }
    });
    return sortByKeys(list, site => [
        site.label,
        (site.researchProjectList || []).map(rp => rp.projectName).join(', '),
    ]);
}

function sortFeatures(list) {
    return sortByKeys(list, feature => [feature.label, feature.site?.label]);
}

function sortSamples(list) {
    return sortByKeys(list, sample => [sample.label, sample.feature?.label]);
}

function sortDatings(list) {
    return sortByKeys(list, dating => [dating.subSample, dating.sample?.label]);
}

// Users and authors ("Last, First M."; only a first name is shown and sorted as is)
function sortPeople(list) {
    return sortByKeys(list, person => [person.lastName || person.firstName, person.firstName, person.middleName]);
}

function sortInstitutions(list) {
    return sortByKeys(list, institution => [formatInstitution(institution)]);
}

// By displayed citation
function sortLiterature(list) {
    return sortByKeys(list, literature => [formatLiterature(literature)]);
}

function sortLiteratureByTitle(list) {
    return sortByKeys(list, literature => [literature.title]);
}

// Tabulator sorter for id columns: rows follow the order of the (sorted) lookup list, unknown ids last
function rankSorter(sortedList, idOf = item => item.id) {
    const rank = new Map((sortedList || []).map((item, index) => [idOf(item), index]));
    const rankOf = id => (rank.has(id) ? rank.get(id) : Infinity);
    return (a, b) => {
        const rankA = rankOf(a);
        const rankB = rankOf(b);
        return rankA === rankB ? 0 : rankA < rankB ? -1 : 1;
    };
}

// Tabulator sorter for array columns: compares the formatted text
function formattedSorter(format) {
    return (a, b) => compareLabels(format(a), format(b));
}
