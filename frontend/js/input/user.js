let users = [];

async function getUsers() {
    const { data } = await axios.get('api/users');    
    users = sortPeople(data);
}

// Form and Fields -----------------------------------------------------
const userForm = document.getElementById('userForm');

const lastNameInput    = document.getElementById("last_name");
const firstNameInput   = document.getElementById("first_name");
const middleNameInput  = document.getElementById("middle_names");
const mailAddressInput = document.getElementById("mail");
const orcidInput       = document.getElementById("orcid");

// Select2 instituitions dropdown --------------------------------------
initLazyMultiSelect('#userInstitutions', {
    load:   async () => { await getInstitutions(); return institutions; },
    format: formatInstitution,
    dropdownParent: $('#userModal'), // For migration
}); // -----------------------------------------------------------------

function create_update_user() {
    if (userForm.checkValidity()) {
        
        const payload = {
            lastName:    lastNameInput.value.trim(),
            firstName:   firstNameInput.value.trim(),
            middleName:  middleNameInput.value.trim(),
            mailAddress: mailAddressInput.value.trim(),
            orcid:       orcidInput.value.trim(),
        };
        
        // Create FormData object
        const formData = new FormData();
        
        // Add institutionList
        // (Ids of existing 'institutions' OR new institution objects without id)
        formData.append(
            "institutionList",
            new Blob([JSON.stringify(selectedRefs('#userInstitutions'))], { type: "application/json" })
        );

        const userId = document.getElementById("userId")?.value || null;
        if (userId) { // update (PUT) -------------------------------------------
            payload.id = userId;  // Add id to payload

            formData.append(
                "transferredUser",
                new Blob([JSON.stringify(payload)], { type: "application/json" })
            );

            confirmUpdate("user").then(confirmed => {
                if (!confirmed) return;

                axios.put(`api/users/${userId}`, formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data'
                    }
                })
                .then(response => {
                    console.log(response.data);
                    toast.success("user updated");

                    // Update 'Select existing Users' selection in migration
                    // (this script is also used by the migration page, only that one defines fetchUsers)
                    if (typeof fetchUsers === "function") {
                        fetchUsers();
                    }
                    // -----------------------------------------------------
                })
                .catch((error) => {
                    console.error('Error during PUT request to update user:', error);
                    toast.error("action failed");
                });
            });
        } else { // create (POST) -----------------------------------------------

            formData.append(
                "user",
                new Blob([JSON.stringify(payload)], { type: "application/json" })
            );

            axios.post('api/users', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            })
            .then((response) => {
                console.log(response.data);
                toast.success("user created");

                // Reset form -------------------------------------------------
                userForm.reset();
                clearMultiSelect('#userInstitutions');
                // ------------------------------------------------------------

                // Migration: the new user is offered and chosen in the row which opened the popup
                // (this script is also used by the migration page, only that one defines onUserCreated)
                if (typeof onUserCreated === "function") {
                    onUserCreated();
                }
                // -----------------------------------------------------
            })
            .catch((error) => {
                console.error('Error during POST request to create user:', error);
                toast.error("action failed");
            });
        };

    } else { // Report ----------------
        // Bootstrap's `scroll-behavior: smooth` animates the browser's scroll
        // to the invalid field; jump to it instantly, then report.
        const firstInvalid = userForm.querySelector(':invalid');
        if (firstInvalid) {
            firstInvalid.scrollIntoView({ block: 'center', behavior: 'instant' });
            firstInvalid.focus({ preventScroll: true });
        }
        userForm.reportValidity();
    } // ------------------------------
}
