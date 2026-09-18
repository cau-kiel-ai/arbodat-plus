let userDropdowns = [];

function populateUsers(userList) {
    const tableBody = document.getElementById("userTableBody");

    // Create lines
    userList.forEach(item => {

        const row = document.createElement("tr");
        row.dataset.type     = item.type;
        row.dataset.id       = item.id;
        row.dataset.userRole = item.userRole;
        
        // Add columns
        row.innerHTML = `
            <td><input type="checkbox"></td>
            <td></td>
            <td>${item.userRole}</td>
            <td>${item.userLabel}</td>
            <td></td>
            <td>
                <button id="updateButton_${item.id}_${item.userRole}" type="button">Update</button>
            </td>
            <td>
                <button type="button"
                        onclick="openUserWindow('${item.userLabel}')">
                        Create
                </button>
            </td>
        `;

        // Set textContent of second cell depending on item type
        const secondTd = row.children[1];
        if (item.type == "site") {
            secondTd.textContent = item.label;
        }
        if (item.type == "sample") {
            secondTd.innerHTML = `${item.siteLabel}<br>${item.featureLabel}<br>${item.label}`;
        }

        const dropdown = document.createElement("select");
        dropdown.id = `userDropdown_${item.id}_${item.userRole}`;
        dropdown.multiple = true;
        dropdown.style    = "width: 100%"
        dropdown.onchange = function () {   
            updateCheckedDropdownsMultiple(
                Array.from(this.selectedOptions).map(option => option.value),
                'userTableBody',
                'userDropdown_'
            );
        };
        const dropdownCell = row.children[4];
        dropdownCell.appendChild(dropdown);

        // Select2 Multi-select boxes (pillbox) -----------
        $(document).ready(function() {
            $(`#userDropdown_${item.id}_${item.userRole}`).select2({
                placeholder: 'select',
                allowClear: true,
            });
        }); // ------------------------------------

        tableBody.appendChild(row);

        userDropdowns.push(dropdown);

        const updateButton = document.getElementById(`updateButton_${item.id}_${item.userRole}`);
        updateButton.addEventListener('click', function () {
            const selectedIds = Array.from(dropdown.selectedOptions).map(option => option.value);
            updateWithUser(item.type, item.id, JSON.stringify(selectedIds), item.userRole, row);
        });
    });

    fetchUsers();
}

function fetchUsers() {
    // Send a GET request to get all users
    fetch('api/users', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok ' + response.statusText);
        }
        return response.json();
    })
    .then(data => {
        
        // Empty user dropdowns
        userDropdowns.forEach(dropdown => {
            dropdown.options.length = 0;
        });
        
        data.forEach(user => {
            
            const userName = formatName(user);

            userDropdowns.forEach(dropdown => {

                // Create option
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = userName;

                dropdown.appendChild(option);
            });
        });
    })
    .catch(error => {
        console.error('Error:', error);
    });
}

function openUserWindow (userLabel) {

    // Reset institutionForm
    document.getElementById("institutionForm").reset();
    document.getElementById("institutionId").value = '';
    document.getElementById("institutionSubmitButton").innerHTML = "create";

    // Reset userForm
    document.getElementById('userForm').reset();
    $('#userInstitutions').val(null).trigger('change');
    window.institutionList = [];
    document.getElementById("institutionContainer").innerHTML = "";
    document.getElementById("userId").value = '';
    document.getElementById("userSubmitButton").innerHTML = "create";

    // Set userLabel from migration ---------------------------------
    document.getElementById("usersFromMigration").textContent = `${userLabel}`;
    
    // Show Popup ---------------------------------------------------
    const userModal = document.getElementById("userModal");    
    userModal.style.display = "block";
    
    const closeButton = userModal.querySelector(".close");
    closeButton.onclick = function() {
        userModal.style.display = "none";
    }
    window.onclick = function(event) {
        if (event.target === userModal) {
            userModal.style.display = "none";
        }
    }
}

async function updateWithUser(type, id, userIds, userRole, row, triggerNext=true) {
    if (userIds && userIds !== "[]") {
        let url = null;        
        if (type == "site") {
            url = `api/sites/${id}/updateEmployees/${userRole}`;
        } 
        else if (type == "sample") {
            url = `api/samples/${id}/updateBotanicalDeterminationBy`;
        }

        try {
            const response = await fetch(
                url,
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: userIds
                }
            );
            if (!response.ok) {
                throw new Error(`HTTP Error! Status: ${response.status}`);
            }
            const data = await response.text();
            console.log(data);

            row.remove();            
            if (triggerNext) { updateCheckedUsers(); }
            return true;

        } catch (error) {
            console.error('Error:', error);
            alert("Failed to update User.");
        }

    } else {
        if (triggerNext) {
            toast.info("Select at least one employee.");
        }
        return false;
    }    
}

async function updateCheckedUsers() {
    const tableBody = document.getElementById('userTableBody');
    if (tableBody) {
        const checkboxes = Array.from(tableBody.querySelectorAll('input[type="checkbox"]:checked'));
        const concurrencyLimit = 100;
        showLoading();
        try {
            for (let i = 0; i < checkboxes.length; i += concurrencyLimit) {
                const batch = checkboxes.slice(i, i + concurrencyLimit);

                const promises = batch.map(async checkbox => {
                    if (checkbox.disabled) return true;

                    const row = checkbox.closest('tr');

                    const type = row.dataset.type;
                    const id = row.dataset.id;
                    const userRole = row.dataset.userRole;
                    const userIds = Array.from(
                        row.querySelector('select').selectedOptions
                    ).map(option => option.value);

                    return updateWithUser(
                        type,
                        id,
                        JSON.stringify(userIds),
                        userRole,
                        row,
                        triggerNext = false
                    );
                });

                await Promise.allSettled(promises);
            };
        } finally {
            hideLoading();
        }
    }
}
