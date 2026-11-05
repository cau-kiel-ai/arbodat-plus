// global lists
window.siteDirectorList = [];
window.siteArcheologistList = [];
window.siteBotanistList = [];
window.sampleBotanicalDeterminationByList = [];

document.getElementById("addSiteDirectorButton").addEventListener("click", function () {
    addUser({
        selectElementId: "siteDirectors",
        containerId: "siteDirectorContainer",
        listName: "siteDirectorList"
    });
});

document.getElementById("addArcheologistButton").addEventListener("click", function () {
    addUser({
        selectElementId: "archeologists",
        containerId: "ArcheologistContainer",
        listName: "siteArcheologistList"
    });
});

document.getElementById("addBotanistButton").addEventListener("click", function () {
    addUser({
        selectElementId: "botanists",
        containerId: "BotanistContainer",
        listName: "siteBotanistList"
    });
});

document.getElementById("addBotanicalDeterminationByButton").addEventListener("click", function () {
    addUser({
        selectElementId: "botanicalDeterminationsBy",
        containerId: "botanicalDeterminationByContainer",
        listName: "sampleBotanicalDeterminationByList"
    });
});

function addUser({ selectElementId, containerId, listName }) {
    const selectElement = document.getElementById(selectElementId);
    const selectedOption = selectElement.options[selectElement.selectedIndex];
    const userId = selectElement.value;
    const list = window[listName];

    if (!userId) {
        toast.info("Select a existing user from the database or create a new one.");
        return;
    }
        
    // Check if the item is already in the container ----------
    const existingItem = list.find(item => item.id === userId);
    if (existingItem) {
        // Reset dropdown
        selectElement.value       = "";
        selectElement.textContent = "";

        toast.info("This user has already been added.");
        return;
    } // ------------------------------------------------------

    // Get text content of selected item
    const itemText = selectedOption.text;

    // Create JSON object to store the data
    const data = { id: userId };
    
    // Save object into the global list
    const index = list.push(data) - 1;

    addUserItemBox(itemText, index, listName, containerId);

    // Reset dropdown
    selectElement.value       = "";
    selectElement.textContent = "";
};

function addUserItemBox(itemText, index, listName, containerId) {
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
                onclick="deleteUser(this, ${index}, '${listName}')"
                aria-label="Remove User"
            >
                &#10005;
            </button>
        </div>
    `;
    
    document.getElementById(containerId).appendChild(itemBox);
}

function deleteUser(deleteIcon, index, listName) {
    // Find the itemBox and remove it
    const itemBox = deleteIcon.closest(".item-box");
    itemBox.remove();

    // Remove item from the gloabl list with index
    if (index !== -1) {
        window[listName].splice(index, 1);
    }
}
