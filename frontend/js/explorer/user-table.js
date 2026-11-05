let userTable;

async function buildUserTable() {
    const container = document.getElementById("table");
    const spinner = document.getElementById('tableSpinner');
    const tableContainer = document.querySelector('.table-container');
    container.innerHTML = "";
    spinner.style.display = 'block';
    tableContainer.style.display = 'none';

    // GET users ----------------------------------------------------------------
    let users = [];
    try {
        const response = await axios.get("api/users");
        users = response.data;
    } catch (error) {
        console.error("Error loading users:", error);
    }

    // GET institutions ---------------------------------------------------------
    let institutions = [];
    try {
        const response = await axios.get("api/institutions");
        institutions = response.data;
    } catch (error) {
        console.error("Error loading institutions:", error)
    }

    // Create Table -------------------------------------------------------------
    userTable = new Tabulator("#table", {
        height: "100%",
        data: users,
        columns:[
            {cssClass:"selectionColumn", formatter:"rowSelection", titleFormatter:"rowSelection", titleFormatterParams:{
                rowRange:"active" //only toggle the values of the active filtered rows
            }, hozAlign:"center", headerSort:false},
            {title:"id", field:"id", headerFilter:true, headerSort:false},
            {title:"first name", titleDownload:"firstName", field:"firstName", editor:"input", headerFilter:true, headerSortTristate:true},
            {title:"middle name", titleDownload:"middleName", field:"middleName", editor:"input", headerFilter:true, headerSortTristate:true},
            {title:"*last name", titleDownload:"lastName", field:"lastName", validator: ["required"], editor:"input", headerFilter:true, headerSortTristate:true},
            {title:"mail address", titleDownload:"mailAddress", field:"mailAddress", editor:"input", headerFilter:true, headerSortTristate:true},
            {title:"ORCID", field:"orcid", editor:"input", headerFilter:true, headerSortTristate:true},
            {title: "institution list (multiple selection)", titleDownload:"institutionList", field:"institutionList", headerSortTristate:true,
                mutator: function(value) {
                    // Map site type objects only to site type id
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
        ],
        initialSort: [
            {column: "lastName", dir: "asc"}
        ]
    });

    // Hide spinner
    spinner.style.display = 'none';
    // Show table
    tableContainer.style.display = 'flex';

    activeTable = "userTable";


    // PUT: update users --------------------------------------------------------
    userTable.on("cellEdited", async function(cell){

        const editedField = cell.getField();
        const newValue = cell.getValue();

        const selectedRows = await getRowsToUpdate(userTable, cell, "user", "users");
        if (!selectedRows) return;
        selectedRows.forEach(row => {
            
            // Create payload
            const user = JSON.parse(JSON.stringify(row.getData()));
            setNestedValue(user, editedField, newValue); // other selected rows do not contain the new value yet
            const userId = user.id;

            // Map institution ids back to institution objects
            const institutionsAsObjects = (user.institutionList || []).map(item => typeof item === "string"
                ? { id: item, label: institutions.find(inst => inst.id === item).label, rorId: institutions.find(inst => inst.id === item).rorId }
                : item);

            const { institutionList, ...userWithoutInstitutions } = user;

            // Create FormData object
            const formData = new FormData();
            
            formData.append("transferredUser", new Blob([JSON.stringify(userWithoutInstitutions)], { type: "application/json" }));
            formData.append("institutionList", new Blob([JSON.stringify(institutionsAsObjects)], { type: "application/json" }));
    
            axios.put(`api/users/${userId}`, formData, {
                headers: {
                    "Content-Type": 'multipart/form-data'
                }
            })
            .then(async response => {
                console.log(response.data);
                
                // Update table
                if(row !== cell.getRow()) { // skip the edited line
                    updateRowField(row, editedField, newValue);
                }
            })
            .catch(error => handleUpdateError(cell, row, "user", error));
        });
    });

    // Delete rows --------------------------------------------------------------
    const deleteButton = document.getElementById("deleteRows-button");
    
    // Only show deleteButton if at least one row is selected
    userTable.on("rowSelectionChanged", function(rows){
        deleteButton.classList.toggle("hidden", rows.length === 0);
    });

    // onclick (not addEventListener): the button is shared by all tables
    deleteButton.onclick = async function() {
        const selectedRows = userTable.getSelectedRows();
        if (!await confirmDelete("user", selectedRows.length)) return;

        selectedRows.forEach(row => {
            // Get id
            const userId = row.getData().id;

            axios.delete(`api/users/${userId}`)
            .then(async response => {
                console.log(response.data);
                await row.delete();
                // Deleting a row does not fire rowSelectionChanged
                deleteButton.classList.toggle("hidden", userTable.getSelectedRows().length === 0);
            })
            .catch(error => {
                handleDeleteError("user", error);
            });            
        });
    };
}

// Export table -----------------------------------------------------------------
document.getElementById("download-json").addEventListener("click", function(){
    if (activeTable === "userTable") {
        const rawData = userTable.getData("active");
    
        const transformed = rawData.map(row => {
            
            return {
                id: row.id,
                firstName: row.firstName,
                middleName: row.middleName,
                lastName: row.lastName,
                mailAddress: row.mailAddress,
                orcid: row.orcid,
                institutionList: (row.institutionList || []).map(institutionId => {
                    const institutionValues = userTable.getColumn("institutionList").getDefinition().editorParams.values;
                    const institution = institutionValues.find(i => i.value === institutionId);
                    return { id: institutionId, name: institution?.label };
                }),
            };
        });

        const blob = new Blob([JSON.stringify(transformed, null, 4)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "ArboDat+_Download_Users.json";
        a.click();
        // Revoke later: WebKit (macOS app window) cancels downloads whose blob URL is already revoked.
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
});

document.getElementById("download-csv").addEventListener("click", function(){
    if (activeTable === "userTable") {
        userTable.download(
            "csv",
            "ArboDat+_Download_User.csv"
        );
    }
});

document.getElementById("download-xlsx").addEventListener("click", function(){
    if (activeTable === "userTable") {
        userTable.download(
            "xlsx",
            "ArboDat+_Download_User.xlsx",
            {sheetName:"ArboDat+ User"}
        );
    }
});

document.getElementById("download-html").addEventListener("click", function(){
    if (activeTable === "userTable") {
        userTable.download(
            "html",
            "ArboDat+_Download_User.html"
        );
    }
});
