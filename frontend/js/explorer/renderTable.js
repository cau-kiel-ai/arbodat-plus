document.addEventListener("DOMContentLoaded", async function () {
    const table = getTableFromURL()
    if (table) {
        applyTable(table);
    }

    // Get and update dante attributes
    await updateBackendDanteAttributes();
});

const tableSelector = document.getElementById("tableSelector");

tableSelector.addEventListener("change", (e) => {
    const table = e.target.value;
    setTableInURL(table);
    renderTable(table);
});

// Support Back/Forward
window.addEventListener("popstate", () => {
    const table = getTableFromURL();
    applyTable(table);
});

function getTableFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get("table");
}

function setTableInURL(table) {
    // Change URL without reload
    const url = new URL(window.location);
    url.searchParams.set("table", table);
    window.history.pushState({}, "", url);
}

function applyTable(table) {
    tableSelector.value = table;
    renderTable(table);
}


let activeTable = null;

function renderTable(table) {

    const container = document.getElementById("table");

    // Reset
    container.innerHTML = "";
    document.getElementById("deleteRows-button").classList.add("hidden");

    switch (table) {
        case "researchProject":
            buildResearchProjectTable();
            break;

        case "institution":
            buildInstitutionTable();
            break;
        
        case "user":
            buildUserTable();
            break;

        case "author":
            buildAuthorTable();
            break;
        
        case "literature":
            buildLiteratureTable();
            break;

        case "site":
            buildSiteTable();
            break;

        case "feature":
            buildFeatureTable();
            break;
        
        case "sample":
            buildSampleTable();
            break;

        case "dating":
            buildDatingTable();
            break;

        case "result":
            buildResultTable();
            break;
    
        default:
            break;
    }
}
