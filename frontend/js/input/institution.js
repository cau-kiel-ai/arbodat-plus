let institutions = [];

async function getInstitutions() {
    const { data } = await axios.get('api/institutions');    
    institutions = data;
}

// Form and Fields -------------------------------------------------------
const institutionForm = document.getElementById('institutionForm');

const institutionLabelInput = document.getElementById("institutionLabel");
const rorIdInput            = document.getElementById("rorId");

function create_update_institution() {
    if (institutionForm.checkValidity()) {

        // Create payload
        const payload = {
            label: institutionLabelInput.value.trim(),
            rorId: rorIdInput.value.trim(),
        };

        const institutionId = document.getElementById("institutionId")?.value ?? null;

        if (institutionId) { // Update (PUT) -------------------------------------------
            payload.id = institutionId; // Add id to payload

            axios.put(`api/institutions/${institutionId}`, payload)
            .then(response => {
                console.log(response.data);
                toast.success("institution updated");
            })
            .catch(error => {
                console.error('Error during PUT request to update institution:', error);
                alert("action failed");
            });

        } else { // Create (POST) ------------------------------------------------------
            axios.post('api/institutions', payload)
            .then(response => {
                console.log(response.data);
                toast.success("institution created");

                // Reset form
                institutionForm.reset();
            })
            .catch(error => {
                console.error('Error during POST request to create institution:', error);
                alert("action failed");
            });
        }

    } else { // Report ----------------------
        institutionLabel.focus();
        // wait until focus is set
        setTimeout(() => {
            institutionForm.reportValidity();
        }, 200);
    } // ------------------------------------
}
