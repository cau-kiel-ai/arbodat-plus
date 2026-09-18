let datingTable;

async function buildDatingTable() {
    const container = document.getElementById("table");
    const spinner = document.getElementById('tableSpinner');
    const tableContainer = document.querySelector('.table-container');
    container.innerHTML = "";
    spinner.style.display = 'block';
    tableContainer.style.display = 'none';

    // GET absolute datings --------------------------------------------------------------
    let absoluteDatings = [];
    try {
        const response = await axios.get("api/absolute_datings");
        absoluteDatings = response.data;
    } catch (error) {
        console.error("Error loading absolute datings:", error);
    }

    // GET sites --------------------------------------------------------------
    let sites = [];
    try {
        const response = await axios.get("api/sites");
        sites = response.data;
    } catch (error) {
        console.error("Error loading sites:", error)
    }

    // GET features --------------------------------------------------------------
    let features = [];
    try {
        const response = await axios.get("api/features");
        features = response.data;
    } catch (error) {
        console.error("Error loading features:", error)
    }

    // GET samples --------------------------------------------------------------
    let samples = [];
    try {
        const response = await axios.get("api/samples");
        samples = response.data;
    } catch (error) {
        console.error("Error loading samples:", error)
    }

    // GET literature -----------------------------------------------------------
    let literature = [];
    try {
        const response = await axios.get("api/literature");
        literature = response.data;
    } catch (error) {
        console.error("Error loading literature:", error)
    }

    // GET materials ------------------------------------------------------------
    await fetchDanteAttribute("material");

    function formatMaterial(materialId){
        if (!materialId) return "";
        const material = cachedMaterials.find(m => m.uri === materialId) || null;
        return material?.prefLabel.en ?? materialId;
    }

    // GET dating methods -------------------------------------------------------
    await fetchDanteAttribute("datingMethod");

    function formatDatingMethod(datingMethodId){
        if (!datingMethodId) return "";
        const datingMethod = cachedDatingMethods.find(dm => dm.uri === datingMethodId) || null;
        return datingMethod?.prefLabel.en ?? datingMethodId;
    }

    function formatDendroDat(dendroDatingItem){
        if (!dendroDatingItem) return "";
        return formatDendroDating(dendroDatingItem);
    }

    function formatC14Dat(c14DatingItem){
        if (!c14DatingItem) return "";
        return formatC14Dating(c14DatingItem);
    }

    function formatOtherDat(otherDatingItem){
        if (!otherDatingItem) return "";
        return formatOtherDating(otherDatingItem);
    }
    

    // Create Table -------------------------------------------------------------
    datingTable = new Tabulator("#table", {
        height: "100%",
        data: absoluteDatings,
        columns:[
            {formatter:"rowSelection", titleFormatter:"rowSelection", titleFormatterParams:{
                rowRange:"active" //only toggle the values of the active filtered rows
            }, hozAlign:"center", headerSort:false},
            {title:"id", field:"id", headerFilter:true, headerSort:false},
            {title:"*subsample", titleDownload:"subSample", field:"subSample", validator: ["required"], editor:"input", headerFilter:true, headerSortTristate:true},
            {title: "*sample", titleDownload:"sample", field:"sample.id", headerSortTristate:true,
                editor:"list", editorParams: function(cell) {
                    const rowData = cell.getRow().getData();
                    const featureId = rowData?.sample.feature.id;

                    return {
                        values: samples
                            .filter(item => item.feature?.id === featureId)
                            .map(item => ({
                                value: item.id,
                                label: item.label
                            }))
                    };
                },                
                headerFilter:"list", headerFilterParams: {
                    values: samples.map(item => ({
                            value: item.id,
                            label: item.label
                    })),
                    multiselect: true
                },
                headerFilterFunc: function(headerValue, rowValue) {
                    if (!headerValue || (Array.isArray(headerValue) && headerValue.length === 0)) {
                        return true;
                    }
                    return headerValue.includes(rowValue);
                },
                formatter: cell => formatSample(samples, cell.getValue()),
                accessorDownload: value => formatSample(samples, value),
            },
            {title: "*feature", titleDownload:"feature", field:"sample.feature.id", headerSortTristate:true,
                editor:"list", editorParams: function(cell) {
                    const rowData = cell.getRow().getData();
                    const siteId = rowData?.sample.feature.site.id;

                    return {
                        values: features
                            .filter(item => item.site?.id === siteId)
                            .map(item => ({
                                value: item.id,
                                label: item.label
                            }))
                    };
                },
                headerFilter:"list", headerFilterParams: {
                    values: features.map(item => ({
                            value: item.id,
                            label: item.label
                    })),
                    multiselect: true
                },
                headerFilterFunc: function(headerValue, rowValue) {
                    if (!headerValue || (Array.isArray(headerValue) && headerValue.length === 0)) {
                        return true;
                    }
                    return headerValue.includes(rowValue);
                },
                formatter: cell => formatFeature(features, cell.getValue()),
                accessorDownload: value => formatFeature(features, value),
            },
            {title: "*site", titleDownload:"site", field:"sample.feature.site.id", headerSortTristate:true,
                editor:"list", editorParams:{
                    values: sites.map(item => ({
                            value: item.id,
                            label:
                                item.label +
                                " (research projects: " +
                                item.researchProjectList.map(rp => rp.projectName).join(', ') +
                                ")"
                        }))
                    ,
                },
                headerFilter:"list", headerFilterParams: {
                    values: sites.map(item => ({
                            value: item.id,
                            label:
                                item.label +
                                " (research projects: " +
                                item.researchProjectList.map(rp => rp.projectName).join(', ') +
                                ")"
                    })),
                    multiselect: true
                },
                headerFilterFunc: function(headerValue, rowValue) {
                    if (!headerValue || (Array.isArray(headerValue) && headerValue.length === 0)) {
                        return true;
                    }
                    return headerValue.includes(rowValue);
                },
                formatter: cell => formatSite(sites, cell.getValue()),
                accessorDownload: value => formatSite(sites, value),
            },
            {title: "literature list (multiple selection)", titleDownload:"literatureList", field:"literatureList", headerSortTristate:true,
                mutator: function(value) {
                    // Map objects only to id
                    return Array.isArray(value) ? value.map(item => item.id? item.id : item) : [];
                },
                editor:"list", editorParams:{
                    values: [
                        ...literature.map(item => ({
                            value: item.id,
                            label: formatLiterature(item)
                        }))
                    ],
                    autocomplete:false,
                    multiselect:true,
                    emptyValue:[]
                },
                headerFilter:"list", headerFilterParams: {
                    values: literature.map(item => ({
                            value: item.id,
                            label: formatLiterature(item)
                    })),
                    multiselect: true
                },
                headerFilterFunc: function(headerValue, rowValue){
                    return headerValue.every(val => rowValue.includes(val));
                },
                sorter:"array", sorterParams:{
                    valueMap:"label"
                },
                formatter: cell => formatLit(literature, cell.getValue()),
                accessorDownload: value => formatLit(literature, value),
            },
            {title:"material", field:"material.id", headerSortTristate:true,
                editor:"list", editorParams:{
                    values: [
                        { value: null, label: "none" },
                        ...cachedMaterials.map(item => ({
                            value: item.uri,
                            label: item.prefLabel.en
                        }))
                    ],
                    emptyValue:null
                },
                headerFilter:true, headerFilterParams: {
                    values: cachedMaterials.map(item => ({
                            value: item.uri,
                            label: item.prefLabel.en
                        })),
                    multiselect:true
                },
                headerFilterFunc: function(headerValue, rowValue) {
                    if (!headerValue || (Array.isArray(headerValue) && headerValue.length === 0)) {
                        return true;
                    }
                    return headerValue.includes(rowValue);
                },
                formatter: cell => formatMaterial(cell.getValue()),
                accessorDownload: value => formatMaterial(value),
            },
            {title:"remarks", field:"remarks", editor:"input", headerFilter:true, headerSort:false},
            {title:"dating method", titleDownload:"datingMethod", field:"datingMethod.id", headerSortTristate:true,
                headerFilter:"list", headerFilterParams: {
                    values: cachedDatingMethods.map(item => ({
                            value: item.uri,
                            label: item.prefLabel.en
                        })),
                    multiselect:true
                },
                headerFilterFunc: function(headerValue, rowValue) {
                    if (!headerValue || (Array.isArray(headerValue) && headerValue.length === 0)) {
                        return true;
                    }
                    return headerValue.includes(rowValue);
                },
                formatter: cell => formatDatingMethod(cell.getValue()),
                accessorDownload: value => formatDatingMethod(value),
            },
            {title:"dendrochronological dating", titleDownload:"dendrochronologicalDating", field:"dendrochronologicalDating", headerSortTristate:true,
                headerFilter:true,
                headerFilterFunc: function(headerValue, rowValue) {
                    if (!headerValue) return true;
                    if (!rowValue) return false;

                    const header = headerValue.toString().toLowerCase();
                    const label = formatDendroDating(rowValue).toLowerCase();

                    return label.includes(header);
                },
                formatter: cell => {
                    const val = cell.getValue();
                    if (typeof val === "string") return val; // bereits durch accessorDownload formatiert
                    return formatDendroDat(val);
                },
                accessorDownload: value => formatDendroDat(value)
            },
            {title:"C14 dating", titleDownload:"c14Dating", field:"c14Dating", headerSortTristate:true,
                headerFilter:true,
                headerFilterFunc: function(headerValue, rowValue) {
                    if (!headerValue) return true;
                    if (!rowValue) return false;

                    const header = headerValue.toString().toLowerCase();
                    const label = formatC14Dating(rowValue).toLowerCase();

                    return label.includes(header);
                },
                formatter: cell => {
                    const val = cell.getValue();
                    if (typeof val === "string") return val;
                    return formatC14Dat(val);
                },
                accessorDownload: value => formatC14Dat(value)
            },
            {title:"other dating", titleDownload:"otherDating", field:"otherDating", headerSortTristate:true,
                headerFilter:true,
                headerFilterFunc: function(headerValue, rowValue) {
                    if (!headerValue) return true;
                    if (!rowValue) return false;

                    const header = headerValue.toString().toLowerCase();
                    const label = formatOtherDating(rowValue).toLowerCase();

                    return label.includes(header);
                },
                formatter: cell => {
                    const val = cell.getValue();
                    if (typeof val === "string") return val;
                    return formatOtherDat(val);
                },
                accessorDownload: value => formatOtherDat(value)
            },
        ],
        initialSort: [
            {column: "subSample", dir: "asc"}
        ]
    });


    // Hide spinner
    spinner.style.display = 'none';
    // Show table
    tableContainer.style.display = 'flex';

    activeTable = "datingTable";


    // PUT: update absolute datings ---------------------------------------------
    datingTable.on("cellEdited", async function(cell){

        const editedField = cell.getField();
        const newValue = cell.getValue();

        // Update all selected rows
        const selectedRows = datingTable.getSelectedRows();
        const editedRow = cell.getRow();
        if (!selectedRows.includes(editedRow)) {
            selectedRows.push(editedRow);
        }
        selectedRows.forEach(row => {
            
            // Create payload
            const absolute_dating = row.getData();
            const absoluteDatingId = absolute_dating.id;

            // Map ids back to objects
            const literatureAsObjects = (absolute_dating.literatureList || []).map(item => typeof item === "string"
                ? { id: item,
                    doi: literature.find(lit => lit.id === item).doi,
                    publicationYear: literature.find(lit => lit.id === item).publicationYear,
                    title: literature.find(lit => lit.id === item).title,
                    shortCitation: literature.find(lit => lit.id === item).shortCitation,
                    longCitation: literature.find(lit => lit.id === item).longCitation,
                    litAbstract: literature.find(lit => lit.id === item).litAbstract,
                  }
                : item);
            const datingMethodAsObjects = {
                id: absolute_dating.datingMethod.id,
                label: cachedDatingMethods.find(item => item.uri === absolute_dating.datingMethod.id)?.prefLabel.en || null,
            };

            const payload = {
                ...absolute_dating,
                sample: absolute_dating.sample ? { id: absolute_dating.sample.id } : null,
                literatureList: literatureAsObjects,
                datingMethod: datingMethodAsObjects,
            };
    
            axios.put(`api/absolute_datings/${absoluteDatingId}`, JSON.stringify(payload), {
                headers: {
                    "Content-Type": 'application/json'
                }
            })
            .then(async response => {
                console.log(response.data);
                
                // Update table
                if(row !== cell.getRow()) { // skip the edited line
                    row.update({ [editedField]: newValue });
                }
            })
            .catch(error => console.error("Error updating absolute datings:", error));
        });
    });

    // Delete rows --------------------------------------------------------------
    const deleteButton = document.getElementById("deleteRows-button");
    
    // Only show deleteButton if at least one row is selected
    datingTable.on("rowSelectionChanged", function(rows){
        deleteButton.classList.toggle("hidden", rows.length === 0);
    });

    deleteButton.addEventListener("click", function() {
        
        const selectedRows = datingTable.getSelectedRows();
        selectedRows.forEach(row => {
            // Get id
            const absoluteDatingId = row.getData().id;

            axios.delete(`api/absolute_datings/${absoluteDatingId}`)
            .then(response => {
                console.log(response.data);
                row.delete();
            })
            .catch(error => {
                console.error('Error deleting absolute datings:', error);
            });            
        });
    });
}

// Export table -----------------------------------------------------------------
document.getElementById("download-json").addEventListener("click", function(){
    if (activeTable === "datingTable") {
        const rawData = datingTable.getData("active");
        
        const transformed = rawData.map(row => {
            // Sample
            const sampleId = row.sample?.id;
            const sampleValues = datingTable.getColumn("sample.id").getDefinition().editorParams({
                getRow: () => ({
                    getData: () => row
                })
            }).values;
            const sample = sampleValues.find(s => s.value === sampleId);
            // Feature
            const featureId     = row.sample?.feature?.id;
            const featureValues = datingTable.getColumn("sample.feature.id").getDefinition().editorParams({
                getRow: () => ({
                    getData: () => row
                })
            }).values;
            const feature       = featureValues.find(f => f.value === featureId);
            // Site
            const siteId     = row.sample?.feature?.site?.id;
            const siteValues = datingTable.getColumn("sample.feature.site.id").getDefinition().editorParams.values;
            const site       = siteValues.find(s => s.value === siteId);
            // Material
            const materialId = row.material?.id ?? null;
            const material   = cachedMaterials.find(m => m.uri === materialId);
            // Dating Method
            const datingMethodId = row.datingMethod?.id ?? null;
            const formatDatingMethod = datingTable
                .getColumn("datingMethod.id")
                .getDefinition()
                .formatter;
            
            return {
                id:        row.id,
                subSample: row.subSample,
                sample:    sampleId && {
                    id:   sampleId,
                    name: sample.label
                },
                feature: featureId && {
                    id:   featureId,
                    name: feature.label
                },
                site: siteId && {
                    id:   siteId,
                    name: site.label
                },
                literatureList: (row.literatureList || []).map(literatureId => {
                    const literatureValues = datingTable.getColumn("literatureList").getDefinition().editorParams.values;
                    const literature = literatureValues.find(l => l.value === literatureId);
                    return { id: literatureId, name: literature?.label };
                }),
                material: materialId
                    ? { id: materialId, label: material?.prefLabel?.en ?? "" }
                    : null,
                remarks: row.remarks, 
                datingMethod: datingMethodId
                    ? { id: datingMethodId, name: formatDatingMethod({ getValue: () => datingMethodId }) }
                    : null,
                dendrochronologicalDating: row.dendrochronologicalDating,
                c14Dating: row.c14Dating,
                otherDating: row.otherDating,
            };
        });

        const blob = new Blob([JSON.stringify(transformed, null, 4)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "ArboDat+_Download_Datings.json";
        a.click();
        // Revoke later: WebKit (macOS app window) cancels downloads whose blob URL is already revoked.
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
});

document.getElementById("download-csv").addEventListener("click", function(){
    if (activeTable === "datingTable") {
        datingTable.download(
            "csv",
            "ArboDat+_Download_Datings.csv"
        );
    }    
});    

document.getElementById("download-xlsx").addEventListener("click", function(){
    if (activeTable === "datingTable") {
        datingTable.download(
            "xlsx",
            "ArboDat+_Download_Datings.xlsx",
            {sheetName:"ArboDat+ Datings"}
        );
    }
});

document.getElementById("download-html").addEventListener("click", function(){
    if (activeTable === "datingTable") {
        datingTable.download(
            "html",
            "ArboDat+_Download_Datings.html"
        );
    }
});
