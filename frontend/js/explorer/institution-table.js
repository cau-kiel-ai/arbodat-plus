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
    institutionTable = newTabulator("#table", {
        height: "100%",
        data: institutions,
        columns:[
            {cssClass:"selectionColumn", formatter:"rowSelection", titleFormatter:"rowSelection",
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

        const selectedRows = await getRowsToUpdate(institutionTable, cell, "institution", "institutions");
        if (!selectedRows) return;
        selectedRows.forEach(row => {
            
            // Create payload
            const institution = JSON.parse(JSON.stringify(row.getData()));
            setNestedValue(institution, editedField, newValue); // other selected rows do not contain the new value yet
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
                    updateRowField(row, editedField, newValue);
                }
            })
            .catch(error => handleUpdateError(cell, row, "institution", error));
        });
    });

    // Delete rows --------------------------------------------------------------
    const deleteButton = document.getElementById("deleteRows-button");
    
    // Only show deleteButton if at least one row is selected
    institutionTable.on("rowSelectionChanged", function(rows){
        deleteButton.classList.toggle("hidden", rows.length === 0);
    });

    // onclick (not addEventListener): the button is shared by all tables
    deleteButton.onclick = async function() {
        const selectedRows = institutionTable.getSelectedRows();
        if (!await confirmDelete("institution", selectedRows.length)) return;

        selectedRows.forEach(row => {
            // Get id
            const institutionId = row.getData().id;

            axios.delete(`api/institutions/${institutionId}`)
            .then(async response => {
                console.log(response.data);
                await row.delete();
                // Deleting a row does not fire rowSelectionChanged
                deleteButton.classList.toggle("hidden", institutionTable.getSelectedRows().length === 0);
            })
            .catch(error => {
                handleDeleteError("institution", error);
            });            
        });
    };
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
