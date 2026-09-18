let authorTable;

async function buildAuthorTable() {
    const container = document.getElementById("table");
    const spinner = document.getElementById('tableSpinner');
    const tableContainer = document.querySelector('.table-container');
    container.innerHTML = "";
    spinner.style.display = 'block';
    tableContainer.style.display = 'none';

    // GET authors --------------------------------------------------------------
    let authors = [];
    try {
        const response = await axios.get("api/authors");
        authors = response.data;
    } catch (error) {
        console.error("Error loading authors:", error);
    }

    // Create Table -------------------------------------------------------------
    authorTable = new Tabulator("#table", {
        height: "100%",
        data: authors,
        columns:[
            {formatter:"rowSelection", titleFormatter:"rowSelection", titleFormatterParams:{
                rowRange:"active" //only toggle the values of the active filtered rows
            }, hozAlign:"center", headerSort:false},
            {title:"id", field:"id", headerFilter:true, headerSort:false},
            {title:"first name", titleDownload:"firstName", field:"firstName", editor:"input", headerFilter:true, headerSortTristate:true},
            {title:"middle name", titleDownload:"middleName", field:"middleName", editor:"input", headerFilter:true, headerSortTristate:true},
            {title:"*last name", titleDownload:"lastName", field:"lastName", validator: ["required"], editor:"input", headerFilter:true, headerSortTristate:true},
        ],
        initialSort: [
            {column: "lastName", dir: "asc"}
        ]
    }); // ----------------------------------------------------------------------


    // Hide spinner
    spinner.style.display = 'none';
    // Show table
    tableContainer.style.display = 'flex';

    activeTable = "authorTable";


    // PUT: update authors -------------------------------------------------
    authorTable.on("cellEdited", async function(cell){

        const editedField = cell.getField();
        const newValue = cell.getValue();

        // Update all selected rows
        const selectedRows = authorTable.getSelectedRows();
        const editedRow = cell.getRow();
        if (!selectedRows.includes(editedRow)) {
            selectedRows.push(editedRow);
        }
        selectedRows.forEach(row => {
            
            // Create payload
            const author = row.getData();
            const authorId = author.id;
            const payload = {
                ...author,
            };
    
            axios.put(`api/authors/${authorId}`, JSON.stringify(payload), {
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
            .catch(error => console.error("Error updating author:", error));
        });
    });

    // Delete rows --------------------------------------------------------------
    const deleteButton = document.getElementById("deleteRows-button");
    
    // Only show deleteButton if at least one row is selected
    authorTable.on("rowSelectionChanged", function(rows){
        deleteButton.classList.toggle("hidden", rows.length === 0);
    });

    deleteButton.addEventListener("click", function() {
        
        const selectedRows = authorTable.getSelectedRows();
        selectedRows.forEach(row => {
            // Get id
            const authorId = row.getData().id;

            axios.delete(`api/authors/${authorId}`)
            .then(response => {
                console.log(response.data);
                row.delete();
            })
            .catch(error => {
                console.error('Error deleting author:', error);
            });            
        });
    });
}

// Export table -----------------------------------------------------------------
document.getElementById("download-json").addEventListener("click", function(){
    if (activeTable === "authorTable") {
        authorTable.download(
            "json",
            "ArboDat+_Download_Authors.json"
        );
    }
});

document.getElementById("download-csv").addEventListener("click", function(){
    if (activeTable === "authorTable") {
        authorTable.download(
            "csv",
            "ArboDat+_Download_Authors.csv"
        );
    }
});


document.getElementById("download-xlsx").addEventListener("click", function(){
    if (activeTable === "authorTable") {
        authorTable.download(
            "xlsx",
            "ArboDat+_Download_Authors.xlsx",
            {sheetName:"ArboDat+ Authors"}
        );
    }
});

document.getElementById("download-html").addEventListener("click", function(){
    if (activeTable === "authorTable") {
        authorTable.download(
            "html",
            "ArboDat+_Download_Authors.html"
        );
    }
});
