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
initLazyMultiSelect('#literatureAuthors', {
    load:   async () => { await getAuthors(); return authors; },
    format: formatName,
    dropdownParent: $('#literaturModal'), // For migration
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
                [JSON.stringify(selectedRefs('#literatureAuthors'))],
                { type: "application/json" }
            )
        ); // -----------------------------------------

        if (literatureId) { // Update (PUT) --------------------------------------------
            confirmUpdate("literature").then(confirmed => {
                if (!confirmed) return;

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
                    toast.error("action failed");
                });
            });
        } else { // Create (POST) ------------------------------------------------------
            axios.post('api/literature', payload)
            .then(response => {
                console.log(response.data);
                toast.success("literature created");
                
                // Reset form
                literatureForm.reset();
                clearMultiSelect('#literatureAuthors');

                // For migration: check literature row
                if (siteId) {
                    addGreenCheck();
                }
            })
            .catch(error => {
                console.error('Error during POST request to create literature:', error);
                toast.error("action failed");
            });
        };
        
    } else { // Report ---------------------
        // Bootstrap's `scroll-behavior: smooth` animates the browser's scroll
        // to the invalid field; jump to it instantly, then report.
        const firstInvalid = literatureForm.querySelector(':invalid');
        if (firstInvalid) {
            firstInvalid.scrollIntoView({ block: 'center', behavior: 'instant' });
            firstInvalid.focus({ preventScroll: true });
        }
        literatureForm.reportValidity();
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
