let institutionTable;

async function buildInstitutionTable() {
    const container = document.getElementById("table");
    const spinner = document.getElementById('tableSpinner');
    const tableContainer = document.querySelector('.table-container');
    container.innerHTML = "";
    spinner.style.display = 'block';
    tableContainer.style.display = 'none';

    // GET institutions ---------------------------------------------------------
    let institutions = [];
    try {
        const response = await axios.get("api/institutions");
        institutions = response.data;
    } catch (error) {
        console.error("Error loading institutions:", error);
    }

    // Create Table -------------------------------------------------------------
    institutionTable = new Tabulator("#table", {
        height: "100%",
        data: institutions,
        columns:[
            {formatter:"rowSelection", titleFormatter:"rowSelection",
                titleFormatterParams:{
                    rowRange:"active" //only toggle the values of the active filtered rows
                }, hozAlign:"center", headerSort:false
            },
            {title:"id", field:"id", headerFilter:true, headerSort:false},
            {title:"*label", titleDownload:"label", field:"label", validator: ["required"], editor:"input", headerFilter:true, headerSortTristate:true},
            {title:"ror id", titleDownload:"rorId", field:"rorId", editor:"input", headerFilter:true, headerSortTristate:true},
        ],
        initialSort: [
            {column: "label", dir: "asc"}
        ]
    }); // ----------------------------------------------------------------------


    // Hide spinner
    spinner.style.display = 'none';
    // Show table
    tableContainer.style.display = 'flex';

    activeTable = "institutionTable";


    // PUT: update institutions -------------------------------------------------
    institutionTable.on("cellEdited", async function(cell){

        const editedField = cell.getField();
        const newValue = cell.getValue();

        // Update all selected rows ------------------------------
        const selectedRows = institutionTable.getSelectedRows();
        const editedRow = cell.getRow();
        if (!selectedRows.includes(editedRow)) {
            selectedRows.push(editedRow);
        }
        selectedRows.forEach(row => {
            
            // Create payload
            const institution = row.getData();
            const institutionId = institution.id;
            const payload = {
                ...institution,
            };
    
            axios.put(`api/institutions/${institutionId}`, JSON.stringify(payload), {
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
            .catch(error => console.error("Error updating institution:", error));
        });
    });

    // Delete rows --------------------------------------------------------------
    const deleteButton = document.getElementById("deleteRows-button");
    
    // Only show deleteButton if at least one row is selected
    institutionTable.on("rowSelectionChanged", function(rows){
        deleteButton.classList.toggle("hidden", rows.length === 0);
    });

    deleteButton.addEventListener("click", function() {
        
        const selectedRows = institutionTable.getSelectedRows();
        selectedRows.forEach(row => {
            // Get id
            const institutionId = row.getData().id;

            axios.delete(`api/institutions/${institutionId}`)
            .then(response => {
                console.log(response.data);
                row.delete();
            })
            .catch(error => {
                console.error('Error deleting institution:', error);
            });            
        });
    });
}

// Export table -----------------------------------------------------------------
document.getElementById("download-json").addEventListener("click", function(){
    if (activeTable === "institutionTable") {
        institutionTable.download(
            "json",
            "ArboDat+_Download_Institutions.json"
        );
    }
});

document.getElementById("download-csv").addEventListener("click", function(){
    if (activeTable === "institutionTable") {
        institutionTable.download(
            "csv",
            "ArboDat+_Download_Institutions.csv"
        );
    }
});

document.getElementById("download-xlsx").addEventListener("click", function(){
    if (activeTable === "institutionTable") {
        institutionTable.download(
            "xlsx",
            "ArboDat+_Download_Institutions.xlsx",
            {sheetName:"ArboDat+ Institutions"}
        );
    }
});

document.getElementById("download-html").addEventListener("click", function(){
    if (activeTable === "institutionTable") {
        institutionTable.download(
            "html",
            "ArboDat+_Download_Institutions.html"
        );
    }
});
