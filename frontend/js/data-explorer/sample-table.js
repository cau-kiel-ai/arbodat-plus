let sampleTable;

async function buildSampleTable() {
    const container = document.getElementById("table");
    const spinner = document.getElementById('tableSpinner');
    const tableContainer = document.querySelector('.table-container');
    container.innerHTML = "";
    spinner.style.display = 'block';
    tableContainer.style.display = 'none';

    // GET samples --------------------------------------------------------------
    let samples = [];
    try {
        const response = await axios.get("api/samples");
        samples = response.data;
    } catch (error) {
        console.error("Error loading samples:", error);
    }

    // GET sites ----------------------------------------------------------------
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

    // GET coordinate systems ---------------------------------------------------
    await fetchDanteAttribute("coordinateSystem");

    // GET users ----------------------------------------------------------------
    let users = [];
    try {
        const response = await axios.get("api/users");
        users = response.data;
    } catch (error) {
        console.error("Error loading users:", error)
    }

    // GET fractions -----------------------------------------------------------
    let fractions = [];
    try {
        const response = await axios.get("api/fractions_analyzed");
        fractions = response.data;
    } catch (error) {
        console.error("Error loading fractions_analyzed:", error)
    }

    function formatFrac(fractionList) {
        if (!fractionList) return "";

        // HTML download
        if (!Array.isArray(fractionList)) return fractionList;

        return fractionList
            .map(id => {
                const fraction = fractions.find(f => f.id === id)
                return formatFraction(fraction) ?? id ?? "";
            })
            .filter(Boolean)
            .join(", ");
    }

    // Create year list for botanical determination year ------------------------
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let year = currentYear; year >= 0; year--) {
    years.push(year);
    }

    function formatSampleType(sampleTypeId){
        if (!sampleTypeId) return "";
        const sampleType = cachedSampleTypes.find(st => st.uri === sampleTypeId) || null;
        return sampleType?.prefLabel.en ?? sampleTypeId;
    }

    function formatSampleInvestigated(sampleInvestigatedId){
        if (!sampleInvestigatedId) return "";
        const sampleInvestigated = cachedSampleInvestigated.find(si => si.uri === sampleInvestigatedId) || null;
        return sampleInvestigated?.prefLabel.en ?? sampleInvestigatedId;
    }

    function formatChronozone(chronozonedId){
        if (!chronozonedId) return "";
        const chronozone = cachedChronozones.find(c => c.uri === chronozonedId) || null;
        return chronozone?.prefLabel.en ?? chronozonedId;
    }

    // Create Table -------------------------------------------------------------
    sampleTable = new Tabulator("#table", {
        height: "100%",
        data: samples,
        columns:[
            {formatter:"rowSelection", titleFormatter:"rowSelection", titleFormatterParams:{
                rowRange:"active" //only toggle the values of the active filtered rows
            }, hozAlign:"center", headerSort:false},
            {title:"id", field:"id", headerFilter:true, headerSort:false},
            {title:"*label", titleDownload:"label", field:"label", validator: ["required"], editor:"input", headerFilter:true, headerSortTristate:true},
            {title: "*feature", titleDownload:"feature", field:"feature.id", headerSortTristate:true,
                editor:"list", editorParams: function(cell) {
                    const rowData = cell.getRow().getData();
                    const siteId = rowData?.feature?.site?.id;

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
            {title: "*site", titleDownload:"site", field:"feature.site.id", headerSortTristate:true, 
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
            {title:"stratum", field:"stratum", editor:"input", headerFilter:true, headerSortTristate:true},
            {title:"layer", field:"layer", editor:"input", headerFilter:true, headerSortTristate:true},
            {title:"sector", field:"sector", editor:"input", headerFilter:true, headerSortTristate:true},
            {title:"planum", field:"planum", editor:"input", headerFilter:true, headerSortTristate:true},
            {title:"depth from [cm]", titleDownload:"depthFrom", field:"depthFrom", headerFilter:"input", headerSortTristate:true,
                editor:"number", editorParams:{
                    min:0,
                    step:0.1,
                },
            },
            {title:"depth to [cm]", titleDownload:"depthTo", field:"depthTo", headerFilter:"input", headerSortTristate:true,
                editor:"number", editorParams:{
                    min:0,
                    step:0.1,
                },
            },
            // Coordinate ---------------------------------------------------------------------------------------------
            {title:"coordinate system", titleDownload:"coordinateSystem", field:"coordinate.coordinateSystem.id", headerSortTristate:true,
                editor:"list", editorParams:{
                    values: [
                        { value: null, label: "none" },
                        ...cachedCoordinateSystems.map(crs => ({
                            value: crs.uri,
                            label: [crs.prefLabel.en, crs.notation].filter(Boolean).join(" - ")
                        }))
                    ],
                    emptyValue:null             
                },
                headerFilter:true, headerFilterParams: {
                    values: cachedCoordinateSystems.map(crs => ({
                            value: crs.uri,
                            label: [crs.prefLabel.en, crs.notation].filter(Boolean).join(" - ")
                        })),
                    multiselect:true
                },
                headerFilterFunc: function(headerValue, rowValue) {
                    if (!headerValue || (Array.isArray(headerValue) && headerValue.length === 0)) {
                        return true;
                    }
                    return headerValue.includes(rowValue);
                },
                formatter: cell => formatCoordinateSystem(cell.getValue()),
                accessorDownload: value => formatCoordinateSystem(value),
            },
            {title:"longitude", field:"coordinate.longitude", headerFilter:"input", headerSortTristate:true,
                editor:"number", editorParams:{
                    min:0,
                    step:0.1,
                },
            },
            {title:"latitude", field:"coordinate.latitude", headerFilter:"input", headerSortTristate:true,
                editor:"number", editorParams:{
                    min:0,
                    step:0.1,
                },
            },
            {title:"altitude", field:"coordinate.altitude", headerFilter:"input", headerSortTristate:true,
                editor:"number", editorParams:{
                    min:0,
                    step:0.1,
                },
            },
            {title:"longitude WGS84", titleDownload:"longitudeWGS84", field:"coordinate.longitudeWgs84", headerFilter:"input", headerSortTristate:true,
                editor:"number", editorParams:{
                    min:0,
                    step:0.1,
                },
            },
            {title:"latitude WGS84", titleDownload:"latitudeWGS84", field:"coordinate.latitudeWgs84", headerFilter:"input", headerSortTristate:true,
                editor:"number", editorParams:{
                    min:0,
                    step:0.1,
                },
            },
            {title:"remarks coordinate", titleDownload:"remarksCoordinate", field:"remarksCoordinate", editor:"input", headerFilter:true, headerSortTristate:true},
            // --------------------------------------------------------------------------------------------------------
            {title: "botanical determination by (multiple selection)", titleDownload:"botanicalDeterminationBy", field:"botanicalDeterminationBy", headerSortTristate:true,
                mutator: function(value) {
                    // Map objects only to id
                    return Array.isArray(value) ? value.map(item => item.id? item.id : item) : [];
                },
                editor:"list", editorParams:{
                    values: [
                        ...users.map(item => ({
                            value: item.id,
                            label: formatName(item)
                        }))
                    ],
                    autocomplete:false,
                    multiselect:true,
                    emptyValue:[]
                },
                headerFilter:"list", headerFilterParams: {
                    values: users.map(item => ({
                            value: item.id,
                            label: formatName(item)
                    })),
                    multiselect: true
                },
                headerFilterFunc: function(headerValue, rowValue){
                    return headerValue.every(val => rowValue.includes(val));
                },
                sorter:"array", sorterParams:{
                    valueMap:"label"
                },
                formatter: cell => formatUser(users, cell.getValue()),
                accessorDownload: value => formatUser(users, value),
            },
            {title:"botanicalDeterminationYear", field:"botanicalDeterminationYear", headerSortTristate:true,
                editor:"list", editorParams:{
                    values: years,
                    emptyValue:null
                },
                headerFilter:"list", headerFilterParams: {
                    values: years,
                    multiselect: true
                },
                headerFilterFunc: function(headerValue, rowValue) {
                    if (!headerValue || headerValue.length === 0) return true;
                    if (rowValue == null) return false;
                    return headerValue.includes(rowValue);
                },
                sorter:"array", sorterParams:{
                    valueMap:"label"
                },
            },
            {title: "fraction analyzed list", titleDownload:"fractionAnalyzedList", field:"fractionAnalyzedList", headerSortTristate:true,
                mutator: function(value) {
                    // Map objects only to id
                    return Array.isArray(value) ? value.map(item => item.id? item.id : item) : [];
                },
                headerFilter:true,
                sorter:"array", sorterParams:{
                    valueMap:"label"
                },
                headerFilterFunc: function(headerValue, rowValue) {
                    if (!headerValue) return true;
                    if (!Array.isArray(rowValue)) return false;

                    const header = headerValue.toString().toLowerCase();

                    return rowValue.some(id => {
                        const frac = fractions.find(f => f.id === id);
                        const label = formatFraction(frac).toLowerCase();
                        return label.includes(header) || id.toString().includes(header);
                    });
                },
                formatter: cell => formatFrac(cell.getValue()),
                accessorDownload: value => formatFrac(value),
            },
            {title:"sample type", titleDownload:"sampleType", field:"sampleType.id", headerSortTristate:true,
                editor:"list", editorParams:{
                    values: [
                        { value: null, label: "none" },
                        ...cachedSampleTypes.map(item => ({
                            value: item.uri,
                            label: item.prefLabel.en
                        }))
                    ],
                    emptyValue:null             
                },
                headerFilter:true, headerFilterParams: {
                    values: cachedSampleTypes.map(item => ({
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
                formatter: cell => formatSampleType(cell.getValue()),
                accessorDownload: value => formatSampleType(value),
            },
            {title:"storage find", titleDownload:"storageFind", field:"sampleStorage", hozAlign:"center", headerSortTristate:true,
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
            {title:"microremain sample", titleDownload:"microRemain", field:"microRemain", hozAlign:"center", headerSortTristate:true,
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
            {title:"seeds and fruits", titleDownload:"seedsAndFruits", field:"seedsAndFruits.id", headerSortTristate:true,
                editor:"list", editorParams:{
                    values: [
                        { value: null, label: "none" },
                        ...cachedSampleInvestigated.map(item => ({
                            value: item.uri,
                            label: item.prefLabel.en
                        }))
                    ],
                    emptyValue:null             
                },
                headerFilter:true, headerFilterParams: {
                    values: cachedSampleInvestigated.map(item => ({
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
                formatter: cell => formatSampleInvestigated(cell.getValue()),
                accessorDownload: value => formatSampleInvestigated(value),
            },
            {title:"wood subfossile", titleDownload:"woodSubfossile", field:"woodSubfossile.id", headerSortTristate:true,
                editor:"list", editorParams:{
                    values: [
                        { value: null, label: "none" },
                        ...cachedSampleInvestigated.map(item => ({
                            value: item.uri,
                            label: item.prefLabel.en
                        }))
                    ],
                    emptyValue:null             
                },
                headerFilter:true, headerFilterParams: {
                    values: cachedSampleInvestigated.map(item => ({
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
                formatter: cell => formatSampleInvestigated(cell.getValue()),
                accessorDownload: value => formatSampleInvestigated(value),
            },
            {title:"charcoal investigated", titleDownload:"charcoalInvestigated", field:"charcoalInvestigated.id", headerSortTristate:true,
                editor:"list", editorParams:{
                    values: [
                        { value: null, label: "none" },
                        ...cachedSampleInvestigated.map(item => ({
                            value: item.uri,
                            label: item.prefLabel.en
                        }))
                    ],
                    emptyValue:null             
                },
                headerFilter:true, headerFilterParams: {
                    values: cachedSampleInvestigated.map(item => ({
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
                formatter: cell => formatSampleInvestigated(cell.getValue()),
                accessorDownload: value => formatSampleInvestigated(value),
            },
            {title:"charcoal total weight [g]", titleDownload:"totalWeight", field:"totalWeight", headerFilter:"input", headerSortTristate:true,
                editor:"number", editorParams:{
                    min:0,
                    step:0.1,
                },
            },
            {title:"charcoal undetermined weight [g]", titleDownload:"weightUndetermined", field:"weightUndetermined", headerFilter:"input", headerSortTristate:true,
                editor:"number", editorParams:{
                    min:0,
                    step:0.1,
                },
            },
            {title:"sample volume [l]", titleDownload:"sampleVolume", field:"sampleVolume", headerFilter:"input", headerSortTristate:true,
                editor:"number", editorParams:{
                    min:0,
                    step:0.1,
                },
            },
            {title:"volume determination", titleDownload:"volumeDetermination", field:"volumeDetermination", headerSortTristate:true,
                editor:"list", editorParams:{
                    values: ["dry", "wet"],
                    emptyValue:null             
                },
                headerFilter:true, headerFilterParams: {
                    values: ["dry", "wet"],
                },
            },
            {title:"chronozone", field:"chronozone.id", headerSortTristate:true,
                editor:"list", editorParams:{
                    values: [
                        { value: null, label: "none" },
                        ...cachedChronozones.map(item => ({
                            value: item.uri,
                            label: item.prefLabel.en
                        }))
                    ],
                    emptyValue:null             
                },
                headerFilter:true, headerFilterParams: {
                    values: cachedChronozones.map(item => ({
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
                formatter: cell => formatChronozone(cell.getValue()),
                accessorDownload: value => formatChronozone(value),
            },
            {title:"archaeological dating", titleDownload:"archaeologicalDating", field:"archaeologicalDating", editor:"input", headerFilter:true, headerSortTristate:true},
            {title:"cultural group", titleDownload:"culturalGroup", field:"culturalGroup", editor:"input", headerFilter:true, headerSortTristate:true},
            {title:"remarks", field:"remarksSample", editor:"input", headerFilter:true, headerSort:false},
        ],
        initialSort: [
            {column: "label", dir: "asc"}
        ]
    });


    // Hide spinner
    spinner.style.display = 'none';
    // Show table
    tableContainer.style.display = 'flex';

    activeTable = "sampleTable";


    // PUT: update samples -------------------------------------------------
    sampleTable.on("cellEdited", async function(cell){

        const editedField = cell.getField();
        const newValue = cell.getValue();

        // Update all selected rows
        const selectedRows = sampleTable.getSelectedRows();
        const editedRow = cell.getRow();
        if (!selectedRows.includes(editedRow)) {
            selectedRows.push(editedRow);
        }
        selectedRows.forEach(row => {
            
            // Create payload
            const sample = row.getData();
            const sampleId = sample.id;

            // Map ids back to objects
            const crs = cachedCoordinateSystems.find(crs => crs.uri === sample.coordinate.coordinateSystem.id);
            const coordinateSystemAsObject = crs
            ? {
                id: crs.uri,
                label: [crs.prefLabel?.en, crs.notation].filter(Boolean).join(" - ")
              }
            : null;
            const botanicalDeterminationByAsObjects = (sample.botanicalDeterminationBy || []).map(item => typeof item === "string"
                ? { id: item }
                : item);
            const fractionsAsObjects = (sample.fractionAnalyzedList || []).map(item => typeof item === "string"
            ? { id: item,
                fractionAnalyzed: fractions.find(frac => frac.id === item).fractionAnalyzed,
                orgOrMin: fractions.find(frac => frac.id === item).orgOrMin,
                sieveSize: fractions.find(frac => frac.id === item).sieveSize,
                standardMultiplier: fractions.find(frac => frac.id === item).standardMultiplier,
             }
            : item);

            const payload = {
                ...sample,
                feature: sample.feature ? { id: sample.feature.id } : null,
                coordinate: {
                    coordinateSystem: coordinateSystemAsObject,
                    longitude: sample.coordinate.longitude,
                    longitudeWgs84: sample.coordinate.longitudeWgs84,
                    latitude: sample.coordinate.latitude,
                    latitudeWgs84: sample.coordinate.latitudeWgs84,
                    altitude: sample.coordinate.altitude,
                },
                botanicalDeterminationBy: botanicalDeterminationByAsObjects,
                fractionAnalyzedList: fractionsAsObjects,
            };
    
            axios.put(`api/samples/${sampleId}`, JSON.stringify(payload), {
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
            .catch(error => console.error("Error updating sample:", error));
        });
    });

    // Delete rows --------------------------------------------------------------
    const deleteButton = document.getElementById("deleteRows-button");
    
    // Only show deleteButton if at least one row is selected
    sampleTable.on("rowSelectionChanged", function(rows){
        deleteButton.classList.toggle("hidden", rows.length === 0);
    });

    deleteButton.addEventListener("click", function() {
        
        const selectedRows = sampleTable.getSelectedRows();
        selectedRows.forEach(row => {
            // Get id
            const sampleId = row.getData().id;

            axios.delete(`api/samples/${sampleId}`)
            .then(response => {
                console.log(response.data);
                row.delete();
            })
            .catch(error => {
                console.error('Error deleting sample:', error);
            });            
        });
    });
}

// Export table -----------------------------------------------------------------
document.getElementById("download-json").addEventListener("click", function(){
    if (activeTable === "sampleTable") {
        const rawData = sampleTable.getData("active");
    
        const transformed = rawData.map(row => {
            // Feature
            const featureId     = row.feature?.id;
            const featureValues = sampleTable.getColumn("feature.id").getDefinition().editorParams({
                getRow: () => ({
                    getData: () => row
                })
            }).values;
            const feature       = featureValues.find(f => f.value === featureId);
            // Site
            const siteId     = row.feature?.site?.id;
            const siteValues = sampleTable.getColumn("feature.site.id").getDefinition().editorParams.values;
            const site       = siteValues.find(s => s.value === siteId);
            // Coordinate system
            const coordinateSystemId = row.coordinate?.coordinateSystem?.id ?? null;
            const coordinateSystem = cachedCoordinateSystems.find(cs => cs.uri === coordinateSystemId);
            const hasCoordinateValues =
                coordinateSystemId ||
                row.coordinate?.longitude != null ||
                row.coordinate?.latitude != null ||
                row.coordinate?.altitude != null ||
                row.coordinate?.longitudeWgs84 != null ||
                row.coordinate?.latitudeWgs84 != null ||
                row.coordinate?.remarksCoordinate != null;
            // Fraction
            const formatFrac = sampleTable
                .getColumn("fractionAnalyzedList")
                .getDefinition()
                .formatter;
            // Sample type
            const sampleTypeId = row.sampleType?.id ?? null;
            const sampleType = cachedSampleTypes.find(st => st.uri === sampleTypeId) || null;
            // Seeds and fruits
            const seedsAndFruitsId = row.seedsAndFruits?.id ?? null;
            const seedsAndFruits   = cachedSampleInvestigated.find(saf => saf.uri === seedsAndFruitsId);
            // Wood subfossile
            const woodSubfossileId = row.woodSubfossile?.id ?? null;
            const woodSubfossile   = cachedSampleInvestigated.find(ws => ws.uri === woodSubfossileId);
            // Charcoal investigated
            const charcoalInvestigatedId = row.charcoalInvestigated?.id ?? null;
            const charcoalInvestigated   = cachedSampleInvestigated.find(ci => ci.uri === charcoalInvestigatedId);
            // Chronozone
            const chronozoneId = row.chronozone?.id ?? null;
            const chronozone   = cachedChronozones.find(c => c.uri === chronozoneId);
            
            return {
                id:    row.id,
                label: row.label,
                feature: featureId && {
                    id:   featureId,
                    name: feature.label
                },
                site: siteId && {
                    id:   siteId,
                    name: site.label
                },
                stratum:   row.stratum,
                layer:     row.layer,
                sector:    row.sector,
                planum:    row.planum,
                depthFrom: row.depthFrom,
                depthTo:   row.depthTo,
                coordinate: hasCoordinateValues
                    ? {
                        ...(coordinateSystemId && {
                            coordinateSystem: {
                                id: coordinateSystemId,
                                label: [coordinateSystem?.prefLabel.en, coordinateSystem?.notation].filter(Boolean).join(" - ")
                            }
                        }),
                        longitude:      row.coordinate.longitude,
                        latitude:       row.coordinate.latitude,
                        altitude:       row.coordinate.altitude,
                        longitudeWgs84: row.coordinate.longitudeWgs84,
                        latitudeWgs84:  row.coordinate.latitudeWgs84,
                        remarks:        row.coordinate.remarksCoordinate,
                    }
                    : null,
                botanicalDeterminationBy: (row.botanicalDeterminationBy || []).map(botanicalDeterminationById => {
                    const botanicalDeterminationByValues = sampleTable.getColumn("botanicalDeterminationBy").getDefinition().editorParams.values;
                    const botanicalDeterminationBy = botanicalDeterminationByValues.find(bdb => bdb.value === botanicalDeterminationById);
                    return { id: botanicalDeterminationById, name: botanicalDeterminationBy?.label };
                }),
                botanicalDeterminationYear: row.botanicalDeterminationYear,
                fractionAnalyzedList: (row.fractionAnalyzedList || []).map(fractionId => {
                    return { id: fractionId, name: formatFrac({ getValue: () => [fractionId] }) };
                }),
                sampleType: sampleTypeId
                    ? { id: sampleTypeId, label: sampleType?.prefLabel?.en ?? "" }
                    : null,
                storageFind: row.sampleStorage,
                microRemain: row.microRemain,
                seedsAndFruits: seedsAndFruitsId
                    ? { id: seedsAndFruitsId, label: seedsAndFruits?.prefLabel?.en ?? "" }
                    : null,
                woodSubfossile: woodSubfossileId
                    ? { id: woodSubfossileId, label: woodSubfossile?.prefLabel?.en ?? "" }
                    : null,
                charcoalInvestigated: charcoalInvestigatedId
                    ? { id: charcoalInvestigatedId, label: charcoalInvestigated?.prefLabel?.en ?? "" }
                    : null,
                totalWeight:         row.totalWeight,
                weightUndetermined:  row.weightUndetermined,
                sampleVolume:        row.sampleVolume,
                volumeDetermination: row.volumeDetermination,
                chronozone: chronozoneId
                    ? { id: chronozoneId, label: chronozone?.prefLabel?.en ?? "" }
                    : null,
                archaeologicalDating: row.archaeologicalDating,
                culturalGroup: row.culturalGroup,
                remarks: row.remarksSample,
            };
        });

        const blob = new Blob([JSON.stringify(transformed, null, 4)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "ArboDat+_Download_Samples.json";
        a.click();
        // Revoke later: WebKit (macOS app window) cancels downloads whose blob URL is already revoked.
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
});

document.getElementById("download-csv").addEventListener("click", function(){
    if (activeTable === "sampleTable") {
        sampleTable.download(
            "csv",
            "ArboDat+_Download_Samples.csv"
        );
    }    
});    

document.getElementById("download-xlsx").addEventListener("click", function(){
    if (activeTable === "sampleTable") {
        sampleTable.download(
            "xlsx",
            "ArboDat+_Download_Samples.xlsx",
            {sheetName:"ArboDat+ Samples"}
        );
    }
});

document.getElementById("download-html").addEventListener("click", function(){
    if (activeTable === "sampleTable") {
        sampleTable.download(
            "html",
            "ArboDat+_Download_Samples.html"
        );
    }
});
