let siteTable;

async function buildSiteTable() {
    const container = document.getElementById("table");
    const spinner = document.getElementById('tableSpinner');
    const tableContainer = document.querySelector('.table-container');
    container.innerHTML = "";
    spinner.style.display = 'block';
    tableContainer.style.display = 'none';

    // GET sites ----------------------------------------------------------------
    let sites = [];
    try {
        const response = await axios.get("api/sites");
        sites = response.data;
    } catch (error) {
        console.error("Error loading sites:", error);
    }

    // GET research projects ----------------------------------------------------
    let researchProjects = [];
    try {
        const response = await axios.get("api/research_projects");
        researchProjects = response.data;
    } catch (error) {
        console.error("Error loading research projects:", error)
    }

    function formatResearchProjects(researchProjectList) {
        if (!researchProjectList) return "";

        // HTML download
        if (!Array.isArray(researchProjectList)) return researchProjectList;

        return researchProjectList
            .map(id => {
                const rp = researchProjects.find(rp => rp.id === id)
                return rp?.projectName ?? id ?? "";
            })
            .filter(Boolean)
            .join(", ");
    }
    
    // GET literature -----------------------------------------------------------
    let literature = [];
    try {
        const response = await axios.get("api/literature");
        literature = response.data;
    } catch (error) {
        console.error("Error loading literature:", error)
    }

    // GET site types -----------------------------------------------------------
    let siteTypes = [];
    try {
        const response = await axios.get("api/dante_attributes/site_type");
        siteTypes = response.data;
    } catch (error) {
        console.error("Error loading site types:", error)
    }

    function formatSiteTypes(siteTypeList) {
        if (!siteTypeList) return "";

        // HTML download
        if (!Array.isArray(siteTypeList)) return siteTypeList;

        return siteTypeList
            .map(id => {
                const siteType = siteTypes.find(siteType => siteType.id === id)
                return siteType?.label ?? id ?? "";
            })
            .filter(Boolean)
            .join(", ");
    }

    // GET natural units --------------------------------------------------------
    let naturalUnits = [];
    try {
        const response = await axios.get("api/dante_attributes/natural_unit");
        naturalUnits = response.data;
    } catch (error) {
        console.error("Error loading natural units:", error)
    }

    function formatNaturalUnit(naturalUnitId){
        if (!naturalUnitId) return "";
        const naturalUnit = naturalUnits.find(naturalUnit => naturalUnit.id === naturalUnitId) || null;
        return naturalUnit?.label ?? naturalUnitId;
    }

    // GET institutions ---------------------------------------------------------
    let institutions = [];
    try {
        const response = await axios.get("api/institutions");
        institutions = response.data;
    } catch (error) {
        console.error("Error loading institutions:", error)
    }

    // GET users ----------------------------------------------------------------
    let users = [];
    try {
        const response = await axios.get("api/users");
        users = response.data;
    } catch (error) {
        console.error("Error loading users:", error)
    }

    // GET coordinate systems ---------------------------------------------------
    await fetchDanteAttribute("coordinateSystem");

    function formatTaxonomy(taxonomyId){
        if (!taxonomyId) return "";
        const taxonomy = cachedTaxonomies.find(taxonomy => taxonomy.uri === taxonomyId) || null;
        return taxonomy?.prefLabel.en ?? taxonomyId;
    }

    // Create Table -------------------------------------------------------------
    siteTable = new Tabulator("#table", {
        height: "100%",
        data: sites,
        columns:[
            {formatter:"rowSelection", titleFormatter:"rowSelection", titleFormatterParams:{
                rowRange:"active" //only toggle the values of the active filtered rows
            }, hozAlign:"center", headerSort:false},
            {title:"id", field:"id", headerFilter:true, headerSort:false},
            {title:"*label", titleDownload:"label", field:"label", validator: ["required"], editor:"input", headerFilter:true, headerSortTristate:true},
            {title:"label abbreviation", titleDownload:"labelAbbreviation", field:"labelAbbreviation", editor:"input", headerFilter:true, headerSortTristate:true},
            {title:"activity number", titleDownload:"activityNumber", field:"activityNumber", editor:"input", headerFilter:true, headerSortTristate:true},
            {title:"site number", titleDownload:"siteNumber", field:"siteNumber", editor:"input", headerFilter:true, headerSortTristate:true},
            {title:"research project list (multiple selection)", titleDownload:"researchProjectList", field: "researchProjectList", headerSortTristate:true,
                mutator: function(value) {
                    // Map objects only to ids
                    return Array.isArray(value) ? value.map(item => item.id? item.id : item) : [];
                },
                editor:"list", editorParams:{
                    values: researchProjects.map(item => ({                    
                        value: item.id,
                        label: item.projectName
                    })),
                    autocomplete:false,
                    multiselect:true,
                    emptyValue:[]
                },
                headerFilter:"list", headerFilterParams: {
                    values: researchProjects.map(item => ({
                        value: item.id,
                        label: item.projectName
                    })),
                    multiselect: true
                },
                headerFilterFunc: function(headerValue, rowValue){
                    return headerValue.every(val => rowValue.includes(val));
                },
                sorter:"array", sorterParams:{
                    valueMap:"label"
                },
                formatter: cell => formatResearchProjects(cell.getValue()),
                accessorDownload: value => formatResearchProjects(value),
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
            {title:"taxonomy", field:"taxonomy.id", headerSort:false,
                editor:"list", editorParams:{
                    values: [ 
                        { value: null, label: "none" },
                        ...cachedTaxonomies.map(taxonomy => ({
                            value: taxonomy.uri,
                            label: taxonomy.prefLabel.en
                        }))
                    ],
                    emptyValue:null             
                },
                headerFilter:true, headerFilterParams: {
                    values: cachedTaxonomies.map(taxonomy => ({
                        value: taxonomy.uri,
                        label: taxonomy.prefLabel.en
                    })),
                    multiselect:true
                },
                headerFilterFunc: function(headerValue, rowValue) {
                    if (!headerValue || (Array.isArray(headerValue) && headerValue.length === 0)) {
                        return true;
                    }
                    return headerValue.includes(rowValue);
                },
                formatter: cell => formatTaxonomy(cell.getValue()),
                accessorDownload: value => formatTaxonomy(value),
            },
            {title: "site types (multiple selection)", titleDownload:"siteTypeList", field: "siteTypeList", headerSortTristate:true,
                mutator: function(value) {
                    // Map site type objects only to site type id
                    return Array.isArray(value) ? value.map(siteType => siteType.id? siteType.id : siteType) : [];
                },
                editor:"list", editorParams:{
                    values: [
                        ...siteTypes.map(siteType => ({
                            value: siteType.id,
                            label: siteType.label + (siteType.structuralConcept ? ` (${siteType.structuralConcept})` : "")
                        }))
                    ],
                    autocomplete:false,
                    multiselect:true,
                    emptyValue:[]
                },
                headerFilter:"list", headerFilterParams: {
                    values: [
                        ...siteTypes.map(siteType => ({
                            value: siteType.id,
                            label: siteType.label + (siteType.structuralConcept ? ` (${siteType.structuralConcept})` : "")
                        }))
                    ],
                    multiselect: true
                },
                headerFilterFunc: function(headerValue, rowValue){
                    return headerValue.every(val => rowValue.includes(val));
                },
                sorter:"array", sorterParams:{
                    valueMap:"label"
                },
                formatter: cell => formatSiteTypes(cell.getValue()),
                accessorDownload: value => formatSiteTypes(value),
            },
            {title:"site type uncertain", titleDownload:"siteTypeUncertain", field:"siteTypeUncertain", hozAlign:"center", headerSortTristate:true,
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
            {title:"natural unit", titleDownload:"naturalUnit", field:"naturalUnit.id", headerSortTristate:true,
                editor:"list", editorParams:{
                    values: [
                        { value: null, label: "none" },
                        ...naturalUnits.map(naturalUnit => ({
                            value: naturalUnit.id,
                            label: naturalUnit.label + (naturalUnit.naturalMainGroup ? ` (${naturalUnit.naturalMainGroup})` : "")
                        }))
                    ],
                    emptyValue:null             
                },
                headerFilter:true, headerFilterParams: {
                    values: naturalUnits.map(naturalUnit => ({
                        value: naturalUnit.id,
                        label: naturalUnit.label + (naturalUnit.naturalMainGroup ? ` (${naturalUnit.naturalMainGroup})` : "")
                    })),
                    multiselect:true
                },
                headerFilterFunc: function(headerValue, rowValue) {
                    if (!headerValue || (Array.isArray(headerValue) && headerValue.length === 0)) {
                        return true;
                    }
                    return headerValue.includes(rowValue);
                },
                formatter: cell => formatNaturalUnit(cell.getValue()),
                accessorDownload: value => formatNaturalUnit(value),
            },
            {title:"site condition undisturbed", titleDownload:"undisturbed", field:"undisturbed", hozAlign:"center", headerSortTristate:true,
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
            {title: "institution list (multiple selection)", titleDownload:"institutionList", field:"institutionList", headerSortTristate:true,
                mutator: function(value) {
                    // Map objects only to id
                    return Array.isArray(value) ? value.map(item => item.id? item.id : item) : [];
                },
                editor:"list", editorParams:{
                    values: [
                        ...institutions.map(item => ({
                            value: item.id,
                            label: item.label + (item.rorId ? ` (${item.rorId})` : "")
                        }))
                    ],
                    autocomplete:false,
                    multiselect:true,
                    emptyValue:[]
                },
                headerFilter:"list", headerFilterParams: {
                    values: institutions.map(item => ({
                            value: item.id,
                            label: item.label + (item.rorId ? ` (${item.rorId})` : "")
                    })),
                    multiselect: true
                },
                headerFilterFunc: function(headerValue, rowValue){
                    return headerValue.every(val => rowValue.includes(val));
                },
                sorter:"array", sorterParams:{
                    valueMap:"label"
                },
                formatter: cell => formatInst(institutions, cell.getValue()),
                accessorDownload: value => formatInst(institutions, value),
            },
            {title: "site directors (multiple selection)", titleDownload:"siteDirectors", field:"siteDirectors", headerSortTristate:true,
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
            {title: "archaeologists (multiple selection)", titleDownload:"archaeologists", field:"archaeologists", headerSortTristate:true,
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
            {title: "botanists (multiple selection)", titleDownload:"botanists", field:"botanists", headerSortTristate:true,
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
            {title:"remarks", field:"remarksSite", editor:"input", headerFilter:true, headerSort:false},
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
            {title:"remarks coordinate", titleDownload:"remarksCoordinate", field:"coordinate.remarksCoordinate", editor:"input", headerFilter:true, headerSortTristate:true},
            // Address ------------------------------------------------------------------------------------------------
            {title:"country", field:"address.country", editor:"input", headerFilter:true, headerSortTristate:true},
            {title:"county", field:"address.county", editor:"input", headerFilter:true, headerSortTristate:true},
            {title:"district", field:"address.district", editor:"input", headerFilter:true, headerSortTristate:true},
            {title:"parish", field:"address.parish", editor:"input", headerFilter:true, headerSortTristate:true},
            {title:"street or place", titleDownload:"streetOrPlace", field:"address.street_or_place", editor:"input", headerFilter:true, headerSortTristate:true},
            {title:"town", field:"address.town", editor:"input", headerFilter:true, headerSortTristate:true},
        ],
        initialSort: [
            {column: "label", dir: "asc"}
        ]
    });


    // Hide spinner
    spinner.style.display = 'none';
    // Show table
    tableContainer.style.display = 'flex';

    activeTable = "siteTable";


    // PUT: update site ---------------------------------------------------------
    siteTable.on("cellEdited", async function(cell){

        const editedField = cell.getField();
        const newValue = cell.getValue();

        // Update all selected rows ------------------------------
        const selectedRows = siteTable.getSelectedRows();
        const editedRow = cell.getRow();
        if (!selectedRows.includes(editedRow)) {
            selectedRows.push(editedRow);
        }
        selectedRows.forEach(row => {
            
            // Create payload
            const site = row.getData();
            const siteId = site.id;
            // Map ids back to objects
            const researchProjectsAsObjects = (site.researchProjectList || []).map(item => typeof item === "string"
                ? { id: item }
                : item);
            const literatureAsObjects = (site.literatureList || []).map(item => typeof item === "string"
                ? { id: item,
                    doi: literature.find(lit => lit.id === item).doi,
                    publicationYear: literature.find(lit => lit.id === item).publicationYear,
                    title: literature.find(lit => lit.id === item).title,
                    shortCitation: literature.find(lit => lit.id === item).shortCitation,
                    longCitation: literature.find(lit => lit.id === item).longCitation,
                    litAbstract: literature.find(lit => lit.id === item).litAbstract,
                  }
                : item);
            const siteTypeListAsObjects = (site.siteTypeList || []).map(siteType => typeof siteType === "string"
                ? { id: siteType }
                : siteType);
            const naturalUnitAsObject = typeof site.naturalUnit  === "string"
            ? { id: site.naturalUnit }
            : site.naturalUnit;
            const institutionsAsObjects = (site.institutionList || []).map(item => typeof item === "string"
                ? { id: item,
                    label: institutions.find(inst => inst.id === item).label,
                    rorId: institutions.find(inst => inst.id === item).rorId
                  }
                : item);
            const siteDirectorsAsObjects = (site.siteDirectors || []).map(item => typeof item === "string"
                ? { id: item }
                : item);
            const archaeologistsAsObjects = (site.archaeologists || []).map(item => typeof item === "string"
                ? { id: item }
                : item);
            const botanistsAsObjects = (site.botanists || []).map(item => typeof item === "string"
                ? { id: item }
                : item);
            const crs = cachedCoordinateSystems.find(crs => crs.uri === site.coordinate.coordinateSystem.id);
            const coordinateSystemAsObject = crs
            ? {
                id: crs.uri,
                label: [crs.prefLabel?.en, crs.notation].filter(Boolean).join(" - ")
              }
            : null;

            const payload = {
                ...site,
                researchProjectList: researchProjectsAsObjects,
                literatureList: literatureAsObjects,
                siteTypeList: siteTypeListAsObjects,
                naturalUnit: naturalUnitAsObject,
                institutionList: institutionsAsObjects,
                siteDirectors: siteDirectorsAsObjects,
                archaeologists: archaeologistsAsObjects,
                botanists: botanistsAsObjects,
                coordinate: {
                    coordinateSystem: coordinateSystemAsObject,
                    longitude: site.coordinate.longitude,
                    longitudeWgs84: site.coordinate.longitudeWgs84,
                    latitude: site.coordinate.latitude,
                    latitudeWgs84: site.coordinate.latitudeWgs84,
                    altitude: site.coordinate.altitude,
                    remarksCoordinate: site.coordinate.remarksCoordinate,
                },
                address: {
                    country: site.address.country,
                    county: site.address.county,
                    district: site.address.district,
                    parish: site.address.parish,
                    street_or_place: site.address.street_or_place,
                    town: site.address.town,
                },
            };
    
            axios.put(`api/sites/${siteId}`, JSON.stringify(payload), {
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
            .catch(error => console.error(`Error updating site {siteId}:`, error));
        });
    });


    // Delete rows --------------------------------------------------------------
    const deleteButton = document.getElementById("deleteRows-button");
    
    // Only show deleteButton if at least one row is selected
    siteTable.on("rowSelectionChanged", function(rows){
        deleteButton.classList.toggle("hidden", rows.length === 0);
    });

    deleteButton.addEventListener("click", function() {
        
        const selectedRows = siteTable.getSelectedRows();
        selectedRows.forEach(row => {
            // Get id
            const siteId = row.getData().id;

            axios.delete(`api/sites/${siteId}`)
            .then(response => {
                console.log(response.data);
                row.delete();
            })
            .catch(error => {
                console.error(`Error deleting site ${siteId}:`, error);
            });            
        });
    });
}

// Export table -----------------------------------------------------------------
document.getElementById("download-json").addEventListener("click", function(){
    if (activeTable === "siteTable") {
        const rawData = siteTable.getData("active");
        
        const transformed = rawData.map(row => {
            // Taxonomy
            const taxonomyId = row.taxonomy?.id ?? null;
            const taxonomy   = cachedTaxonomies.find(taxonomy => taxonomy.uri === taxonomyId);
            // Natural unit
            const naturalUnitId     = row.naturalUnit?.id ?? null;
            const naturalUnitValues = siteTable.getColumn("naturalUnit.id").getDefinition().editorParams.values;
            const naturalUnit       = naturalUnitValues.find(nu => nu.value === naturalUnitId);
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
            
            return {
                id: row.id,
                label: row.label,
                labelAbbreviation: row.labelAbbreviation,
                activityNumber: row.activityNumber,
                siteNumber: row.siteNumber,
                researchProjectList: (row.researchProjectList || []).map(researchProjectId => {
                    const researchProjectValues = siteTable.getColumn("researchProjectList").getDefinition().editorParams.values;
                    const researchProject = researchProjectValues.find(rp => rp.value === researchProjectId);
                    return { id: researchProjectId, name: researchProject?.label };
                }),
                literatureList: (row.literatureList || []).map(literatureId => {
                    const literatureValues = siteTable.getColumn("literatureList").getDefinition().editorParams.values;
                    const literature = literatureValues.find(l => l.value === literatureId);
                    return { id: literatureId, name: literature?.label };
                }),
                taxonomy: taxonomyId
                    ? { id: taxonomyId, label: taxonomy?.prefLabel?.en ?? "" }
                    : null,
                siteTypes: (row.siteTypeList || []).map(siteTypeId => {
                    const siteTypeValues = siteTable.getColumn("siteTypeList").getDefinition().editorParams.values;
                    const siteType = siteTypeValues.find(st => st.value === siteTypeId);
                    return { id: siteTypeId, name: siteType?.label };
                }),
                siteTypeUncertain: row.siteTypeUncertain,
                naturalUnit: naturalUnitId
                    ? { id: naturalUnitId, name: naturalUnit?.label}
                    : null,
                undisturbed: row.undisturbed,
                institutionList: (row.institutionList || []).map(institutionId => {
                    const institutionValues = siteTable.getColumn("institutionList").getDefinition().editorParams.values;
                    const institution = institutionValues.find(i => i.value === institutionId);
                    return { id: institutionId, name: institution?.label };
                }),
                siteDirectors: (row.siteDirectors || []).map(siteDirectorId => {
                    const siteDirectorValues = siteTable.getColumn("siteDirectors").getDefinition().editorParams.values;
                    const siteDirector = siteDirectorValues.find(sd => sd.value === siteDirectorId);
                    return { id: siteDirectorId, name: siteDirector?.label };
                }),
                archaeologists: (row.archaeologists || []).map(archaeologistId => {
                    const archaeologistValues = siteTable.getColumn("archaeologists").getDefinition().editorParams.values;
                    const archaeologist = archaeologistValues.find(a => a.value === archaeologistId);
                    return { id: archaeologistId, name: archaeologist?.label };
                }),
                botanists: (row.botanists || []).map(botanistId => {
                    const botanistValues = siteTable.getColumn("botanists").getDefinition().editorParams.values;
                    const botanist = botanistValues.find(b => b.value === botanistId);
                    return { id: botanistId, name: botanist?.label };
                }),
                remarks: row.remarksSite,
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
                address: row.address
                    ? {
                        country:       row.address.country,
                        county:        row.address.county,
                        district:      row.address.district,
                        parish:        row.address.parish,
                        streetOrPlace: row.address.street_or_place,
                        town:          row.address.town,
                    }
                    : null,
            };
        });

        const blob = new Blob([JSON.stringify(transformed, null, 4)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "ArboDat+_Download_Sites.json";
        a.click();
        // Revoke later: WebKit (macOS app window) cancels downloads whose blob URL is already revoked.
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
});

document.getElementById("download-csv").addEventListener("click", function(){
    if (activeTable === "siteTable") {
        siteTable.download(
            "csv", "ArboDat+_Download_Sites.csv"
        );
    }    
});    

document.getElementById("download-xlsx").addEventListener("click", function(){
    if (activeTable === "siteTable") {
        siteTable.download(
            "xlsx",
            "ArboDat+_Download_Sites.xlsx",
            {sheetName:"ArboDat+ Sites"}
        );
    }
});

document.getElementById("download-html").addEventListener("click", function(){
    if (activeTable === "siteTable") {
        siteTable.download(
            "html",
            "ArboDat+_Download_Sites.html",
        );
    }
});
