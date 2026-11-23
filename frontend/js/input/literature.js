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
            confirmUpdate("literature").then(confirmed => {
                if (!confirmed) return;

                axios.put(`api/literature/${literatureId}`, payload)
                .then(response => {
                    console.log(response.data);
                    toast.success("literature updated");

                    // Migration: the literature lists show the changed literature
                    // (this script is also used by the migration page, only that one defines fetchLiteratureOptions)
                    if (typeof fetchLiteratureOptions === "function") {
                        fetchLiteratureOptions();
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
                literatureAuthorList = [];
                document.getElementById("literatureAuthorContainer").innerHTML = "";

                // Migration: the new literature is offered and chosen in the row which opened the popup
                // (this script is also used by the migration page, only that one defines onLiteratureCreated)
                if (typeof onLiteratureCreated === "function") {
                    onLiteratureCreated();
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
