let literature = [];

async function getLiterature() {
    const { data } = await axios.get('api/literature');    
    literature = data;
}

// Form and Fields ---------------------------------------------------------------
const literatureForm = document.getElementById('literatureForm');

const titleInput           = document.getElementById("literatureTitle");
const publicationYearInput = document.getElementById("literaturePublicationYear");
const doiInput             = document.getElementById("literatureDOI");
const shortCitationInput   = document.getElementById("literatureShortCitation");
const longCitationInput    = document.getElementById("literatureLongCitation");
const abstractTextarea     = document.getElementById("literatureAbstract");

// Select2 authors dropdown ------------------------------------------------------
$('#literatureAuthors').select2({
    placeholder: "",
    allowClear: true,
    width: "100%",
    // For migration -----------------------
    ...($('#literaturModal').length && {
        dropdownParent: $('#literaturModal')
    }), // ---------------------------------
});

// remove arrow
$('#literatureAuthors')
    .next('.select2-container')
    .find('.select2-selection__arrow')
    .remove();

let literatureAuthors_isReopening = false;
$('#literatureAuthors').on('select2:opening', async function (e) {
    if (literatureAuthors_isReopening) {
        literatureAuthors_isReopening = false;
        return;
    }

    e.preventDefault(); // Prevent opening

    // Disable dropdown and show "Loading..."
    $('#literatureAuthors')
        .empty()
        .append(new Option('Loading...', 'loading', true, true))
        .trigger('change')
        .prop('disabled', true); // Disable

    try {
        await getAuthors();
    } finally {
        // Enable and reset dropdown
        $('#literatureAuthors')
            .prop('disabled', false) // Enable
            .empty()
            .append(new Option('', '', false, false));

        // Update data
        authors.forEach(item => {
            $('#literatureAuthors').append(
                new Option(formatName(item), item.id)
            );
        });

        // Refresh UI
        $('#literatureAuthors').trigger('change.select2');

        // Reopen dropdown
        literatureAuthors_isReopening = true;
        setTimeout(() => {
            $('#literatureAuthors').select2('open');
        }, 0);
    }
}); // ---------------------------------------------------------------------------

function create_update_literature() {
    if (literatureForm.checkValidity()) {

        // Literature payload
        const literature = {
            title:           titleInput.value.trim(),
            publicationYear: publicationYearInput.value.trim(),
            doi:             doiInput.value.trim(),
            shortCitation:   shortCitationInput.value.trim(),
            longCitation:    longCitationInput.value.trim(),
            litAbstract:     abstractTextarea.value.trim(),
        };

        // For migration: refer literature to site -------------------------------
        const siteId = document.getElementById("literatureSiteId")?.value ?? null;
        if (siteId) {
            literature.siteList = [{ id: siteId }];
        } // ---------------------------------------------------------------------

        const literatureId = document.getElementById("literatureId").value;
        
        // Create payload -----------------------------
        if (literatureId) { // Add id to literature
            literature.id = literatureId;
        }
        const payload = new FormData();

        // Add literature
        payload.append(
            "transferredLiterature",
            new Blob(
                [JSON.stringify(literature)],
                { type: "application/json" }
            )
        );
        // Add authorList
        payload.append(
            "authorList",
            new Blob(
                [JSON.stringify(literatureAuthorList)],
                { type: "application/json" }
            )
        ); // -----------------------------------------

        if (literatureId) { // Update (PUT) --------------------------------------------
            axios.put(`api/literature/${literatureId}`, payload)
            .then(response => {
                console.log(response.data);
                toast.success("literature updated");

                // For migration: check literature row
                if (siteId) {
                    addGreenCheck();
                }
            })
            .catch(error => {
                console.error('Error during PUT request to update literature:', error);
                alert("action failed");
            });
        } else { // Create (POST) ------------------------------------------------------
            axios.post('api/literature', payload)
            .then(response => {
                console.log(response.data);
                toast.success("literature created");
                
                // Reset form
                literatureForm.reset();
                literatureAuthorList = [];
                document.getElementById("literatureAuthorContainer").innerHTML = "";

                // For migration: check literature row
                if (siteId) {
                    addGreenCheck();
                }
            })
            .catch(error => {
                console.error('Error during POST request to create literature:', error);
                alert("action failed");
            });
        };
        
    } else { // Report ---------------------
        titleInput.focus();
        // wait until focus is set
        setTimeout(() => {
            literatureForm.reportValidity();
        }, 400);
    } // -----------------------------------
}

// For migration
function addGreenCheck() {
    const rowId = document.getElementById("literatureRowId").value;

    const row = document.querySelector(`tr[data-row-id="${rowId}"]`);
    if (!row) return;

    // Add a green tick
    const greenCheck = document.createElement("span");
    greenCheck.innerHTML = "✅";
    greenCheck.style.marginLeft = "20px";
    
    row.lastElementChild.appendChild(greenCheck);
}
