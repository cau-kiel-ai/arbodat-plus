document.addEventListener("DOMContentLoaded", () => {

    // Customise here --------------------------------------------------------------
    const dropdown = document.getElementById("projectDropdown");
    const clearIcon = document.getElementById("clearIcon");
    
    const id = document.getElementById("researchProjectId");
    const inputField = document.getElementById("projectName");
    // Attributes
    const funderInput = document.getElementById("funder");
    const authorisationNumberInput = document.getElementById("authorisationNumber");
    const licenseInput = document.getElementById("licenseDropdown");
    const exportFileNameInput = document.getElementById("exportFileName");
    // -----------------------------------------------------------------------------

    let activeIndex = -1;
    let suppressDropdown = false;

    let cachedItems = [];

    // Open dropdown
    inputField.addEventListener("focus", () => {

        if (suppressDropdown) {
            suppressDropdown = false;
            return;
        }

        adjustDropdownWidth();

        // Send a GET request to get all items
        fetch('api/research_projects', { // Customise here
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
            item.projectName.toLowerCase().includes(query) // Customise here
        );
        activeIndex = -1; // Reset the active index
        populateDropdown(filteredItem);
        // --------------------------------------------------------------
        
        // Check whether the entered 'item name' already exists in the dropdown
        const matchedItem = cachedItems.find(item => 
            item.projectName.toLowerCase() === query // Customise here
        );

        if (matchedItem) {
            selectItem(matchedItem);
        }
        else { // Reset Form 
          id.value = "";            
          // Customise here -------------------------
          funderInput.value = "";
          funderInput.readOnly = false;
          authorisationNumberInput.value = "";
          authorisationNumberInput.readOnly = false;
          $('#licenseDropdown').val(null).trigger('change');
          licenseInput.disabled = false;
          exportFileNameInput.value = "";
          exportFileNameInput.readOnly = false;
          // ----------------------------------------
        }
    });

    function populateDropdown(itemList) {  
        dropdown.innerHTML = ""; // Reset dropdown
        
        itemList.forEach((item, index) => {
            const listItem = document.createElement("li");
            listItem.textContent = item.projectName; // Customise here
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
        // Customise here -------------------------------------------
        inputField.value = item.projectName;
        funderInput.value = item.funder;
        funderInput.readOnly = true;
        authorisationNumberInput.value = item.authorisationNumber;
        authorisationNumberInput.readOnly = true;
        $('#licenseDropdown').val(item.license?.id ?? '').trigger('change');
        licenseInput.disabled = true;
        exportFileNameInput.value = item.exportFileName;
        exportFileNameInput.readOnly = true;
        // ----------------------------------------------------------
    }

    // Reset Form
    clearIcon.addEventListener("click", () => {
        id.value = "";
        inputField.value = "";              
        // Customise here -------------------------------------------
        funderInput.value = "";
        funderInput.readOnly = false;
        authorisationNumberInput.value = "";
        authorisationNumberInput.readOnly = false;
        $('#licenseDropdown').val(null).trigger('change');
        licenseInput.disabled = false;
        exportFileNameInput.value = "";
        exportFileNameInput.readOnly = false;
        // ----------------------------------------------------------

        inputField.focus();
    });

    // Close Dropdown when selecting an item (via mouse click)
    dropdown.addEventListener("click", (e) => {
        if (e.target.tagName === "LI") {
            suppressDropdown = true;
            dropdown.classList.add("hidden"); // Close dropdown
            inputField.focus();               // Keep focus on input field
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