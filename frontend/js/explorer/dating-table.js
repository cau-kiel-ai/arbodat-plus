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

    // GET laboratories (dendrochronology and other datings) --------------------
    let laboratories = [];
    async function loadLaboratories() {
        try {
            const response = await axios.get("api/laboratories");
            laboratories = response.data;
        } catch (error) {
            console.error("Error loading laboratories:", error);
        }
    }
    await loadLaboratories();

    // GET C14 laboratories -----------------------------------------------------
    await fetchDanteAttribute("c14Laboratory");

    function c14LaboratoryLabel(item){
        return [item.notation, item.prefLabel?.zxx].filter(Boolean).join(", ");
    }

    function formatC14Laboratory(c14LaboratoryId){
        if (!c14LaboratoryId) return "";
        const c14Laboratory = cachedC14Laboratories.find(l => l.uri === c14LaboratoryId) || null;
        return c14Laboratory ? c14LaboratoryLabel(c14Laboratory) : c14LaboratoryId;
    }

    // Dating type of a row, derived from its dating method (same rule as AbsoluteDatingController.update)
    function datingType(rowData){
        const datingMethodId = rowData?.datingMethod?.id;
        if (!datingMethodId) return null;
        const label = cachedDatingMethods.find(dm => dm.uri === datingMethodId)?.prefLabel.en;
        if (label === "Dendrochronology") return "dendro";
        if (label === "Radiocarbon Dating") return "c14";
        return "other";
    }

    const datingTypeOfField = {
        dendrochronologicalDating: "dendro",
        c14Dating: "c14",
        otherDating: "other",
    };

    // Dating column: editable only in rows whose dating method matches; other cells are blank and greyed out
    function datingColumn(type, definition){
        const baseFormatter = definition.formatter ?? (cell => escapeHtml(cell.getValue()));
        return {
            headerSortTristate: true,
            headerFilter: true,
            ...definition,
            editable: cell => datingType(cell.getRow().getData()) === type,
            formatter: (cell, formatterParams, onRendered) => {
                const applicable = datingType(cell.getRow().getData()) === type;
                cell.getElement().classList.toggle("dating-na", !applicable);
                return applicable ? baseFormatter(cell, formatterParams, onRendered) : "";
            },
        };
    }

    // Header filter with a tri-state checkbox (all / true / false), like "storage find" in the sample table
    function triStateCheckboxFilter(cell, onRendered, success, cancel){
        let state = "all";
        const box = document.createElement("input");
        box.type = "checkbox";
        box.indeterminate = true;

        box.addEventListener("click", function(){
            if (state === "all") {
                box.indeterminate = false;
                box.checked = true;
                state = "true";
            } else if (state === "true") {
                box.indeterminate = false;
                box.checked = false;
                state = "false";
            } else {
                box.indeterminate = true;
                box.checked = false;
                state = "all";
            }
            success(state);
        });

        return box;
    }

    const numberEditorParams = (step) => ({ step: step, elementAttributes: { step: step } });

    // Lab (dendrochronology/other): select an existing lab or type a new one
    const laboratoryEditorParams = () => ({
        values: laboratories.map(item => item.label),
        autocomplete: true,
        freetext: true,
        clearable: true,
        listOnEmpty: true,
    });


    // Create Table -------------------------------------------------------------
    datingTable = newTabulator("#table", {
        height: "100%",
        data: absoluteDatings,
        columns:[
            {cssClass:"selectionColumn", formatter:"rowSelection", titleFormatter:"rowSelection", titleFormatterParams:{
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
                            label:
                                item.label +
                                " (" +
                                item.feature.label +
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
                formatter: textFormatter(cell => formatSample(samples, cell.getValue())),
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
                            label:
                                item.label +
                                " (" +
                                item.site.label +
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
                formatter: textFormatter(cell => formatFeature(features, cell.getValue())),
                accessorDownload: value => formatFeature(features, value),
            },
            {title: "*site", titleDownload:"site", field:"sample.feature.site.id", headerSortTristate:true,
                editor:"list", editorParams:{
                    values: sites.map(item => ({
                            value: item.id,
                            label:
                                item.label +
                                " (" +
                                item.researchProjectList.map(rp => rp.projectName).join(',') +
                                ")"
                        }))
                    ,
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
                formatter: textFormatter(cell => formatSite(sites, cell.getValue())),
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
                formatter: textFormatter(cell => formatLit(literature, cell.getValue())),
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
                formatter: textFormatter(cell => formatMaterial(cell.getValue())),
                accessorDownload: value => formatMaterial(value),
            },
            {title:"remarks", field:"remarks", editor:"input", headerFilter:true, headerSort:false},
            {title:"dating method", titleDownload:"datingMethod", field:"datingMethod.id", headerSortTristate:true,
                editor:"list", editorParams:{
                    values: cachedDatingMethods.map(item => ({
                            value: item.uri,
                            label: item.prefLabel.en
                        })),
                },
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
                formatter: textFormatter(cell => formatDatingMethod(cell.getValue())),
                accessorDownload: value => formatDatingMethod(value),
            },
            {title:"dendrochronology", columns:[
                datingColumn("dendro", {title:"laboratory", titleDownload:"dendroLaboratory", field:"dendrochronologicalDating.laboratory.label",
                    editor:"list", editorParams: laboratoryEditorParams, headerFilter:"input"}),
                datingColumn("dendro", {title:"number", titleDownload:"dendroNumber", field:"dendrochronologicalDating.number", editor:"input"}),
                datingColumn("dendro", {title:"age", titleDownload:"dendroAge", field:"dendrochronologicalDating.dendrochronologicalAge", editor:"input"}),
                datingColumn("dendro", {title:"waney edge", titleDownload:"dendroWaneyEdge", field:"dendrochronologicalDating.waneyEdge", hozAlign:"center",
                    headerFilter: triStateCheckboxFilter,
                    headerFilterFunc: function(headerValue, rowValue){
                        if (headerValue === "true") return rowValue === true;
                        if (headerValue === "false") return rowValue === false;
                        return true;
                    },
                    formatter: cell => `<input type="checkbox" ${cell.getValue() ? "checked" : ""}>`,
                    cellClick: function(e, cell){
                        if (e.target.tagName === "INPUT" && datingType(cell.getRow().getData()) === "dendro") {
                            cell.setValue(e.target.checked);
                        }
                    }}),
            ]},
            {title:"radiocarbon", columns:[
                datingColumn("c14", {title:"C14 Laboratory", titleDownload:"c14Laboratory", field:"c14Dating.c14Laboratory.id",
                    editor:"list", editorParams: () => ({
                        values: cachedC14Laboratories.map(item => ({ value: item.uri, label: c14LaboratoryLabel(item) })),
                        autocomplete: true,
                        clearable: true,
                        listOnEmpty: true,
                        emptyValue: null,
                    }),
                    headerFilter:"input",
                    headerFilterFunc: (headerValue, rowValue) =>
                        !headerValue || formatC14Laboratory(rowValue).toLowerCase().includes(headerValue.toString().toLowerCase()),
                    sorter: (a, b) => formatC14Laboratory(a).localeCompare(formatC14Laboratory(b)),
                    formatter: textFormatter(cell => formatC14Laboratory(cell.getValue())),
                    accessorDownload: value => formatC14Laboratory(value)}),
                datingColumn("c14", {title:"number", titleDownload:"c14Number", field:"c14Dating.number", editor:"input"}),
                datingColumn("c14", {title:"C14-age BP", titleDownload:"c14AgeBp", field:"c14Dating.c14AgeBp", sorter:"number",
                    editor:"number", editorParams:numberEditorParams(1)}),
                datingColumn("c14", {title:"C14 std dev", titleDownload:"c14StdDev", field:"c14Dating.c14StdDev", sorter:"number",
                    editor:"number", editorParams:numberEditorParams(1)}),
                datingColumn("c14", {title:"C14 cal BC/AD (2s)", titleDownload:"c14CalibrationBcAd2s", field:"c14Dating.c14CalibrationBcAd2s", editor:"input"}),
                datingColumn("c14", {title:"delta C13", titleDownload:"deltaC13", field:"c14Dating.deltaC13", sorter:"number",
                    editor:"number", editorParams:numberEditorParams("any")}),
                datingColumn("c14", {title:"delta C13 uncertainty", titleDownload:"deltaC13Uncertainty", field:"c14Dating.deltaC13Uncertainty", sorter:"number",
                    editor:"number", editorParams:numberEditorParams("any")}),
                datingColumn("c14", {title:"pMC", titleDownload:"pmc", field:"c14Dating.pmc", sorter:"number",
                    editor:"number", editorParams:numberEditorParams("any")}),
                datingColumn("c14", {title:"pMC uncertainty", titleDownload:"pmcUncertainty", field:"c14Dating.pmcUncertainty", sorter:"number",
                    editor:"number", editorParams:numberEditorParams("any")}),
            ]},
            {title:"other dating", columns:[
                datingColumn("other", {title:"laboratory", titleDownload:"otherLaboratory", field:"otherDating.laboratory.label",
                    editor:"list", editorParams: laboratoryEditorParams, headerFilter:"input"}),
                datingColumn("other", {title:"number", titleDownload:"otherNumber", field:"otherDating.number", editor:"input"}),
                datingColumn("other", {title:"age", titleDownload:"otherAge", field:"otherDating.ageDivers", editor:"input"}),
            ]},
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
    // Keeps only the dating matching the row's dating method and resolves its laboratory
    function buildDatings(absolute_dating) {
        const type = datingType(absolute_dating);

        // Empty inputs are sent as null
        const clean = dating => dating && Object.fromEntries(
            Object.entries(dating).map(([key, value]) => [key, value === "" ? null : value])
        );

        let dendroDating = null, c14Dating = null, otherDating = null;

        if (type === "dendro" && absolute_dating.dendrochronologicalDating) {
            dendroDating = clean(absolute_dating.dendrochronologicalDating);
            dendroDating.laboratory = resolveLaboratory(dendroDating.laboratory);
        }
        else if (type === "c14" && absolute_dating.c14Dating) {
            c14Dating = clean(absolute_dating.c14Dating);
            const c14Laboratory = cachedC14Laboratories.find(l => l.uri === c14Dating.c14Laboratory?.id);
            c14Dating.c14Laboratory = c14Laboratory
                ? { id: c14Laboratory.uri, label: c14LaboratoryLabel(c14Laboratory) }
                : null;
        }
        else if (type === "other" && absolute_dating.otherDating) {
            otherDating = clean(absolute_dating.otherDating);
            otherDating.laboratory = resolveLaboratory(otherDating.laboratory);
        }

        return { dendrochronologicalDating: dendroDating, c14Dating: c14Dating, otherDating: otherDating };
    }

    // Laboratory (dendrochronology/other) by label: existing lab or null (new labs are created beforehand)
    function resolveLaboratory(laboratory) {
        const lab = laboratories.find(l => l.label === laboratory?.label);
        return lab ? { id: lab.id, label: lab.label } : null;
    }

    datingTable.on("cellEdited", async function(cell){

        const editedField = cell.getField();
        const newValue = cell.getValue();

        // Dating fields only apply to rows of the matching dating type
        const fieldType = datingTypeOfField[editedField.split(".")[0]];
        const selectedRows = await getRowsToUpdate(datingTable, cell, "dating", "datings",
            row => !fieldType || datingType(row.getData()) === fieldType);
        if (!selectedRows) return;

        // Create a new laboratory once (after the confirmation), before it is applied to all selected rows
        if (editedField.endsWith("laboratory.label") && newValue && !laboratories.some(l => l.label === newValue)) {
            try {
                await axios.post("api/laboratories", { label: newValue });
                await loadLaboratories();
            } catch (error) {
                console.error("Error creating laboratory:", error);
                reportExplorerError(`Could not create laboratory: ${getErrorMessage(error)}`);
                cell.restoreOldValue();
                return;
            }
        }

        const requests = [];
        const rowsToSync = [];
        selectedRows.forEach(row => {

            // Create payload
            const absolute_dating = JSON.parse(JSON.stringify(row.getData()));
            setNestedValue(absolute_dating, editedField, newValue); // other selected rows do not contain the new value yet
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
            const datingMethodAsObjects = absolute_dating.datingMethod?.id
                ? {
                    id: absolute_dating.datingMethod.id,
                    label: cachedDatingMethods.find(item => item.uri === absolute_dating.datingMethod.id)?.prefLabel.en || null,
                }
                : null;

            const payload = {
                ...absolute_dating,
                sample: absolute_dating.sample ? { id: absolute_dating.sample.id } : null,
                literatureList: literatureAsObjects,
                datingMethod: datingMethodAsObjects,
                ...buildDatings(absolute_dating),
            };
    
            requests.push(axios.put(`api/absolute_datings/${absoluteDatingId}`, JSON.stringify(payload), {
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

                // The backend only keeps the dating of the new method: mirror that and refresh the greyed cells
                if (editedField === "datingMethod.id") {
                    const rowData = row.getData();
                    Object.entries(datingTypeOfField).forEach(([key, type]) => {
                        if (type !== datingType(rowData)) rowData[key] = null;
                    });
                    row.reformat();
                }

                // A dating created by this edit has no id in the table yet
                if (Object.keys(datingTypeOfField).some(key => payload[key] && !payload[key].id)) {
                    rowsToSync.push(row);
                }
            })
            .catch(error => handleUpdateError(cell, row, "dating", error)));
        });

        // Take over the ids of newly created datings, otherwise the next edit would create them again
        await Promise.allSettled(requests);
        if (rowsToSync.length > 0) {
            try {
                const response = await axios.get("api/absolute_datings");
                rowsToSync.forEach(row => {
                    const rowData = row.getData();
                    const saved = response.data.find(item => item.id === rowData.id);
                    Object.keys(datingTypeOfField).forEach(key => {
                        if (rowData[key] && !rowData[key].id && saved?.[key]) {
                            rowData[key].id = saved[key].id;
                        }
                    });
                });
            } catch (error) {
                console.error("Error reloading absolute datings:", error);
            }
        }
    });

    // Delete rows --------------------------------------------------------------
    const deleteButton = document.getElementById("deleteRows-button");
    
    // Only show deleteButton if at least one row is selected
    datingTable.on("rowSelectionChanged", function(rows){
        deleteButton.classList.toggle("hidden", rows.length === 0);
    });

    // onclick (not addEventListener): the button is shared by all tables
    deleteButton.onclick = async function() {
        const selectedRows = datingTable.getSelectedRows();
        if (!await confirmDelete("dating", selectedRows.length)) return;

        selectedRows.forEach(row => {
            // Get id
            const absoluteDatingId = row.getData().id;

            axios.delete(`api/absolute_datings/${absoluteDatingId}`)
            .then(async response => {
                console.log(response.data);
                await row.delete();
                // Deleting a row does not fire rowSelectionChanged
                deleteButton.classList.toggle("hidden", datingTable.getSelectedRows().length === 0);
            })
            .catch(error => {
                handleDeleteError("dating", error);
            });            
        });
    };
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
                .formatter.raw; // plain text, the formatter itself escapes HTML
            
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
