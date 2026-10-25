let researchProjectTable;

async function buildResearchProjectTable() {
    const container = document.getElementById("table");
    const spinner = document.getElementById('tableSpinner');
    const tableContainer = document.querySelector('.table-container');
    container.innerHTML = "";
    spinner.style.display = 'block';
    tableContainer.style.display = 'none';

    // GET research projects ----------------------------------------------------
    let researchProjects = [];
    try {
        const response = await axios.get("api/research_projects");
        researchProjects = response.data;
    } catch (error) {
        console.error("Error loading research projects:", error);
    }

    // GET sites ----------------------------------------------------------------
    let sites = [];
    try {
        const response = await axios.get("api/sites");
        sites = response.data;
    } catch (error) {
        console.error("Error loading sites:", error)
    }

    function formatSites(sites, siteList) {
        if (!siteList) return "";

        // HTML download
        if (!Array.isArray(siteList)) return siteList;

        return siteList
            .map(id => {
                const site = sites.find(site => site.id === id)
                return site?.label ?? id ?? "";
            })
            .filter(Boolean)
            .join(", ");
    }

    function formatLicense(licenseId){
        if (!licenseId) return "";
        const license = cachedLicenses.find(license => license.uri === licenseId) || null;
        return license?.prefLabel.en ?? licenseId;
    }

    // Create Table -------------------------------------------------------------
    researchProjectTable = new Tabulator("#table", {
        height:"100%",
        data: researchProjects,
        columns:[
            {formatter:"rowSelection", titleFormatter:"rowSelection", titleFormatterParams:{
                rowRange:"active" //only toggle the values of the active filtered rows
            }, hozAlign:"center", headerSort:false},
            {title:"id", field:"id", headerFilter:true, headerSort:false},
            {title:"*project name", field:"projectName", titleDownload:"projectName", validator: ["required"], editor:"input", headerFilter:true, headerSortTristate:true},
            {title:"funder", field:"funder", editor:"input", headerFilter:true, headerSortTristate:true},
            {title:"authorisation number", field:"authorisationNumber", titleDownload:"authorisationNumber", editor:"input", headerFilter:true, headerSortTristate:true},
            {title:"license", titleDownload:"license", field:"license.id", headerSort:false,
                editor:"list", editorParams:{
                    values: [
                        { value: null, label: "none" },
                        ...cachedLicenses.map(license => ({
                            value: license.uri,
                            label: license.prefLabel.en
                        }))
                    ],
                    emptyValue:null             
                },
                headerFilter:true, headerFilterParams: {
                    values: cachedLicenses.map(license => ({
                        value: license.uri,
                        label: license.prefLabel.en
                    })),
                    multiselect:true
                },
                headerFilterFunc: function(headerValue, rowValue) {
                    if (!headerValue || (Array.isArray(headerValue) && headerValue.length === 0)) {
                        return true;
                    }
                    return headerValue.includes(rowValue);
                },
                formatter: cell => formatLicense(cell.getValue()),
                accessorDownload: value => formatLicense(value),
            },
            {title:"export file name", field:"exportFileName", titleDownload:"exportFileName", editor:"input", headerFilter:true, headerSortTristate:true},
            {title:"site list (multiple selection)", titleDownload:"siteList", field: "siteList", headerSortTristate:true,
                mutator: function(value) {
                    // Map site objects only to site id
                    return Array.isArray(value) ? value.map(site => site.id? site.id : site) : [];
                },
                editor:"list", editorParams:{
                    values: sites.map(item => ({                        
                        value: item.id,
                        label: item.label + " ("+ item.researchProjectList.map(rp => rp.projectName) + ")"
                    })),
                    autocomplete:false,
                    multiselect:true,
                    emptyValue:[]
                },
                headerFilter:"list", headerFilterParams: {
                    values: sites.map(item => ({
                        value: item.id,
                        label: item.label + " ("+ item.researchProjectList.map(rp => rp.projectName) + ")"
                    })),
                    multiselect: true
                },
                headerFilterFunc: function(headerValue, rowValue){
                    return headerValue.every(val => rowValue.includes(val));
                },
                sorter:"array", sorterParams:{
                    valueMap:"label"
                },
                formatter: cell => formatSites(sites, cell.getValue()),
                accessorDownload: value => formatSites(sites, value),
            }
        ],
        initialSort: [
            {column: "projectName", dir: "asc"}
        ]
    });


    // Hide spinner
    spinner.style.display = 'none';
    // Show table
    tableContainer.style.display = 'flex';

    activeTable = "researchProjectTable";


    // PUT: update research project ---------------------------------------------
    researchProjectTable.on("cellEdited", async function(cell){

        const editedField = cell.getField();
        const newValue = cell.getValue();

        // Update all selected rows ---------------------------
        const selectedRows = researchProjectTable.getSelectedRows();
        const editedRow = cell.getRow();
        if (!selectedRows.includes(editedRow)) {
            selectedRows.push(editedRow);
        }
        selectedRows.forEach(row => {
            
            // Create payload
            const researchProject = row.getData();
            const researchProjectId = researchProject.id;
            // Map site ids back to site objects
            const siteListAsObjects = (researchProject.siteList || []).map(site => typeof site === "string" ? { id: site } : site);
            const payload = {
                ...researchProject,
                siteList: siteListAsObjects
            };
    
            axios.put(`api/research_projects/${researchProjectId}`, JSON.stringify(payload), {
                headers: {
                    "Content-Type": 'application/json'
                }
            })
            .then(async response => {
                console.log(response.data);
                
                // Update table ---------------------------------------
                if(row !== cell.getRow()) { // skip the edited line
                    if (editedField === "license.id") {
                        const licenseObject = cachedLicenses.find(item => item.uri === newValue);
                        if (licenseObject) {
                            row.update({ license: { id: licenseObject.uri, label: licenseObject.prefLabel.en } });
                        }
                    } else {
                        row.update({ [editedField]: newValue });
                    }
                } // --------------------------------------------------
            })
            .catch(error => console.error("Error updating research project:", error));
        });
        
        // update site list headerFilterParams ----------------
        // GET sites
        try {
            const response = await axios.get("api/sites");
            sites = response.data;
        } catch (error) {
            console.error("Error loading sites:", error)
        }

        // Generate new headerFilterParams values
        const updatedSiteValues = sites.map(item => ({
            value: item.id,
            label: `${item.label} (${item.researchProjectList.map(rp => rp.projectName).join(", ")})`
        }));

        // Get column
        const siteListColumn = researchProjectTable.getColumn("siteList");

        // Set new editorParams and headerFilterParams values
        siteListColumn.updateDefinition({
            editorParams: {
                values: updatedSiteValues,
                autocomplete: false,
                multiselect: true,
                emptyValue: []
            },
            headerFilterParams: {
                values: updatedSiteValues
            }
        });
    });


    // Delete rows --------------------------------------------------------------
    const deleteButton = document.getElementById("deleteRows-button");
    
    // Only show deleteButton if at least one row is selected
    researchProjectTable.on("rowSelectionChanged", function(rows){
        deleteButton.classList.toggle("hidden", rows.length === 0);
    });

    deleteButton.addEventListener("click", function() {
        
        const selectedRows = researchProjectTable.getSelectedRows();
        selectedRows.forEach(row => {
            // Get id
            const researchProjectId = row.getData().id;

            axios.delete(`api/research_projects/${researchProjectId}`)
            .then(response => {
                console.log(response.data);
                row.delete();
            })
            .catch(error => {
                console.error('Error deleting research project:', error);
            });            
        });
    });

}

// Export table -----------------------------------------------------------------
document.getElementById("download-json").addEventListener("click", function(){
    if (activeTable === "researchProjectTable") {
        const rawData = researchProjectTable.getData("active");
        
        const transformed = rawData.map(row => {
            const licenseId = row.license?.id ?? null;
            const license   = cachedLicenses.find(l => l.uri === licenseId);
            
            return {
                id: row.id,
                projectName: row.projectName,
                funder: row.funder,
                authorisationNumber: row.authorisationNumber,
                license: licenseId
                    ? { id: licenseId, label: license?.prefLabel.en ?? "" }
                    : null,
                exportFileName: row.exportFileName,
                siteList: (row.siteList || []).map(siteId => {
                    const siteValues = researchProjectTable.getColumn("siteList").getDefinition().editorParams.values;
                    const site = siteValues.find(s => s.value === siteId);
                    const cleanLabel = site?.label.replace(/\s*\(.*\)$/, "") ?? ""; // Regex to clip " (project names)"
                    return { id: siteId, label: cleanLabel };
                }),
            };
        });

        const blob = new Blob([JSON.stringify(transformed, null, 4)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "ArboDat+_Download_ResearchProjects.json";
        a.click();
        // Revoke later: WebKit (macOS app window) cancels downloads whose blob URL is already revoked.
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
});

document.getElementById("download-csv").addEventListener("click", function(){
    if (activeTable === "researchProjectTable") {
        researchProjectTable.download(
            "csv",
            "ArboDat+_Download_ResearchProjects.csv"
        );        
    }
});

document.getElementById("download-xlsx").addEventListener("click", function(){
    if (activeTable === "researchProjectTable") {
        researchProjectTable.download(
            "xlsx",
            "ArboDat+_Download_ResearchProjects.xlsx",
            {sheetName:"ArboDat+ Research Projects"}
        );
    }
});

document.getElementById("download-html").addEventListener("click", function(){
    if (activeTable === "researchProjectTable") {
        researchProjectTable.download(
            "html",
            "ArboDat+_Download_ResearchProjects.html"
        );
    }
});
