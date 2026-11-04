function populateLiterature(literatureList) {
    const tableBody = document.getElementById("literatureTableBody");

    // Create lines
    literatureList.forEach(item => {
        const row = document.createElement("tr");

        // Generate and set row id
        const rowId = `${item.siteId}_${item.author}_${item.publicationYear}`;
        row.dataset.rowId = rowId;

        // Add columns
        row.innerHTML = `
            <td>${item.siteLabel}</td>
            <td>${item.author}</td>
            <td>${item.publicationYear}</td>
            <td>
                <button type="button"
                        onclick="openLiteraturWindow('${escapeJsArg(rowId)}', '${escapeJsArg(item.siteId)}', '${escapeJsArg(item.author)}', '${escapeJsArg(item.publicationYear)}')">
                        Create
                </button>
            </td>
        `;

        tableBody.appendChild(row);
    });
}

function openLiteraturWindow (rowId, siteId, authors, publicationYear) {

    document.getElementById("literatureRowId").value = rowId;

    // Reset authorForm
    document.getElementById('authorForm').reset();
    document.getElementById("authorId").value = '';
    document.getElementById("authorSubmitButton").innerHTML = "create";

    // Reset literatureForm
    document.getElementById('literatureForm').reset();
    $('#literatureAuthors').val(null).trigger('change');
    literatureAuthorList = [];
    document.getElementById("literatureAuthorContainer").innerHTML = "";
    document.getElementById("literatureId").value = '';
    document.getElementById("literatureSubmitButton").innerHTML = "create";

    // Set values from migration
    document.getElementById("authorsFromMigration").textContent = `${authors}`;
    document.getElementById("literaturePublicationYear").placeholder = `${publicationYear}`;
    document.getElementById("literatureSiteId").value = siteId;
    
    // Show Popup ---------------------------------------------------
    const literaturModal = document.getElementById("literaturModal");    
    literaturModal.style.display = "block";
    
    const closeButton = literaturModal.querySelector(".close");
    closeButton.onclick = function() {
        literaturModal.style.display = "none";
    }
    window.onclick = function(event) {
        if (event.target === literaturModal) {
            literaturModal.style.display = "none";
        }
    }
}
