let users = [];

async function getUsers() {
    const { data } = await axios.get('api/users');    
    users = data;
}

// Form and Fields -----------------------------------------------------
const userForm = document.getElementById('userForm');

const lastNameInput    = document.getElementById("last_name");
const firstNameInput   = document.getElementById("first_name");
const middleNameInput  = document.getElementById("middle_names");
const mailAddressInput = document.getElementById("mail");
const orcidInput       = document.getElementById("orcid");

// Select2 instituitions dropdown --------------------------------------
$('#userInstitutions').select2({
    placeholder: "",
    allowClear: true,
    width: "100%",
    ...($('#userModal').length && {
        dropdownParent: $('#userModal')
    }),
});

// remove arrow
$('#userInstitutions')
    .next('.select2-container')
    .find('.select2-selection__arrow')
    .remove();

let userInstitutions_isReopening = false;
$('#userInstitutions').on('select2:opening', async function (e) {
    if (userInstitutions_isReopening) {
        userInstitutions_isReopening = false;
        return;
    }

    e.preventDefault(); // Prevent opening

    // Disable dropdown and show "Loading..."
    $('#userInstitutions')
        .empty()
        .append(new Option('Loading...', 'loading', true, true))
        .trigger('change')
        .prop('disabled', true); // Disable

    try {
        await getInstitutions();
    } finally {
        // Enable and reset dropdown
        $('#userInstitutions')
            .prop('disabled', false) // Enable
            .empty()
            .append(new Option('', '', false, false));

        // Update data
        institutions.forEach(item => {
            $('#userInstitutions').append(
                new Option(formatInstitution(item), item.id)
            );
        });

        // Refresh UI
        $('#userInstitutions').trigger('change.select2');

        // Reopen dropdown
        userInstitutions_isReopening = true;
        setTimeout(() => {
            $('#userInstitutions').select2('open');
        }, 0);
    }
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
            new Blob([JSON.stringify(window.institutionList)], { type: "application/json" })
        );

        const userId = document.getElementById("userId")?.value || null;
        if (userId) { // update (PUT) -------------------------------------------
            payload.id = userId;  // Add id to payload

            formData.append(
                "transferredUser",
                new Blob([JSON.stringify(payload)], { type: "application/json" })
            );

            axios.put(`api/users/${userId}`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            })
            .then(response => {
                console.log(response.data);
                toast.success("user updated");

                // Update 'Select existing Users' selection in migration
                try {
                    fetchUsers();
                } catch (error) {}
                // -----------------------------------------------------
            })
            .catch((error) => {
                console.error('Error during PUT request to update user:', error);
                alert("action failed");
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
                window.institutionList.length = 0;
                document.getElementById("institutionContainer").innerHTML = '';
                // ------------------------------------------------------------

                // Update 'Select existing Users' selection in migration
                try {
                    fetchUsers();
                } catch (error) {}
                // -----------------------------------------------------
            })
            .catch((error) => {
                console.error('Error during POST request to create user:', error);
                alert("action failed");
            });
        };

    } else { // Report ----------------
        lastNameInput.focus();
        // wait until focus is set
        setTimeout(() => {
            userForm.reportValidity();
        }, 300);
    } // ------------------------------
}
