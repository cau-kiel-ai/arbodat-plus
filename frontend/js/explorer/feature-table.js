let featureTable;

async function buildFeatureTable() {
    const container = document.getElementById("table");
    const spinner = document.getElementById('tableSpinner');
    const tableContainer = document.querySelector('.table-container');
    container.innerHTML = "";
    spinner.style.display = 'block';
    tableContainer.style.display = 'none';

    // GET features -------------------------------------------------------------
    let features = [];
    try {
        const response = await axios.get("api/features");
        features = response.data;
    } catch (error) {
        console.error("Error loading features:", error);
    }

    // GET sites ----------------------------------------------------------------
    let sites = [];
    try {
        const response = await axios.get("api/sites");
        sites = response.data;
    } catch (error) {
        console.error("Error loading sites:", error)
    }

    // Create year list for excavation yerars -----------------------------------
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let year = currentYear; year >= 0; year--) {
    years.push(year);
    }

    function formatPreservationCondition(preservationConditionId){
        if (!preservationConditionId) return "";
        const preservationCondition = cachedPreservationConditions.find(pc => pc.uri === preservationConditionId) || null;
        return preservationCondition?.prefLabel.en ?? preservationConditionId;
    }

    function formatFeatureType(featureTypeId){
        if (!featureTypeId) return "";
        const featureType = cachedFeatureTypes.find(ft => ft.uri === featureTypeId) || null;
        return featureType?.prefLabel.en ?? featureTypeId;
    }

    // Create Table -------------------------------------------------------------
    featureTable = new Tabulator("#table", {
        height: "100%",
        data: features,
        columns:[
            {cssClass:"selectionColumn", formatter:"rowSelection", titleFormatter:"rowSelection", titleFormatterParams:{
                rowRange:"active" //only toggle the values of the active filtered rows
            }, hozAlign:"center", headerSort:false},
            {title:"id", field:"id", headerFilter:true, headerSort:false},
            {title:"*label", titleDownload:"label", field:"label", validator: ["required"], editor:"input", headerFilter:true, headerSortTristate:true},
            {title: "*site", titleDownload:"site", field:"site.id", headerSortTristate:true,
                editor:"list", editorParams:{
                    values: [
                        ...sites.map(item => ({
                            value: item.id,
                            label:
                                item.label +
                                " (" +
                                item.researchProjectList.map(rp => rp.projectName).join(',') +
                                ")"
                        }))
                    ],
                    emptyValue:null
                },
                headerFilter:"list", headerFilterParams: {
                    values: sites.map(item => ({
                            value: item.id,
                            label:
                                item.label +
                                " (" +
                                item.researchProjectList.map(rp => rp.projectName).join(',') +
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
            {title:"excavation area", titleDownload:"excavationArea", field:"excavationArea", editor:"input", headerFilter:true, headerSortTristate:true},
            {title:"feature condition", titleDownload:"featureCondition", field:"featureCondition", hozAlign:"center", headerSortTristate:true,
                headerFilter: function(cell, onRendered, success, cancel){
                    let state = "all";
                    const box = document.createElement("input");
                    box.type = "checkbox";
                    box.indeterminate = true;

                    box.addEventListener("click", function(e){
                        if (state === "all") {
                            box.indeterminate = false;
                            box.checked = true;
                            state = "true";
                        } else if (state === "true") {
                            box.indeterminate = false;
                            box.checked = false;
                            state = "false";
                        } else {  // state === "false"
                            box.indeterminate = true;
                            box.checked = false;
                            state = "all";
                        }
                        success(state);
                    });

                    return box;
                },
                headerFilterFunc: function(headerValue, rowValue){
                    if (headerValue === "all") return true;
                    if (headerValue === "true") return rowValue === true;
                    if (headerValue === "false") return rowValue === false;
                },
                formatter: function(cell){
                    var value = cell.getValue();
                    return `<input type="checkbox" ${value ? "checked" : ""}>`;
                },
                cellClick: function(e, cell){
                    let checkbox = e.target;
                    if (checkbox.tagName === "INPUT") {
                        let newValue = checkbox.checked;
                        cell.setValue(newValue);
                    }
                }
            },
            {title:"preservation condition", titleDownload:"preservationCondition", field:"preservationCondition.id", headerSortTristate:true,
                editor:"list", editorParams:{
                    values: [
                        { value: null, label: "none" },
                        ...cachedPreservationConditions.map(item => ({
                            value: item.uri,
                            label: item.prefLabel.en
                        }))
                    ],
                    emptyValue:null             
                },
                headerFilter:true, headerFilterParams: {
                    values: cachedPreservationConditions.map(item => ({
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
                formatter: cell => formatPreservationCondition(cell.getValue()),
                accessorDownload: value => formatPreservationCondition(value),
            },
            {title:"feature type", titleDownload:"featureType", field:"featureType.id", headerSortTristate:true,
                editor:"list", editorParams:{
                    values: [
                        { value: null, label: "none" },
                        ...cachedFeatureTypes.map(item => ({
                            value: item.uri,
                            label: item.prefLabel.en
                        }))
                    ],
                    emptyValue:null             
                },
                headerFilter:true, headerFilterParams: {
                    values: cachedFeatureTypes.map(item => ({
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
                formatter: cell => formatFeatureType(cell.getValue()),
                accessorDownload: value => formatFeatureType(value),
            },
            {title: "excavationYears", field:"excavationYears", headerSortTristate:true,
                editor:"list", editorParams:{
                    values: years,
                    autocomplete:false,
                    multiselect:true,
                    emptyValue:[]
                },
                headerFilter:"list", headerFilterParams: {
                    values: years,
                    multiselect: true
                },
                headerFilterFunc: function(headerValue, rowValue){
                    return headerValue.every(val => rowValue.includes(val));
                },
                sorter:"array", sorterParams:{
                    valueMap:"label"
                },
            },
            {title:"building context", titleDownload:"buildingContext", field:"buildingContext", hozAlign:"center", headerSortTristate:true,
                headerFilter: function(cell, onRendered, success, cancel){
                    let state = "all";
                    const box = document.createElement("input");
                    box.type = "checkbox";
                    box.indeterminate = true;

                    box.addEventListener("click", function(e){
                        if (state === "all") {
                            box.indeterminate = false;
                            box.checked = true;
                            state = "true";
                        } else if (state === "true") {
                            box.indeterminate = false;
                            box.checked = false;
                            state = "false";
                        } else {  // state === "false"
                            box.indeterminate = true;
                            box.checked = false;
                            state = "all";
                        }
                        success(state);
                    });

                    return box;
                },
                headerFilterFunc: function(headerValue, rowValue){
                    if (headerValue === "all") return true;
                    if (headerValue === "true") return rowValue === true;
                    if (headerValue === "false") return rowValue === false;
                },
                formatter: function(cell){
                    var value = cell.getValue();
                    return `<input type="checkbox" ${value ? "checked" : ""}>`;
                },
                cellClick: function(e, cell){
                    let checkbox = e.target;
                    if (checkbox.tagName === "INPUT") {
                        let newValue = checkbox.checked;
                        cell.setValue(newValue);
                    }
                }
            },
            {title:"building context description", titleDownload:"buildingContextDescription", field:"buildingContextDescription", editor:"input", headerFilter:true, headerSort:false,
                editable: cell => cell.getRow().getData().buildingContext === true,
            },
            {title:"remarks", field:"remarksFeature", editor:"input", headerFilter:true, headerSort:false},
        ],
        initialSort: [
            {column: "label", dir: "asc"}
        ]
    });


    // Hide spinner
    spinner.style.display = 'none';
    // Show table
    tableContainer.style.display = 'flex';

    activeTable = "featureTable";


    // PUT: update features -----------------------------------------------------
    featureTable.on("cellEdited", async function(cell){

        const editedField = cell.getField();
        const newValue = cell.getValue();

        const selectedRows = await getRowsToUpdate(featureTable, cell, "feature", "features",
            // Description only applies to features in a building context
            row => !(editedField === "buildingContextDescription" && row.getData().buildingContext !== true));
        if (!selectedRows) return;
        selectedRows.forEach(row => {

            // Create payload
            const feature = JSON.parse(JSON.stringify(row.getData()));
            setNestedValue(feature, editedField, newValue); // other selected rows do not contain the new value yet
            const featureId = feature.id;

            const payload = {
                ...feature,
                site: feature.site ? { id: feature.site.id } : null,
            };
    
            axios.put(`api/features/${featureId}`, JSON.stringify(payload), {
                headers: {
                    "Content-Type": 'application/json'
                }
            })
            .then(async response => {
                console.log(response.data);
                
                // Update table
                if(row !== cell.getRow()) { // skip the edited line
                    updateRowField(row, editedField, newValue);
                }
                // Backend clears the description if building context is unchecked
                if (editedField === "buildingContext" && !newValue) {
                    row.update({ buildingContextDescription: null });
                }
            })
            .catch(error => handleUpdateError(cell, row, "feature", error));
        });
    });

    // Delete rows --------------------------------------------------------------
    const deleteButton = document.getElementById("deleteRows-button");
    
    // Only show deleteButton if at least one row is selected
    featureTable.on("rowSelectionChanged", function(rows){
        deleteButton.classList.toggle("hidden", rows.length === 0);
    });

    // onclick (not addEventListener): the button is shared by all tables
    deleteButton.onclick = async function() {
        const selectedRows = featureTable.getSelectedRows();
        if (!await confirmDelete("feature", selectedRows.length)) return;

        selectedRows.forEach(row => {
            // Get id
            const featureId = row.getData().id;

            axios.delete(`api/features/${featureId}`)
            .then(async response => {
                console.log(response.data);
                await row.delete();
                // Deleting a row does not fire rowSelectionChanged
                deleteButton.classList.toggle("hidden", featureTable.getSelectedRows().length === 0);
            })
            .catch(error => {
                handleDeleteError("feature", error);
            });            
        });
    };
}

// Export table -----------------------------------------------------------------
document.getElementById("download-json").addEventListener("click", function(){
    if (activeTable === "featureTable") {
        const rawData = featureTable.getData("active");
    
        const transformed = rawData.map(row => {
            // Site
            const siteId     = row.site.id;
            const siteValues = featureTable.getColumn("site.id").getDefinition().editorParams.values;
            const site       = siteValues.find(s => s.value === siteId);
            // Preservation condition
            const preservationConditionId = row.preservationCondition?.id ?? null;
            const preservationCondition   = cachedPreservationConditions.find(pc => pc.uri === preservationConditionId);
            // Feature type
            const featureTypeId = row.featureType?.id ?? null;
            const featureType = cachedFeatureTypes.find(ft => ft.uri === featureTypeId) || null;
            
            return {
                id: row.id,
                label: row.label,
                site: {
                    id:   siteId,
                    name: site.label
                },
                preservationCondition: preservationConditionId
                    ? { id: preservationConditionId, label: preservationCondition?.prefLabel?.en ?? "" }
                    : null,
                featureType: featureTypeId
                    ? { id: featureTypeId, label: featureType?.prefLabel?.en ?? "" }
                    : null,
                excavationYears: row.excavationYears,
                buildingContext: row.buildingContext,
                buildingContextDescription: row.buildingContextDescription,
                remarks: row.remarksFeature,
            };
        });

        const blob = new Blob([JSON.stringify(transformed, null, 4)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "ArboDat+_Download_Features.json";
        a.click();
        // Revoke later: WebKit (macOS app window) cancels downloads whose blob URL is already revoked.
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
});

document.getElementById("download-csv").addEventListener("click", function(){
    if (activeTable === "featureTable") {
        featureTable.download(
            "csv",
            "ArboDat+_Download_Features.csv"
        );
    }    
});    

document.getElementById("download-xlsx").addEventListener("click", function(){
    if (activeTable === "featureTable") {
        featureTable.download(
            "xlsx",
            "ArboDat+_Download_Features.xlsx",
            {sheetName:"ArboDat+ Features"}
        );
    }
});

document.getElementById("download-html").addEventListener("click", function(){
    if (activeTable === "featureTable") {
        featureTable.download(
            "html",
            "ArboDat+_Download_Features.html"
        );
    }
});
