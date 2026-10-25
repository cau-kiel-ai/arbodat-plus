function formatSite(sites, siteId) {
    if (!siteId) return "";
    const site = sites.find(s => s.id === siteId) || null;
    return site?.label ?? siteId
}

function formatFeature(features, featureId) {
    if (!featureId) return "";
    const feature = features.find(f => f.id === featureId) || null;
    return feature?.label ?? featureId
}

function formatSample(samples, sampleId) {
    if (!sampleId) return "";
    const sample = samples.find(s => s.id === sampleId) || null;
    return sample?.label ?? sampleId
}

function formatInst(institutions, institutionList) {
    if (!institutionList) return "";

    // HTML download
    if (!Array.isArray(institutionList)) return institutionList;

    return institutionList
        .map(id => {
            const institution = institutions.find(institution => institution.id === id)
            return institution?.label ?? id ?? "";
        })
        .filter(Boolean)
        .join(", ");
}

function formatLit(literature, literatureList) {
    if (!literatureList) return "";

    // HTML download
    if (!Array.isArray(literatureList)) return literatureList;

    return literatureList
        .map(id => {
            const lit = literature.find(lit => lit.id === id)
            return formatLiterature(lit) ?? id ?? "";
        })
        .filter(Boolean)
        .join(", ");
}

function formatUser(users, userList) {
    if (!userList) return "";

    // HTML download
    if (!Array.isArray(userList)) return userList;

    return userList
        .map(id => {
            const user = users.find(user => user.id === id)
            return formatName(user) ?? id ?? "";
        })
        .filter(Boolean)
        .join(", ");
}

function formatCoordinateSystem(coordinateSystemId) {
    if (!coordinateSystemId) return "";
    const coordinateSystem = cachedCoordinateSystems.find(cs => cs.uri === coordinateSystemId) || null;
    return [coordinateSystem?.prefLabel.en, coordinateSystem?.notation]
        .filter(Boolean)
        .join(" - ")
        || coordinateSystemId;
}
