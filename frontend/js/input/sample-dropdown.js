document.addEventListener("DOMContentLoaded", () => {

    // Customise here ------------------------------------------------------------------------
    const dropdown = document.getElementById("sample_label_Dropdown");
    const clearIcon = document.getElementById("sample_label_clearIcon");
    
    const id = document.getElementById("sample_id");
    const inputField = document.getElementById("sample_label");
    const submit_update_button = document.getElementById("sample_submit_update_button");

    const bot_det_by_container = document.getElementById("botanicalDeterminationByContainer");
    // ---------------------------------------------------------------------------------------

    let activeIndex = -1;
    let suppressDropdown = false;

    let cachedItems = [];

    // Open dropdown
    inputField.addEventListener("focus", () => {

        // Check if feature is selcted
        const feature_id = sample_feature_dropdown.value;
        if (!feature_id) {
            toast.info("Before you can enter or select a sample label, you must select a feature.");
            inputField.blur();
        }

        if (suppressDropdown) {
            suppressDropdown = false;
            return;
        }

        adjustDropdownWidth();

        // Send a GET request to get all items
        fetch('api/samples', { // Customise here
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
            // Filter samples by selected feature
            cachedItems = data.filter(sample => sample.feature?.id === feature_id); // Customise here
            activeIndex = -1; // Reset the active index
            populateDropdown(cachedItems);
        })
        .catch(error => {
            console.error('Error during sample GET request:', error);
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
            // modify button: 'update' -> 'create'
            submit_update_button.innerHTML = "create";

            // Customise here ----------------------------
            // Sample location
            stratum_input.value    = '';
            layer_input.value      = '';
            sector_input.value     = '';
            planum_input.value     = '';
            depth_from_input.value = '';
            depth_to_input.value   = '';
            // Coordinates
            $('#sample_coordinate_system').val(null).trigger('change');
            longitude_input.value       = '';
            latitude_input.value        = '';
            altitude_input.value        = '';
            longitude_wgs84_input.value = '';
            latitude_wgs84_input.value  = '';
            // Measurement details
            // Reset list and container -----------
            sampleBotanicalDeterminationByList = []
            bot_det_by_container.innerHTML = "";
            // ------------------------------------
            year_of_bot_det_input.value = '';

            // Reset fractions --------------------------------------
            // fraction 1
            document.getElementById("fraction_analyzed_1").value = '';
            document.getElementById("org_1").checked = false;
            document.getElementById("min_1").checked = false;
            document.getElementById("sieveSize_1").value  = '';
            document.getElementById("multiplier_1").value = '';
            // all further fractions
            while (frac_counter > 1) {
                removeFraction();
            } // ----------------------------------------------------

            $('#sample_type').val(null).trigger('change');
            sample_storage_checkbox.checked = false;
            micro_remain_checkbox.checked   = false;
            // Inventory
            $('#seedsAndFruits').val(null).trigger('change');
            $('#woodSubfossile').val(null).trigger('change');
            $('#charcoalInvestigated').val(null).trigger('change');
            charcoal_total_weight_input.value        = '';
            charcoal_undetermined_weight_input.value = '';
            volume_input.value                       = '';
            volume_determination_dry_radio.checked   = false;
            volume_determination_wet_radio.checked   = false;
            // Sample dating            
            $('#chronozone').val(null).trigger('change');
            archaeological_dating_input.value = '';
            cultural_group_input.value        = '';
            remarks_textarea.value            = '';
            // -------------------------------------------
        }
    });

    function populateDropdown(itemList) {  
        dropdown.innerHTML = ""; // Reset dropdown
        
        itemList.forEach((item) => {
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

        // Sample location
        stratum_input.value    = item.stratum;
        layer_input.value      = item.layer;
        sector_input.value     = item.sector;
        planum_input.value     = item.planum;
        depth_from_input.value = item.depthFrom;
        depth_to_input.value   = item.depthTo;
        // Coordinates
        $('#sample_coordinate_system')
            .val(item.coordinate?.coordinateSystem?.id ?? "").trigger('change');
        longitude_input.value       = item.coordinate?.longitude      ?? "";
        latitude_input.value        = item.coordinate?.latitude       ?? "";
        altitude_input.value        = item.coordinate?.altitude       ?? "";
        longitude_wgs84_input.value = item.coordinate?.longitudeWgs84 ?? "";
        latitude_wgs84_input.value  = item.coordinate?.latitudeWgs84  ?? "";
        // Measurement details
        // Reset user list and container ----------------
        sampleBotanicalDeterminationByList = []
        bot_det_by_container.innerHTML = "";
        // Add users to list and container
        item.botanicalDeterminationBy.forEach(item => {
            const itemText = formatName(item);            
            const userData = { id: item.id };
            const index = sampleBotanicalDeterminationByList.push(userData) - 1;
            addUserItemBox(
                itemText,
                index,
                "sampleBotanicalDeterminationByList",
                "botanicalDeterminationByContainer"
            );
        }); // ------------------------------------------
        year_of_bot_det_input.value = item.botanicalDeterminationYear;

        // Reset fractions -----------------------------------------
        // fraction 1
        document.getElementById("fraction_analyzed_1").value = '';
        document.getElementById("org_1").checked = false;
        document.getElementById("min_1").checked = false;
        document.getElementById("sieveSize_1").value  = '';
        document.getElementById("multiplier_1").value = '';
        // all further fractions
        while (frac_counter > 1) {
            removeFraction();
        }
        // Populate fractions --------------------------------------
        item.fractionAnalyzedList?.forEach((fraction, index) => {
            if (index === 0) {  // fraction 1
                document.getElementById("fraction_analyzed_1").value = fraction.fractionAnalyzed;
                document.getElementById("org_1").checked = fraction.orgOrMin === "org";
                document.getElementById("min_1").checked = fraction.orgOrMin === "min";
                document.getElementById("sieveSize_1").value  = fraction.sieveSize;
                document.getElementById("multiplier_1").value = fraction.standardMultiplier;
            } else {  // all further fractions
                addFraction();
                document.getElementById("fraction_analyzed_" + frac_counter).value = fraction.fractionAnalyzed;
                document.getElementById("org_" + frac_counter).checked = fraction.orgOrMin === "org";
                document.getElementById("min_" + frac_counter).checked = fraction.orgOrMin === "min";
                document.getElementById("sieveSize_" + frac_counter).value  = fraction.sieveSize;
                document.getElementById("multiplier_" + frac_counter).value = fraction.standardMultiplier;
            }
        }); // -----------------------------------------------------

        $('#sample_type').val(item.sampleType?.id ?? "").trigger('change');
        sample_storage_checkbox.checked = item.sampleStorage;
        micro_remain_checkbox.checked   = item.microRemain;
        // Inventory
        $('#seedsAndFruits').val(item.seedsAndFruits?.id ?? '').trigger('change');
        $('#woodSubfossile').val(item.woodSubfossile?.id ?? '').trigger('change');
        $('#charcoalInvestigated').val(item.charcoalInvestigated?.id ?? '').trigger('change');
        charcoal_total_weight_input.value        = item.totalWeight;
        charcoal_undetermined_weight_input.value = item.weightUndetermined;
        volume_input.value                       = item.sampleVolume;
        volume_determination_dry_radio.checked   = item.volumeDetermination === "dry";
        volume_determination_wet_radio.checked   = item.volumeDetermination === "wet";
        // Sample dating
        $('#chronozone').val(item.chronozone?.id ?? '').trigger('change');
        archaeological_dating_input.value = item.archaeologicalDating;
        cultural_group_input.value        = item.culturalGroup;
        remarks_textarea.value            = item.remarksSample;
        // -------------------------------------------------------------------------
    }

    // Reset Form
    clearIcon.addEventListener("click", () => {
        id.value = "";
        inputField.value = "";
        // modify button: 'updatde' -> 'create'
        submit_update_button.innerHTML = "create";

        // Customise here -------------------------
         // Sample location
        stratum_input.value    = '';
        layer_input.value      = '';
        sector_input.value     = '';
        planum_input.value     = '';
        depth_from_input.value = '';
        depth_to_input.value   = '';
        // Coordinates
        $('#sample_coordinate_system').val(null).trigger('change');
        longitude_input.value       = '';
        latitude_input.value        = '';
        altitude_input.value        = '';
        longitude_wgs84_input.value = '';
        latitude_wgs84_input.value  = '';
        // Measurement details
        // Reset list and container -----------
        sampleBotanicalDeterminationByList = []
        bot_det_by_container.innerHTML = "";
        // ------------------------------------
        year_of_bot_det_input.value = '';
        
        // Reset fractions --------------------------------------
        // fraction 1
        document.getElementById("fraction_analyzed_1").value = '';
        document.getElementById("org_1").checked = false;
        document.getElementById("min_1").checked = false;
        document.getElementById("sieveSize_1").value  = '';
        document.getElementById("multiplier_1").value = '';
        // c
        while (frac_counter > 1) {
            removeFraction();
        } // ----------------------------------------------------

        $('#sample_type').val(null).trigger('change');
        sample_storage_checkbox.checked = false;
        micro_remain_checkbox.checked   = false;
        // Inventory
        $('#seedsAndFruits').val(null).trigger('change');
        $('#woodSubfossile').val(null).trigger('change');
        $('#charcoalInvestigated').val(null).trigger('change');
        charcoal_total_weight_input.value        = '';
        charcoal_undetermined_weight_input.value = '';
        volume_input.value                       = '';
        volume_determination_dry_radio.checked   = false;
        volume_determination_wet_radio.checked   = false;
        // Sample dating
        $('#chronozone').val(null).trigger('change');
        archaeological_dating_input.value = '';
        cultural_group_input.value        = '';
        remarks_textarea.value            = '';
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
