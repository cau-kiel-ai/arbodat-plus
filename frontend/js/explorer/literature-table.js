let literatureTable;

async function buildLiteratureTable() {
    const container = document.getElementById("table");
    const spinner = document.getElementById('tableSpinner');
    const tableContainer = document.querySelector('.table-container');
    container.innerHTML = "";
    spinner.style.display = 'block';
    tableContainer.style.display = 'none';

    // GET literature -----------------------------------------------------------
    let literature = [];
    try {
        const response = await axios.get("api/literature");
        literature = response.data;
    } catch (error) {
        console.error("Error loading literature:", error);
    }

    // GET authors --------------------------------------------------------------
    let authors = [];
    try {
        const response = await axios.get("api/authors");
        authors = response.data;
    } catch (error) {
        console.error("Error loading authors:", error)
    }
    
    function formatAuth(authorList) {
        if (!authorList) return "";

        // HTML download
        if (!Array.isArray(authorList)) return authorList;

        return authorList
            .map(id => {
                const author = authors.find(author => author.id === id)
                return formatName(author) ?? id ?? "";
            })
            .filter(Boolean)
            .join(", ");
    }

    // Create year list for publication year ------------------------------------
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let year = currentYear; year >= 0; year--) {
    years.push(year);
    }

    // Create Table -------------------------------------------------------------
    literatureTable = new Tabulator("#table", {
        height: "100%",
        data: literature,
        columns:[
            {formatter:"rowSelection", titleFormatter:"rowSelection", titleFormatterParams:{
                rowRange:"active" //only toggle the values of the active filtered rows
            }, hozAlign:"center", headerSort:false},
            {title:"id", field:"id", headerFilter:true, headerSort:false},
            {title:"*title", titleDownload:"title", field:"title", validator: ["required"], editor:"input", headerFilter:true, headerSortTristate:true},
            {title:"publication year", titleDownload:"publicationYear", field:"publicationYear", headerSortTristate:true,
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
            {title: "authors (multiple selection)", titleDownload:"authorList", field:"authorList", headerSortTristate:true,
                mutator: function(value) {
                    // Map objects only to id
                    return Array.isArray(value) ? value.map(item => item.id? item.id : item) : [];
                },
                editor:"list", editorParams:{
                    values: [
                        ...authors.map(item => ({
                            value: item.id,
                            label: formatName(item)
                        }))
                    ],
                    autocomplete:false,
                    multiselect:true,
                    emptyValue:[]
                },
                headerFilter:"list", headerFilterParams: {
                    values: authors.map(item => ({
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
                formatter: cell => formatAuth(cell.getValue()),
                accessorDownload: value => formatAuth(value),
            },
            {title:"doi", field:"doi", editor:"input", headerFilter:true, headerSortTristate:true},
            {title:"short citation", titleDownload:"shortCitation", field:"shortCitation", editor:"input", headerFilter:true, headerSortTristate:true},
            {title:"long citation", titleDownload:"longCitation", field:"longCitation", editor:"input", headerFilter:true, headerSortTristate:true},
            {title:"abstract", field:"litAbstract", editor:"input", headerFilter:true, headerSort:false},
        ],
        initialSort: [
            {column: "title", dir: "asc"}
        ]
    });


    // Hide spinner
    spinner.style.display = 'none';
    // Show table
    tableContainer.style.display = 'flex';

    activeTable = "literatureTable";


    // PUT: update literature -------------------------------------------------
    literatureTable.on("cellEdited", async function(cell){

        const editedField = cell.getField();
        const newValue = cell.getValue();

        // Update all selected rows ------------------------------
        const selectedRows = literatureTable.getSelectedRows();
        const editedRow = cell.getRow();
        if (!selectedRows.includes(editedRow)) {
            selectedRows.push(editedRow);
        }
        selectedRows.forEach(row => {
            
            // Create payload
            const literature = row.getData();
            const literatureId = literature.id;

            // Map author ids back to author objects
            const authorsAsObjects = (literature.authorList || []).map(item => typeof item === "string"
                ? {
                    id: item,
                    firstName: authors.find(auth => auth.id === item).firstName,
                    middleName: authors.find(auth => auth.id === item).middleName,
                    lastName: authors.find(auth => auth.id === item).lastName,
                 }
                : item);

            const { authorList, ...literatureWithoutAuthorList } = literature;

            // Create FormData object
            const formData = new FormData();
            
            formData.append("transferredLiterature", new Blob([JSON.stringify(literatureWithoutAuthorList)], { type: "application/json" }));
            formData.append("authorList", new Blob([JSON.stringify(authorsAsObjects)], { type: "application/json" }));

            axios.put(`api/literature/${literatureId}`, formData, {
                headers: {
                    "Content-Type": 'multipart/form-data'
                }
            })
            .then(async response => {
                console.log(response.data);
                
                // Update table
                if(row !== cell.getRow()) { // skip the edited line
                    row.update({ [editedField]: newValue });
                }
            })
            .catch(error => console.error("Error updating literature:", error));
        });
    });

    // Delete rows --------------------------------------------------------------
    const deleteButton = document.getElementById("deleteRows-button");
    
    // Only show deleteButton if at least one row is selected
    literatureTable.on("rowSelectionChanged", function(rows){
        deleteButton.classList.toggle("hidden", rows.length === 0);
    });

    deleteButton.addEventListener("click", function() {
        
        const selectedRows = literatureTable.getSelectedRows();
        selectedRows.forEach(row => {
            // Get id
            const literatureId = row.getData().id;

            axios.delete(`api/literature/${literatureId}`)
            .then(response => {
                console.log(response.data);
                row.delete();
            })
            .catch(error => {
                console.error('Error deleting literature:', error);
            });            
        });
    });
}

// Export table -----------------------------------------------------------------
document.getElementById("download-json").addEventListener("click", function(){
    if (activeTable === "literatureTable") {
        const rawData = literatureTable.getData("active");
    
        const transformed = rawData.map(row => {
            
            return {
                id: row.id,
                title: row.title,
                publicationYear: row.publicationYear,
                authorList: (row.authorList || []).map(authorId => {
                    const authorValues = literatureTable.getColumn("authorList").getDefinition().editorParams.values;
                    const author = authorValues.find(a => a.value === authorId);
                    return { id: authorId, name: author?.label ?? "" };
                }),
                doi: row.doi,
                shortCitation: row.shortCitation,
                longCitation: row.longCitation,
                abstract: row.abstract,
            };
        });

        const blob = new Blob([JSON.stringify(transformed, null, 4)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "ArboDat+_Download_Literature.json";
        a.click();
        // Revoke later: WebKit (macOS app window) cancels downloads whose blob URL is already revoked.
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
});

document.getElementById("download-csv").addEventListener("click", function(){
    if (activeTable === "literatureTable") {
        literatureTable.download(
            "csv",
            "ArboDat+_Download_Literature.csv"
        );
    }    
});    

document.getElementById("download-xlsx").addEventListener("click", function(){
    if (activeTable === "literatureTable") {
        literatureTable.download(
            "xlsx",
            "ArboDat+_Download_Literature.xlsx",
            {sheetName:"ArboDat+ Literature"}
        );
    }
});

document.getElementById("download-html").addEventListener("click", function(){
    if (activeTable === "literatureTable") {
        literatureTable.download(
            "html",
            "ArboDat+_Download_Literature.html"            
        );
    }
});
