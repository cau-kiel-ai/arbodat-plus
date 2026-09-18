let resultTable;

async function buildResultTable() {
    const container = document.getElementById("table");
    const spinner = document.getElementById('tableSpinner');
    const tableContainer = document.querySelector('.table-container');
    container.innerHTML = "";
    spinner.style.display = 'block';
    tableContainer.style.display = 'none';

    // GET results --------------------------------------------------------------
    let results = [];

    const size = 1000;
    let page = 0;
    let last = false;
    while (!last) {
        try {
            const response = await axios.get("api/results", {
                params: { page, size }
            });

            results.push(...response.data.content);
            last = response.data.last;
            page++;
        } catch (error) {
            console.error("Error loading results:", error);
        }
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

    // GET absolute datings -----------------------------------------------------
    let datings = [];
    try {
        const response = await axios.get("api/absolute_datings");
        datings = response.data;
    } catch (error) {
        console.error("Error loading absolute datings:", error)
    }

    // Fetch taxCodes -----------------------------------------------------------
    const ArboDat_PCODE_URI = "http://uri.gbv.de/terminology/arbodat_taxonomy/6ac2cb7f-fed7-445d-bd8c-4c8cadec2303";
    await fetchDanteTaxCodes(ArboDat_PCODE_URI);

    function formatClassificationConfer(classificationConferId){
        if (!classificationConferId) return "";
        const classificationConfer = cachedClassificationConfers.find(cf => cf.uri === classificationConferId) || null;
        return classificationConfer?.prefLabel.en ?? classificationConferId;
    }

    // GET rest type ------------------------------------------------------------
    let restTypes = [];
    try {
        const response = await axios.get("api/dante_attributes/rest_type");
        restTypes = response.data;
    } catch (error) {
        console.error("Error loading rest types:", error)
    }

    function formatRestType(restTypeId){
        if (!restTypeId) return "";
        const restType = restTypes.find(rt => rt.id === restTypeId) || null;
        return restType?.label ?? restTypeId;
    }

    function formatStateOfPreservation(stateOfPreservationId){
        if (!stateOfPreservationId) return "";
        const stateOfPreservation = cachedStateOfPreservation.find(sop => sop.uri === stateOfPreservationId) || null;
        return stateOfPreservation?.prefLabel.en ?? stateOfPreservationId;
    }

    // Create Table -------------------------------------------------------------
    resultTable = new Tabulator("#table", {
        height: "100%",
        data: results,
        columns:[
            {formatter:"rowSelection", titleFormatter:"rowSelection", titleFormatterParams:{
                rowRange:"active" //only toggle the values of the active filtered rows
            }, hozAlign:"center", headerSort:false},
            {title:"id", field:"id", headerFilter:true, headerSort:false},
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
            {title: "dating list (multiple selection)", titleDownload:"absoluteDatingList", field:"absoluteDatingList", headerSortTristate:true,
                mutator: function(value) {
                    // Map objects only to id
                    return Array.isArray(value) ? value.map(item => item.id? item.id : item) : [];
                },
                editor:"list", editorParams: function(cell) {
                    const rowData = cell.getRow().getData();
                    const sampleId = rowData?.sample?.id;

                    return {
                        values: datings
                            .filter(item => item.sample?.id === sampleId)
                            .map(item => ({
                                value: item.id,
                                label: formatDatings(item)
                            })),
                        autocomplete:false,
                        multiselect:true,
                        emptyValue:[]
                    };
                },
                headerFilter:"list", headerFilterParams: {
                    values: datings.map(item => ({
                            value: item.id,
                            label: formatDatings(item)
                    })),
                    multiselect: true
                },
                headerFilterFunc: function(headerValue, rowValue){
                    return headerValue.every(val => rowValue.includes(val));
                },
                sorter:"array", sorterParams:{
                    valueMap:"label"
                },
                formatter: function(cell) {
                    const datingsIds = cell.getValue();

                    // HTML download
                    if (Array.isArray(datingsIds) && datingsIds.length > 0 && typeof datingsIds[0] === "object") {
                        return datingsIds.map(obj => formatDatings(obj)).join(", ");
                    }

                    if (Array.isArray(datingsIds)) {
                        return datingsIds
                                .map(id => {
                                    const dating = datings.find(item => item.id === id)
                                    return formatDatings(dating)})
                                .join(", ");
                    }
                },
                accessorDownload: function(value) {
                    if (!Array.isArray(value)) return "";
                    return value
                        .map(id => {
                            const dating = datings.find(item => item.id === id);
                            return {
                                id: dating.id,
                                subSample: dating.subSample,
                                remarks: dating.remarks,
                                datingMethod: dating.datingMethod,
                                material: dating.material,
                                literatureList: dating.literatureList,
                                c14Dating: dating.c14Dating,
                                dendrochronologicalDating: dating.dendrochronologicalDating,
                                otherDating: dating.otherDating
                            }
                        })
                }
            },
            {title:"entry date", titleDownload:"entryDate", field:"entryDate", editor:"date", headerSortTristate:true,
                headerFilter:"input", headerFilterFunc: function(headerValue, rowValue) {
                    if (!headerValue) return true;
                    if (!rowValue) return false;

                    const dateStr = typeof rowValue === "string"
                        ? rowValue.split("T")[0]
                        : rowValue.toISOString().split("T")[0];

                    const header = headerValue.trim();

                    // 1) yyyy
                    if (/^\d{4}$/.test(header)) {
                        return dateStr.startsWith(header);
                    }

                    // 2) yyyy-mm
                    if (/^\d{4}-\d{2}$/.test(header)) {
                        return dateStr.startsWith(header);
                    }

                    // 3) yyyy-mm-dd
                    return dateStr === header;
                },
                formatter: function(cell) {
                    const value = cell.getValue();
                    if (!value) return "";

                    if (typeof value === "string") {
                        return value.split("T")[0];
                    }
                    
                    if (value instanceof Date) {
                        return value.toISOString().split("T")[0];
                    }

                    return "";
                }
            },
            {title:"*tax code", titleDownload:"taxCode", field:"taxCode.id", headerSortTristate:true,
                editor:"list", editorParams: function(cell) {
                    const rowData = cell.getRow().getData();

                    const sample = samples.find(s => s.id === rowData.sample?.id);
                    if (!sample) {
                        return{ values: [], emptyValue: null };
                    }

                    const taxonomyUri = sample.feature.site.taxonomy?.id;
                    const taxCodes = cachedTaxCodesForURI.get(taxonomyUri) || [];

                    return {
                        values: taxCodes.map(item => ({
                            value: item.uri,
                            label: [item.notation, item.prefLabel?.la].filter(Boolean).join(", "),
                        })),
                        emptyValue: null
                    };
                },
                headerFilter:"input",
                headerFilterFunc: function(headerValue, rowValue, rowData) {
                    if (!headerValue) return true;
                    if (!rowValue) return false;                    

                    const sample = samples.find(s => s.id === rowData.sample?.id);
                    if (!sample) return false;

                    const taxonomyUri = sample.feature.site.taxonomy?.id;
                    const taxCodes = cachedTaxCodesForURI.get(taxonomyUri) || [];

                    const entry = taxCodes.find(item => item.uri === rowValue);
                    if (!entry) return false;
                    const label = [entry.notation, entry.prefLabel?.la].filter(Boolean).join(", ").toLowerCase();

                    const header = headerValue.toString().toLowerCase();

                    return label.includes(header);
                },
                formatter: function(cell) {
                    const rowData = cell.getRow().getData();

                    const sample = samples.find(s => s.id === rowData.sample?.id);
                    if (!sample) {
                        return { values: [], emptyValue: null };
                    }

                    const taxonomyUri = sample.feature.site.taxonomy?.id;
                    const taxCodes = cachedTaxCodesForURI.get(taxonomyUri) || [];
                    
                    const value = cell.getValue();
                    const entry = taxCodes.find(item => item.uri === value);

                    // HTML download
                    if (!entry) return typeof value === "string" ? value : "";

                    return entry ? [entry.notation, entry.prefLabel?.la].filter(Boolean).join(", ") : "";
                },
                accessorDownload: function(value, data) {
                    const row = resultTable.getRow(data.id);
                    const rowData = row.getData();

                    if (!value) return "";

                    const sample = samples.find(s => s.id === rowData.sample?.id);
                    if (!sample) return "";

                    const taxonomyUri = sample.feature.site.taxonomy?.id;
                    const taxCodes = cachedTaxCodesForURI.get(taxonomyUri) || [];

                    const entry = taxCodes.find(item => item.uri === value);
                    return entry ? [entry.notation, entry.prefLabel?.la].filter(Boolean).join(", ") : "";
                }
            },
            {title:"*organic / minerals", titleDownload:"orgOrMin", field:"orgOrMin", headerSortTristate:true,
                editor:"list", editorParams: function(cell) {
                    const rowData = cell.getRow().getData();
                    const fractions = rowData?.sample.fractionAnalyzedList || [];
                    const allowedValues = fractions.map(f => f.orgOrMin);

                    return {
                        values: [
                            { value: "org", label: "ORG" },
                            { value: "min", label: "MIN" }
                        ].filter(item => allowedValues.includes(item.value))
                    };
                },
                headerFilter: "list",
                headerFilterParams: {
                    values: [
                        { value: "org", label: "ORG" },
                        { value: "min", label: "MIN" }
                    ]
                },
                formatter: function(cell) {
                    const value = cell.getValue();
                    if (value === "org") {
                        return "ORG";
                    } else if (value === "min") {
                        return "MIN";
                    } else {
                        return "";
                    }
                },
            },
            {title:"*sieve size", titleDownload:"sieveSize", field:"sieveSize", validator: ["required"], headerFilter:"input", headerSortTristate:true,
                editor:"list", editorParams: function(cell) {
                    const rowData = cell.getRow().getData();
                    const fractions = rowData?.sample.fractionAnalyzedList || [];
                    const orgOrMin = rowData?.orgOrMin;
                    const allowedValues = fractions.filter(f => f.orgOrMin === orgOrMin).map(f => f.sieveSize);

                    return {
                        values: allowedValues
                    };
                },
            },
            {title:"*fraction analyzed", titleDownload:"fractionAnalyzed", field:"fractionAnalyzed", headerSortTristate:true,
                editor:"list", editorParams:{ values: [ "yes", "no", "partly"] },
                headerFilter: "list", headerFilterParams:
                    { values: [ "yes", "no", "partly"], multiselect:true },
                headerFilterFunc: function(headerValue, rowValue) {
                    if (!headerValue || (Array.isArray(headerValue) && headerValue.length === 0)) {
                        return true;
                    }
                    return headerValue.includes(rowValue);
                },
            },
            {title:"*classification confer", titleDownload:"classificationConfer", field:"classificationConfer.id", headerSortTristate:true,
                editor:"list", editorParams:{
                    values: cachedClassificationConfers.map(item => ({
                            value: item.uri,
                            label: item.prefLabel.en
                        }))       
                },
                headerFilter:true, headerFilterParams: {
                    values: cachedClassificationConfers.map(item => ({
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
                formatter: cell => formatClassificationConfer(cell.getValue()),
                accessorDownload: value => formatClassificationConfer(value),
            },
            {title:"*rType", titleDownload:"restType", field:"restType.id", headerSortTristate:true,
                editor:"list", editorParams:{
                    values: restTypes.map(item => ({
                            value: item.id,
                            label: item.label + (item.structuralConcept ? ` (${item.structuralConcept})` : "")
                        }))       
                },
                headerFilter:true, headerFilterParams: {
                    values: restTypes.map(item => ({
                            value: item.id,
                            label: item.label + (item.structuralConcept ? ` (${item.structuralConcept})` : "")
                        })),
                    multiselect:true
                },
                headerFilterFunc: function(headerValue, rowValue) {
                    if (!headerValue || (Array.isArray(headerValue) && headerValue.length === 0)) {
                        return true;
                    }
                    return headerValue.includes(rowValue);
                },
                formatter: cell => formatRestType(cell.getValue()),
                accessorDownload: value => formatRestType(value),
            },
            {title:"*state of preservation", titleDownload:"stateOfPreservation", field:"stateOfPreservation.id", headerSortTristate:true,
                editor:"list", editorParams:{
                    values: cachedStateOfPreservation.map(item => ({
                            value: item.uri,
                            label: item.prefLabel.en
                        }))       
                },
                headerFilter:true, headerFilterParams: {
                    values: cachedStateOfPreservation.map(item => ({
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
                formatter: cell => formatStateOfPreservation(cell.getValue()),
                accessorDownload: value => formatStateOfPreservation(value),
            },
            {title:"rCount", titleDownload:"restCount", field:"restCount", headerFilter:"input", headerSortTristate:true,
                editor:"number", validator: ["integer"], editorParams:{
                    min:0,
                    step:1,
                },
            },
            {title:"rFragment", titleDownload:"restFragment", field:"restFragment", headerFilter:"input", headerSortTristate:true,
                editor:"number", validator: ["integer"], editorParams:{
                    min:0,
                    step:1,
                },
            },
            {title:"rWeight [g]", titleDownload:"restWeight", field:"restWeight", headerFilter:"input", headerSortTristate:true,
                editor:"number", editorParams:{
                    min:0,
                    step:0.1,
                },
            },
            {title:"estimation", field:"estimation", hozAlign:"center", headerSortTristate:true,
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
            {title:"multiplier", field:"multiplier", headerFilter:"input", headerSortTristate:true,
                editor:"number", editorParams:{
                    min:0,
                    step:0.1,
                },
            },
            {title:"remarks", field:"remarksTaxonomy", editor:"input", headerFilter:true, headerSort:false},
        ],
    });


    // Hide spinner
    spinner.style.display = 'none';
    // Show table
    tableContainer.style.display = 'flex';

    activeTable = "resultTable";


    // PUT: update results ------------------------------------------------------
    resultTable.on("cellEdited", async function(cell){

        const editedField = cell.getField();
        const newValue = cell.getValue();

        // Update all selected rows
        const selectedRows = resultTable.getSelectedRows();
        const editedRow = cell.getRow();
        if (!selectedRows.includes(editedRow)) {
            selectedRows.push(editedRow);
        }
        selectedRows.forEach(row => {
            
            // Create payload
            const result = row.getData();
            const resultId = result.id;

            // Map ids back to objects
            const datingsAsObjects = (result.absoluteDatingList || []).map(item => typeof item === "string"
                ? { id: item }
                : item);

            const payload = {
                ...result,
                sample: result.sample ? { id: result.sample.id } : null,
                absoluteDatingList: datingsAsObjects,
            };
    
            axios.put(`api/results/${resultId}`, JSON.stringify(payload), {
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
            .catch(error => console.error("Error updating results:", error));
        });
    });

    // Delete rows --------------------------------------------------------------
    const deleteButton = document.getElementById("deleteRows-button");
    
    // Only show deleteButton if at least one row is selected
    resultTable.on("rowSelectionChanged", function(rows){
        deleteButton.classList.toggle("hidden", rows.length === 0);
    });

    deleteButton.addEventListener("click", function() {
        
        const selectedRows = resultTable.getSelectedRows();
        selectedRows.forEach(row => {
            // Get id
            const resultId = row.getData().id;

            axios.delete(`api/results/${resultId}`)
            .then(response => {
                console.log(response.data);
                row.delete();
            })
            .catch(error => {
                console.error('Error deleting results:', error);
            });            
        });
    });
}

// Export table -----------------------------------------------------------------
document.getElementById("download-json").addEventListener("click", function(){
    if (activeTable === "resultTable") {
        const rawData = resultTable.getData("active");
        
        const transformed = rawData.map(row => {
            // Sample
            const sampleId = row.sample?.id;
            const sampleValues = resultTable.getColumn("sample.id").getDefinition().editorParams({
                getRow: () => ({
                    getData: () => row
                })
            }).values;
            const sample = sampleValues.find(s => s.value === sampleId);
            // Feature
            const featureId     = row.sample?.feature?.id;
            const featureValues = resultTable.getColumn("sample.feature.id").getDefinition().editorParams({
                getRow: () => ({
                    getData: () => row
                })
            }).values;
            const feature       = featureValues.find(f => f.value === featureId);
            // Site
            const siteId     = row.sample?.feature?.site?.id;
            const siteValues = resultTable.getColumn("sample.feature.site.id").getDefinition().editorParams.values;
            const site       = siteValues.find(s => s.value === siteId);
            // Tax code
            const taxCodeId     = row.taxCode?.id;
            const taxCodeValues = resultTable.getColumn("taxCode.id").getDefinition().editorParams({
                getRow: () => ({
                    getData: () => row
                })
            }).values;
            const taxCode       = taxCodeValues.find(tc => tc.value === taxCodeId);
            // Classification confer
            const classificationConferId = row.classificationConfer?.id;
            const classificationConfer   = cachedClassificationConfers.find(cf => cf.uri === classificationConferId);
            // Rest type
            const restTypeId     = row.restType.id;
            const restTypeValues = resultTable.getColumn("restType.id").getDefinition().editorParams.values;
            const restType       = restTypeValues.find(rt => rt.value === restTypeId);
            // State of preservation
            const stateOfPreservationId = row.stateOfPreservation.id;
            const stateOfPreservation   = cachedStateOfPreservation.find(sop => sop.uri = stateOfPreservationId);
            
            return {
                id:        row.id,
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
                absoluteDatingList: (() => {
                    const accessorDownload = resultTable
                        .getColumn("absoluteDatingList")
                        .getDefinition()
                        .accessorDownload;
                    return accessorDownload(row.absoluteDatingList);
                })(),
                entryDate: row.entryDate,
                taxCode: taxCodeId && {
                    id:   taxCodeId,
                    name: taxCode.label
                },
                orgOrMin: row.orgOrMin,
                sieveSize: row.sieveSize,
                fractionAnalyzed: row.fractionAnalyzed,
                classificationConfer: classificationConferId
                    ? { id: classificationConferId, label: classificationConfer?.prefLabel.en ?? "" }
                    : null,
                restType: restType
                    ? { id: restType, name: restType?.label ?? "" }
                    : null,
                stateOfPreservation: stateOfPreservationId
                    ? { id: stateOfPreservationId, label: stateOfPreservation?.prefLabel.en ?? "" }
                    : null,
                restCount: row.restCount,
                restFragment: row.restFragment,
                restWeight: row.restWeight,
                estimation: row.estimation,
                multiplier: row.multiplier,
                remarks: row.remarksTaxonomy
            };
        });

        const blob = new Blob([JSON.stringify(transformed, null, 4)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "ArboDat+_Download_Results.json";
        a.click();
        // Revoke later: WebKit (macOS app window) cancels downloads whose blob URL is already revoked.
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
});

document.getElementById("download-csv").addEventListener("click", function(){
    if (activeTable === "resultTable") {
        resultTable.download(
            "csv",
            "ArboDat+_Download_Results.csv"
        );
    }    
});    

document.getElementById("download-xlsx").addEventListener("click", function(){
    if (activeTable === "resultTable") {
        resultTable.download(
            "xlsx",
            "ArboDat+_Download_Results.xlsx",
            {sheetName:"ArboDat+ Results"}
        );
    }
});

document.getElementById("download-html").addEventListener("click", function(){
    if (activeTable === "resultTable") {
        resultTable.download(
            "html",
            "ArboDat+_Download_Results.html"
        );
    }
});
