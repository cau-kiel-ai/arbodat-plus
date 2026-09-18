document.addEventListener("DOMContentLoaded", () => {
    
    // Customise here -----------------------------------------------------------
    const dropdown = document.getElementById("user_Dropdown");
    const clearIcon = document.getElementById("clearIconUser");
    
    const id = document.getElementById("userId");
    const inputField = document.getElementById("last_name");
    const submit_update_button = document.getElementById("userSubmitButton");

    const institutionContainer = document.getElementById("institutionContainer");
    // --------------------------------------------------------------------------
    
    let activeIndex = -1;
    let suppressDropdown = false;

    let cachedItems = [];

    inputField.addEventListener("focus", () => {

        if (suppressDropdown) {
            suppressDropdown = false;
            return;
        }

        adjustDropdownWidth();

        fetch('api/users', { // Customise here
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(response.statusText);
            }
            return response.json();
        })
        .then(data => {
            cachedItems = data;
            activeIndex = -1; // Reset the active index
            populateDropdown(cachedItems);
        })
        .catch(error => {
            console.error('Error:', error);
        });

        dropdown.classList.remove("hidden");
    });

    function adjustDropdownWidth() {
        const inputWidth = inputField.offsetWidth;
        dropdown.style.width = `${inputWidth}px`;
    }

    // Autofill
    inputField.addEventListener("input", () => {

        // Update Dropdown ----------------------------------------------
        const query = inputField.value.toLowerCase();
        const filteredItem = cachedItems.filter(item =>
            item.lastName.toLowerCase().includes(query) // Customise here
        );
        activeIndex = -1; // Reset the active index
        populateDropdown(filteredItem);
        // --------------------------------------------------------------

        // Check whether the entered 'item name' already exists in the dropdown
        const matchedItem = cachedItems.find(item => 
            item.lastName.toLowerCase() === query // Customise here
        );

        if (matchedItem) {
            selectItem(matchedItem);
        }
        else { // Reset Form
            id.value = '';
            // modify button: 'updatde' -> 'create'
            submit_update_button.innerHTML = "create";
            // Customise here ------------------
            firstNameInput.value   = "";
            middleNameInput.value  = "";
            mailAddressInput.value = "";
            orcidInput.value       = "";
            // Reset list and container
            window.institutionList = []
            institutionContainer.innerHTML = "";
            // ---------------------------------
        }
    });

    function populateDropdown(itemList) {  
        dropdown.innerHTML = ""; // Reset dropdown
        
        itemList.forEach((item, index) => {
            const listItem = document.createElement("li");
            listItem.textContent = item.lastName + ", " + item.firstName + " " + item.middleName; // Customise here
            listItem.addEventListener("click", () => {
                selectItem(item);
            });
            dropdown.appendChild(listItem);
        });

        // Hide dropdown if no item name match
        dropdown.classList.toggle("hidden", itemList.length === 0);
    }

    function selectItem(item) {
        id.value = item.id
        // modify button: 'submit' -> 'updatde'
        submit_update_button.innerHTML = "update"
        // Customise here ---------------------------------------------
        inputField.value       = item.lastName;
        firstNameInput.value   = item.firstName;
        middleNameInput.value  = item.middleName;
        mailAddressInput.value = item.mailAddress;
        orcidInput.value       = item.orcid;
        
        // Reset institutionList and institutionContainer
        window.institutionList = [];
        institutionContainer.innerHTML = '';
        
        // Add institutions to institutionList and institutionContainer
        item.institutionList.forEach(item => {
            const itemText = formatInstitution(item);
            const data = { id: item.id };
            const index = institutionList.push(data) - 1;
            addInstitutionItemBox(itemText, index, "institutionList", "institutionContainer");         
        });
        // ------------------------------------------------------------
    }

    // Reset Form
    clearIcon.addEventListener("click", () => {
        id.value = "";
        // modify button: 'updatde' -> 'create'
        submit_update_button.innerHTML = "create";
        // Customise here ------------------
        userForm.reset();
        // Reset list and container
        window.institutionList = []
        institutionContainer.innerHTML = "";
        // ---------------------------------
        inputField.focus();
    });

    // Close Dropdown when selecting an item (via mouse click)
    dropdown.addEventListener("click", (e) => {
        if (e.target.tagName === "LI") {
            suppressDropdown = true;
            dropdown.classList.add("hidden"); // Close dropdown
            inputField.focus();           // Keep focus on input field
        }
    });          

    // Dropdown button navigation --------------------------
    inputField.addEventListener("keydown", (e) => {

        // Select all <li> elements (list entries) within the dropdown
        const items = dropdown.querySelectorAll("li");

        // ArrowDown -> Navigate downwards
        if (e.key === "ArrowDown") {
            e.preventDefault();
            activeIndex = (activeIndex + 1) % items.length; // Navigate downwards
            updateActiveItem(items);

        // ArrowUp -> Navigate upwards
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            activeIndex = (activeIndex - 1 + items.length) % items.length; // Navigate upwards
            updateActiveItem(items);

        // Enter -> Select current element + Close dropdown
        } else if (e.key === "Enter" && activeIndex >= 0) {
            e.preventDefault();
            items[activeIndex].click();       // Select current element
            dropdown.classList.add("hidden"); // Close dropdown

        // Escape -> Close dropdown
        } else if (e.key === "Escape") {
            dropdown.classList.add("hidden"); // Close dropdown
        }
    });

    function updateActiveItem(items) {
        items.forEach((item, index) => {
            item.classList.toggle("active", index === activeIndex);
        });
    }

    // Dropdown focus management ---------------------------    
    // Close dropdown when clicked outside
    document.addEventListener("click", (e) => {
        if (!dropdown.contains(e.target) && e.target !== inputField && !clearIcon.contains(e.target)) {
            dropdown.classList.add("hidden");
        }
    });

    // Detect mousedown on dropdown and clearIcon to prevent immediate blur handling
    let isClickingDropdown = false;
    dropdown.addEventListener("mousedown", () => {
    isClickingDropdown = true;
    });
    let isClickingClearIcon = false;
    clearIcon.addEventListener("mousedown", () => {
    isClickingClearIcon = true;
    });

    // Close dropdown when focus is lost (e.g., using Tab key)
    inputField.addEventListener("blur", () => {
        setTimeout(() => {
            if (!isClickingDropdown && !isClickingClearIcon) {
                dropdown.classList.add("hidden");
            }
            // Reset after handling
            isClickingDropdown = false;
            isClickingClearIcon = false;
        }, 0);
    });
});
