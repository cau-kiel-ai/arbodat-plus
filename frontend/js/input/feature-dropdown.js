document.addEventListener("DOMContentLoaded", () => {

    // Customise here ------------------------------------------------------------------------
    const dropdown = document.getElementById("feature_label_Dropdown");
    const clearIcon = document.getElementById("feature_label_clearIcon");
    
    const id = document.getElementById("feature_id");
    const inputField = document.getElementById("feature_label");
    const submit_update_button = document.getElementById("feature_submit_update_button");

    const site_dropdown = document.getElementById("featureSite");

    // Attributes ---------------------------------------------------
    const excavation_area_input = document.getElementById("excavation_area");
    const feature_condition_checkbox = document.getElementById("feature_condition");
    const preservation_condition_dropdown = document.getElementById("preservation_condition");
    const feature_type_dropdown = document.getElementById("feature_type");
    const excavation_years_selectpicker = document.getElementById("excavation_years");
    const building_context_checkbox = document.getElementById("building_context");
    const remarks_textarea = document.getElementById("remarks_feature");
    // ---------------------------------------------------------------------------------------

    let activeIndex = -1;
    let suppressDropdown = false;

    let cachedItems = [];

    // Open dropdown
    inputField.addEventListener("focus", () => {

        // Check if site is selcted
        const site_id = site_dropdown.value;
        if (!site_id) {
            toast.info("Before you can enter or select a feature label, you must select a site.");
            inputField.blur();
        }

        if (suppressDropdown) {
            suppressDropdown = false;
            return;
        }

        adjustDropdownWidth();

        // Send a GET request to get all items
        fetch('api/features', { // Customise here
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
            // Filter features by selected site
            cachedItems = data.filter(feature => feature.site?.id === site_id); // Customise here
            activeIndex = -1; // Reset the active index
            populateDropdown(cachedItems);
        })
        .catch(error => {
            console.error('Error during feature GET request:', error);
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
            item.label.toLowerCase().includes(query) // Customise here
        );
        activeIndex = -1; // Reset the active index
        populateDropdown(filteredItem);
        // --------------------------------------------------------------
        
        // Check whether the entered 'item name' already exists in the dropdown
        const matchedItem = cachedItems.find(item => 
            item.label.toLowerCase() === query // Customise here
        );

        if (matchedItem) {
            selectItem(matchedItem);
        }
        else { // Reset Form
            id.value = "";
            // modify button: 'updatde' -> 'create'
            submit_update_button.innerHTML = "create";

            // Customise here ----------------------------
            excavation_area_input.value = '';
            feature_condition_checkbox.checked = false;
            $('#preservation_condition').val(null).trigger('change');
            $('#feature_type').val(null).trigger('change');
            excavation_years_selectpicker.value = '';
            building_context_checkbox.checked = false;
            remarks_textarea.value = '';
            // -------------------------------------------
        }
    });

    function populateDropdown(itemList) {  
        dropdown.innerHTML = ""; // Reset dropdown
        
        itemList.forEach((item, index) => {
            const listItem = document.createElement("li");
            listItem.textContent = item.label; // Customise here
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

        // Customise here ----------------------------------------------------------
        inputField.value = item.label;

        excavation_area_input.value = item.excavationArea;
        feature_condition_checkbox.checked = item.featureCondition;
        $('#preservation_condition').val(item.preservationCondition?.id ?? "").trigger('change');
        $('#feature_type').val(item.featureType?.id ?? "").trigger('change');
        [...excavation_years_selectpicker.options].forEach(option => {
            const value = parseInt(option.value, 10);
            option.selected = item.excavationYears.includes(value);
        });
        building_context_checkbox.checked = item.buildingContext;
        remarks_textarea.value = item.remarksFeature;
        // -------------------------------------------------------------------------
    }

    // Reset Form
    clearIcon.addEventListener("click", () => {
        id.value = "";
        inputField.value = "";
        // modify button: 'updatde' -> 'create'
        submit_update_button.innerHTML = "create";

         // Customise here ----------------------------
        excavation_area_input.value = '';
        feature_condition_checkbox.checked = false;
        $('#preservation_condition').val(null).trigger('change');
        $('#feature_type').val(null).trigger('change');
        excavation_years_selectpicker.value = '';
        building_context_checkbox.checked = false;
        remarks_textarea.value = '';
        // -------------------------------------------

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
