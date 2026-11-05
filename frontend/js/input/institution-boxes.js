// global lists
window.institutionList = [];
window.siteInstitutionList = [];

document.getElementById("addInstitutionButton").addEventListener("click", function () {
    addInstitution({
        institutionInputId: "userInstitutions",
        containerId: "institutionContainer",
        listName: "institutionList"
    });
});

document.getElementById("addInstitutionButtonSite")?.addEventListener("click", function () {
    addInstitution({
        institutionInputId: "siteInstitutions",
        containerId: "siteInstitutionContainer",
        listName: "siteInstitutionList"
    });
});

function addInstitution({ institutionInputId, containerId, listName } ) {    
    const selectElement = document.getElementById(institutionInputId);
    const selectedOption = selectElement.options[selectElement.selectedIndex];
    const institutionId = selectElement.value;
    const list = window[listName];

    if (!institutionId) {
        toast.info("Select a existing institution from the database or create a new one.");
        return;
    }

    // Check if the item is already in the container ------------------------
    const existingInstitution = list.find(inst => inst.id === institutionId);
    if (existingInstitution) {
        // Reset dropdown
        selectElement.value       = "";
        selectElement.textContent = "";

        toast.info("This institution has already been added.");
        return;
    } // --------------------------------------------------------------------

    // Get text content of selected item
    const itemText = selectedOption.text;

    // Create JSON object to store the data
    const data = { id: institutionId };

    // Save object into the global list
    const index = list.push(data) - 1;

    addInstitutionItemBox(itemText, index, listName, containerId);

    // Reset dropdown
    selectElement.value       = "";
    selectElement.textContent = "";
}

function addInstitutionItemBox(itemText, index, listName, containerId) {
    // Display the saved item in a box under the form
    const itemBox = document.createElement("div");
    itemBox.classList.add("item-box");

    itemBox.style.border          = "2px solid #ccc";
    itemBox.style.borderRadius    = "4px";
    itemBox.style.padding         = "12px";
    itemBox.style.marginTop       = "6px";
    itemBox.style.marginBottom    = "6px";
    itemBox.style.backgroundColor = "#f9f9f9";
    itemBox.style.height          = "52px";
    
    itemBox.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
            <span
                style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0;"
            >
                ${escapeHtml(itemText)}
            </span>
            <button
                type="button"
                style="
                    color: red;
                    cursor: pointer;
                    transform: translateX(6px);
                    background: none;
                    border: none;
                "
                onclick="deleteInstitution(this, ${index}, '${listName}')"
                aria-label="Remove Institution"
            >
                &#10005;
            </button>
        </div>
    `;

    document.getElementById(containerId).appendChild(itemBox);
}

function deleteInstitution(deleteIcon, index, listName) {
    // Find the itemBox and remove it
    const itemBox = deleteIcon.closest(".item-box");
    itemBox.remove();
    
    if (index !== -1) {
        window[listName].splice(index, 1);
    }
}
