window.literatureAuthorList = []; // global list

document.getElementById("addAuthorButton").addEventListener("click", () => {    
    const selectElement = document.getElementById("literatureAuthors");
    const selectedOption = selectElement.options[selectElement.selectedIndex];
    const authorId = selectElement.value;
    
    if (!authorId) {
        toast.info("Select a existing author from the database or create a new one.");
        return;
    }

    // Check if the item is already in the container ----------------------------
    const existingItem = literatureAuthorList.find(item => item.id === authorId);
    if (existingItem) {
        // Reset dropdown
        selectElement.value       = "";
        selectElement.textContent = "";

        toast.info("This Author has already been added.");
        return;
    } // ------------------------------------------------------------------------

    // Get text content of selected item
    const itemText = selectedOption.text;

    // Create JSON object to store the data
    const data = { id: authorId };
        
    // Save object into the global list
    const index = literatureAuthorList.push(data) - 1;

    addAuthorItemBox(itemText, index);

    // Reset dropdown
    selectElement.value       = "";
    selectElement.textContent = "";
});

function addAuthorItemBox(itemText, index) {
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
                onclick="deleteAuthor(this, ${index})"
                aria-label="Remove Author"
            >
                &#10005;
            </button>
        </div>
    `;
    
    document.getElementById("literatureAuthorContainer").appendChild(itemBox);
}

function deleteAuthor(deleteIcon, index) {
    // Find the itemBox and remove it
    const itemBox = deleteIcon.closest(".item-box");
    itemBox.remove();

    // Remove item from the gloabl list with index
    if (index !== -1) {
        literatureAuthorList.splice(index, 1);
    }
}
