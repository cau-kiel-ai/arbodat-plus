// global lists
window.siteLiteratureList = [];
window.absoluteDatingLiteratureList = [];

document.getElementById("addLiteratureButtonSite").addEventListener("click", function () {
    addLiterature({
        selectElementId: "siteLiterature",
        containerId: "siteLiteratureContainer",
        listName: "siteLiteratureList"
    });
});

document.getElementById("addLiteratureButtonAbsoluteDating").addEventListener("click", function () {
    addLiterature({
        selectElementId: "datingLiterature",
        containerId: "absDating_literature_container",
        listName: "absoluteDatingLiteratureList"
    });
});

function addLiterature({ selectElementId, containerId, listName }) {    
    const selectElement = document.getElementById(selectElementId);
    const selectedOption = selectElement.options[selectElement.selectedIndex];
    const literatureId = selectElement.value;
    const list = window[listName];

    if (!literatureId) {
        toast.info("Select a existing literature from the database or create a new one.");
        return;
    }

    // Check if the item is already in the container ----------------
    const existingItem = list.find(item => item.id === literatureId);
    if (existingItem) {
        // Reset dropdown
        selectElement.value = "";
        selectElement.textContent = "";

        toast.info("This Literature has already been added.");
        return;
    } // ------------------------------------------------------------

    // Get text content of selected item
    const itemText = selectedOption.text;

    // Create JSON object to store the data
    const data = { id: literatureId };
    
    // Save object into the global list
    const index = list.push(data) - 1;

    addLiteratureItemBox(itemText, index, listName, containerId);

    // Reset dropdown
    selectElement.value       = "";
    selectElement.textContent = "";
};

function addLiteratureItemBox(itemText, index, listName, containerId) {
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
                onclick="deleteLiterature(this, ${index}, '${listName}')"
                aria-label="Remove Literature"
            >
                &#10005;
            </button>
        </div>
    `;
    
    document.getElementById(containerId).appendChild(itemBox);
}

function deleteLiterature(deleteIcon, index, listName) {
    // Find the itemBox and remove it
    const itemBox = deleteIcon.closest(".item-box");
    itemBox.remove();

    // Remove item from the gloabl list with index
    if (index !== -1) {
        window[listName].splice(index, 1);
    }
}
