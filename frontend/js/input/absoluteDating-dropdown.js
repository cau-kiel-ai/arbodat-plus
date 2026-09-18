document.addEventListener("DOMContentLoaded", () => {

    // Customise here ---------------------------------------------------------------------
    const dropdown = document.getElementById("subsample_Dropdown");
    const clearIcon = document.getElementById("subsample_clearIcon");
    
    const id = document.getElementById("absDating_id");
    const inputField = document.getElementById("subsample");
    const submit_update_button = document.getElementById("absDating_submit_update_button");

    const literature_container = document.getElementById("absDating_literature_container");
    // ------------------------------------------------------------------------------------

    let activeIndex = -1;
    let suppressDropdown = false;

    let cachedItems = [];

    // Open dropdown
    inputField.addEventListener("focus", () => {

        // Check if sample is selcted
        const sample_id = absoluteDating_sample_dropdown.value;
        if (!sample_id) {
            toast.info("Before you can enter or select a subsample, you must select a sample.");
            inputField.blur();
        }

        if (suppressDropdown) {
            suppressDropdown = false;
            return;
        }

        adjustDropdownWidth();

        // Send a GET request to get all items
        fetch('api/absolute_datings', { // Customise here
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
            // Filter absoulte datings by selected sample
            cachedItems = data.filter(absoluteDating => absoluteDating.sample?.id === sample_id); // Customise here
            activeIndex = -1; // Reset the active index
            populateDropdown(cachedItems);
        })
        .catch(error => {
            console.error('Error during absolute dating GET request:', error);
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
            item.subSample.toLowerCase().includes(query) // Customise here
        );
        activeIndex = -1; // Reset the active index
        populateDropdown(filteredItem);
        // --------------------------------------------------------------
        
        // Check whether the entered 'item name' already exists in the dropdown
        const matchedItem = cachedItems.find(item => 
            item.subSample.toLowerCase() === query // Customise here
        );

        if (matchedItem) {
            selectItem(matchedItem);
        }
        else { // Reset Form
            id.value = '';
            // modify button: 'updatde' -> 'create'
            submit_update_button.innerHTML = "create";
            // Customise here -------------------------
            const selectedSiteValue    = absoluteDating_site_dropdown.value;
            const selectedFeatureValue = absoluteDating_feature_dropdown.value;
            const selectedSampleValue  = absoluteDating_sample_dropdown.value;
            const subSampleValue = inputField.value;
            resetAbsoluteDatingForm();
            absoluteDating_site_dropdown.value    = selectedSiteValue;
            absoluteDating_feature_dropdown.value = selectedFeatureValue;
            absoluteDating_sample_dropdown.value  = selectedSampleValue;
            inputField.value = subSampleValue;
            // ----------------------------------------
        }
    });

    function populateDropdown(itemList) {  
        dropdown.innerHTML = ""; // Reset dropdown
        
        itemList.forEach((item, index) => {
            const listItem = document.createElement("li");
            listItem.textContent = item.subSample; // Customise here
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
        // Customise here -------------------------------------------
        inputField.value = item.subSample;
        
        // Reset literature list and container
        absoluteDatingLiteratureList = []
        literature_container.innerHTML = "";

        // Add literature to list and container
        item.literatureList.forEach(item => {
            const itemText = formatLiterature(item);            
            const literatureData = { id: item.id };
            const index = absoluteDatingLiteratureList.push(literatureData) - 1;
            addLiteratureItemBox(itemText, index, "absoluteDatingLiteratureList", "absDating_literature_container");
        });
        
        $('#material').val(item.material?.id ?? '').trigger('change');
        remarksTextarea.value = item.remarks;
        $('#dating_method').val(item.datingMethod?.id ?? '').trigger('change');
        // dating method accordions
        selected_datingMethod = datingMethodDropdown.selectedOptions[0].text;
        if (selected_datingMethod === "Dendrochronology") {
            dendroLabInput.value = item.dendrochronologicalDating?.laboratory?.label ?? '';
            dendroNumberInput.value = item.dendrochronologicalDating?.number ?? '';
            dendroAgeInput.value = item.dendrochronologicalDating?.dendrochronologicalAge ?? '';
            waneyEdgeCheckbox.checked = item.dendrochronologicalDating?.waneyEdge ?? false;
        } else if (selected_datingMethod === "Radiocarbon Dating") {
            $('#c14_lab').val(item.c14Dating?.c14Laboratory?.id ?? '').trigger('change');
            c14NumberInput.value = item.c14Dating?.number ?? '';
            c14AgeBPInput.value = item.c14Dating?.c14AgeBp ?? '';
            c14StdDevInput.value = item.c14Dating?.c14StdDev ?? '';
            c14CalTextarea.value = item.c14Dating?.c14CalibrationBcAd2s ?? '';
            deltaC13Input.value = item.c14Dating?.deltaC13 ?? '';
            c13DevInput.value = item.c14Dating?.deltaC13Uncertainty ?? '';
            pMCInput.value = item.c14Dating?.pmc ?? '';
            pMCDevInput.value = item.c14Dating?.pmcUncertainty ?? '';
        } else if (selected_datingMethod === "select dating method") {
            // do nothing
        } else { // Other Dating
            otherLabInput.value = item.otherDating?.laboratory?.label ?? '';
            otherNumberInput.value = item.otherDating?.number ?? '';
            otherAgeInput.value = item.otherDating?.ageDivers ?? '';
        }
        // ----------------------------------------------------------
    }

    // Reset Form
    clearIcon.addEventListener("click", () => {
        id.value = "";
        inputField.value = "";
        // modify button: 'updatde' -> 'create'
        submit_update_button.innerHTML = "create";
        // Customise here -------------------------
        const selectedSiteValue    = absoluteDating_site_dropdown.value;
        const selectedFeatureValue = absoluteDating_feature_dropdown.value;
        const selectedSampleValue  = absoluteDating_sample_dropdown.value;
        resetAbsoluteDatingForm();
        absoluteDating_site_dropdown.value    = selectedSiteValue;
        absoluteDating_feature_dropdown.value = selectedFeatureValue;
        absoluteDating_sample_dropdown.value  = selectedSampleValue;
        // ----------------------------------------

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
