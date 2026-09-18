document.addEventListener("DOMContentLoaded", () => {

    // Customise here -------------------------------------------------------------------
    const dropdown = document.getElementById("site_label_Dropdown");
    const clearIcon = document.getElementById("site_label_clearIcon");
    
    const id = document.getElementById("site_id");
    const inputField = document.getElementById("site_label");
    const submit_update_button = document.getElementById("site_submit_update_button");
    
    // Attributes --------------------------
    // references
    const researchProject_container = document.getElementById("researchProjectContainer");
    const literature_container = document.getElementById("siteLiteratureContainer");

    // General information
    const activityNumber_input = document.getElementById("activity_number");
    const siteLabelAbbreviation_input = document.getElementById("site_label_abbreviation");
    const siteNumber_input = document.getElementById("site_number");
    const taxonomy_dropdown = document.getElementById("taxonomy");
    const siteType_selectpicker = document.getElementById("site_type");
    const siteTypeUncertain_checkbox = document.getElementById("site_type_uncertain");
    const naturalUnit_dropdown = document.getElementById("natural_unit");
    const siteConditionUndisturbed_checkbox = document.getElementById("site_condition_undisturbed");

    // Institutions and excavation team
    const institution_container = document.getElementById("siteInstitutionContainer");
    const siteDirector_container = document.getElementById("siteDirectorContainer");
    const archeologist_container = document.getElementById("ArcheologistContainer");
    const botanist_container = document.getElementById("BotanistContainer");

    // Coordinates ans address
    const coordinateSystem_dropdown = document.getElementById("site_coordinate_system");
    const longitude_input = document.getElementById("site_longitude");
    const latitude_input = document.getElementById("site_latitude");
    const altitude_input = document.getElementById("site_altitude");
    const longitude_wgs84_input = document.getElementById("site_longitude_wgs84");
    const latitude_wgs84_input = document.getElementById("site_latitude_wgs84");
    const country_input = document.getElementById("country");
    const county_input = document.getElementById("county");
    const district_input = document.getElementById("district");
    const parish_input = document.getElementById("parish");
    const street_or_place_input = document.getElementById("street_or_place");
    const town_input = document.getElementById("town");

    const remarks_textarea = document.getElementById("site_remarks");
    // ----------------------------------------------------------------------------------

    let activeIndex = -1;
    let suppressDropdown = false;

    let cachedItems = [];

    // Open dropdown
    inputField.addEventListener("focus", () => {

        // Check if at least one research project is selected
        if (!siteResearchProjectList.length > 0) {
            toast.info("Before you can enter or select a site label, you must add at least one research project.");
            inputField.blur();
        }

        if (suppressDropdown) {
            suppressDropdown = false;
            return;
        }

        adjustDropdownWidth();

        // Send a GET request to get all items
        fetch('api/sites', { // Customise here
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
            // Filter sites by added research projects
            const siteResearchProjectIdSet = new Set(siteResearchProjectList.map(rp => rp.id));
            cachedItems = data.filter(item => item.researchProjectList.some(rp => siteResearchProjectIdSet.has(rp.id))); // Customise here
            activeIndex = -1; // Reset the active index
            populateDropdown(cachedItems);
        })
        .catch(error => {
            console.error('Error during site GET request:', error);
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
            // references
            literature_container.innerHTML = "";
            siteLiteratureList = [];

            // General information
            activityNumber_input.value = '';
            siteLabelAbbreviation_input.value = '';
            siteNumber_input.value = '';
            $('#taxonomy').val(null).trigger('change');
            $('#site_type').val(null).trigger('change');
            siteTypeUncertain_checkbox.checked = false;
            $('#natural_unit').val(null).trigger('change');
            siteConditionUndisturbed_checkbox.checked = false;

            // Institutions and excavation team
            institution_container.innerHTML = "";
            siteInstitutionList = [];
            siteDirector_container.innerHTML = "";
            siteDirectorList = [];
            archeologist_container.innerHTML = "";
            siteArcheologistList = [];
            botanist_container.innerHTML = "";
            siteBotanistList = [];

            // Coordinates and address
            $('#site_coordinate_system').val(null).trigger('change');
            longitude_input.value       = '';
            latitude_input.value        = '';
            altitude_input.value        = '';
            longitude_wgs84_input.value = '';
            latitude_wgs84_input.value  = '';
            country_input.value         = '';
            county_input.value          = '';
            district_input.value        = '';
            parish_input.value          = '';
            street_or_place_input.value = '';
            town_input.value            = '';

            remarks_textarea.value = '';
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

        // Customise here ------------------------------------------------------
        // References
        inputField.value = item.label;
        // Reset research project list and container ----
        researchProject_container.innerHTML = "";
        siteResearchProjectList = [];
        // Add users to list and container
        item.researchProjectList.forEach(item => {
            const itemText = item.projectName;            
            const researchProjectData = { id: item.id };
            const index = siteResearchProjectList.push(researchProjectData) - 1;
            addResearchProjectItemBox(
                itemText,
                index
            );
        });
        // Reset literature list and container ----------
        literature_container.innerHTML = "";
        siteLiteratureList = [];
        // Add users to list and container
        item.literatureList.forEach(item => {
            const itemText = formatLiterature(item);            
            const literatureData = { id: item.id };
            const index = siteLiteratureList.push(literatureData) - 1;
            addLiteratureItemBox(
                itemText,
                index,
                "siteLiteratureList",
                "siteLiteratureContainer"
            );
        }); // ------------------------------------------

        // General information
        activityNumber_input.value                = item.activityNumber;
        siteLabelAbbreviation_input.value         = item.labelAbbreviation;
        siteNumber_input.value                    = item.siteNumber;
        $('#taxonomy').val(item.taxonomy?.id ?? '').trigger('change');
        $('#site_type').val(item.siteTypeList.map(siteType => siteType.id)).trigger('change');
        siteTypeUncertain_checkbox.checked        = item.siteTypeUncertain;
        $('#natural_unit').val(item.naturalUnit?.id ?? '').trigger('change');
        siteConditionUndisturbed_checkbox.checked = item.undisturbed;

        // Institutions and excavation team
        // Reset institution list and container ---------
        institution_container.innerHTML = "";
        siteInstitutionList = [];
        // Add users to list and container
        item.institutionList.forEach(item => {
            const itemText = formatInstitution(item);            
            const institutionData = { id: item.id };
            const index = siteInstitutionList.push(institutionData) - 1;
            addInstitutionItemBox(
                itemText,
                index,
                "siteInstitutionList",
                "siteInstitutionContainer"
            );
        });
        // Reset user list and container ----------------
        siteDirector_container.innerHTML = "";
        siteDirectorList = [];
        // Add users to list and container
        item.siteDirectors.forEach(item => {
            const itemText = formatName(item);            
            const userData = { id: item.id };
            const index = siteDirectorList.push(userData) - 1;
            addUserItemBox(
                itemText,
                index,
                "siteDirectorList",
                "siteDirectorContainer"
            );
        });
        // Reset user list and container ----------------
        archeologist_container.innerHTML = "";
        siteArcheologistList = [];
        // Add users to list and container
        item.archaeologists.forEach(item => {
            const itemText = formatName(item);            
            const userData = { id: item.id };
            const index = siteArcheologistList.push(userData) - 1;
            addUserItemBox(
                itemText,
                index,
                "siteArcheologistList",
                "ArcheologistContainer"
            );
        });
        // Reset user list and container ----------------
        botanist_container.innerHTML = "";
        siteBotanistList = [];
        // Add users to list and container
        item.botanists.forEach(item => {
            const itemText = formatName(item);            
            const userData = { id: item.id };
            const index = siteBotanistList.push(userData) - 1;
            addUserItemBox(
                itemText,
                index,
                "siteBotanistList",
                "BotanistContainer"
            );
        }); // ------------------------------------------

        // Coordinates and address
        $('#site_coordinate_system')
            .val(item.coordinate?.coordinateSystem?.id ?? '')
            .trigger('change');
        longitude_input.value           = item.coordinate?.longitude      ?? "";
        latitude_input.value            = item.coordinate?.latitude       ?? "";
        altitude_input.value            = item.coordinate?.altitude       ?? "";
        longitude_wgs84_input.value     = item.coordinate?.longitudeWgs84 ?? "";
        latitude_wgs84_input.value      = item.coordinate?.latitudeWgs84  ?? "";
        country_input.value             = item.address?.country           ?? "";
        county_input.value              = item.address?.county            ?? "";
        district_input.value            = item.address?.district          ?? "";
        parish_input.value              = item.address?.parish            ?? "";
        street_or_place_input.value     = item.address?.street_or_place   ?? "";
        town_input.value                = item.address?.town              ?? "";

        remarks_textarea.value = item.remarksSite;
        // ---------------------------------------------------------------------
    }

    // Reset Form
    clearIcon.addEventListener("click", () => {
        id.value = "";
        inputField.value = "";
        // modify button: 'updatde' -> 'create'
        submit_update_button.innerHTML = "create";

        // Customise here ----------------------------
        // references
        literature_container.innerHTML = "";
        siteLiteratureList = [];

        // General information
        activityNumber_input.value = '';
        siteLabelAbbreviation_input.value = '';
        siteNumber_input.value = '';
        $('#taxonomy').val(null).trigger('change');
        $('#site_type').val(null).trigger('change');
        siteTypeUncertain_checkbox.checked = false;
        $('#natural_unit').val(null).trigger('change');
        siteConditionUndisturbed_checkbox.checked = false;

        // Institutions and excavation team
        institution_container.innerHTML = "";
        siteInstitutionList = [];
        siteDirector_container.innerHTML = "";
        siteDirectorList = [];
        archeologist_container.innerHTML = "";
        siteArcheologistList = [];
        botanist_container.innerHTML = "";
        siteBotanistList = [];

        // Coordinates and address
        $('#site_coordinate_system').val(null).trigger('change');
        longitude_input.value       = '';
        latitude_input.value        = '';
        altitude_input.value        = '';
        longitude_wgs84_input.value = '';
        latitude_wgs84_input.value  = '';
        country_input.value         = '';
        county_input.value          = '';
        district_input.value        = '';
        parish_input.value          = '';
        street_or_place_input.value = '';
        town_input.value            = '';

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
