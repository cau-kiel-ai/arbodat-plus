async function migrateSites(researchProjectList) {
    showLoading();

    // Get .mdb files from the file upload
    const dataFile = document.getElementById('dataFile');
    if (dataFile.files.length === 0) {
        toast.info("Please select a 'ArchBotDaten.mdb' file.");
        hideLoading();
        return;
    }
    const strukDataFile = document.getElementById('strukDataFile');
    if (strukDataFile.files.length === 0) {
        toast.info("Please select a 'ArchBotStrukDat.mdb' file.");
        hideLoading();
        return;
    }
    
    // Create FormData object
    const formData = new FormData();

    // Add .mdb files
    formData.append("files", dataFile.files[0]);
    formData.append("files", strukDataFile.files[0]);

    // Add research project list
    formData.append("researchProjectList", new Blob([JSON.stringify(researchProjectList)], { type: "application/json" }));

    // Reset researchProject list and box in html container --------------
    researchProjects = window.researchProjects;
    researchProjects.length = 0;
    const container = document.getElementById("researchProjectContainer");
    container.innerHTML = "";
    // -------------------------------------------------------------------

    // Add siteList (only selected sites)
    const selectedSites = Array.from(document.querySelectorAll(".siteCheckbox"))
        .filter(checkbox => checkbox.checked)
        .map(checkbox => {
            // Strike, uncheck and disable checked line
            const row = checkbox.closest("tr");
            row.style.color = "gray";
            checkbox.disabled = true;
            checkbox.checked = false;
            // Add a green tick
            const greenCheck = document.createElement("span");
            greenCheck.innerHTML = "✅";
            greenCheck.style.marginLeft = "20px";
            row.lastElementChild.appendChild(greenCheck);

            return checkbox.value
        });

    formData.append("siteList", new Blob([JSON.stringify(selectedSites)], { type: "application/json" }));

    // Send data to backend via POST
    try {
        const response = await axios.post("api/migration", formData, {
            headers: {
                "Content-Type": "multipart/form-data"
            }
        });

        // Extract lists from the response        
        const existingSiteList = response.data.existingSiteList;
        const existingFeatureList = response.data.existingFeatureList;
        const existingSampleList = response.data.existingSampleList;
        const existingAbsoluteDatingList = response.data.existingAbsoluteDatingList;
        
        createExistingSiteList(existingSiteList);
        createExistingFeatureList(existingFeatureList);
        createExistingSampleList(existingSampleList);
        createExistingAbsoluteDatingList(existingAbsoluteDatingList);

        const literatureList = response.data.literatureList;
        const nonMatchingDanteAttributeList = response.data.nonMatchingDanteAttributeList;
        const coordinateList = response.data.coordinateList;
        const userList = response.data.userList;
        const fractionAnalyzedList = response.data.fractionAnalyzedList;
        const labAndNumberList = response.data.labAndNumberList;
        const resultList = response.data.resultList;
        
        populateNonMatchingDanteAttributes(nonMatchingDanteAttributeList);
        populateLiterature(literatureList);
        populateCoordinates(coordinateList);
        populateUsers(userList);
        populateFractionsAnalyzed(fractionAnalyzedList);
        populateLabsAndNumbers(labAndNumberList);
        populateResults(resultList);

        // show accordion sections 4-10, when something is included in the corresponding lists
        // Literature
        if (literatureList.length > 0) {
            var accordionElement4 = document.getElementById("panelsStayOpen-collapseFour");
            if (!accordionElement4.classList.contains("show")) {
                accordionElement4.classList.add("show");
            }  
        }        
        // NonMatchingDanteAttributes
        if (nonMatchingDanteAttributeList.length > 0) {
            var accordionElement5 = document.getElementById("panelsStayOpen-collapseFive");
            if (!accordionElement5.classList.contains("show")) {
                accordionElement5.classList.add("show");
            }
        }
        // Coordinates
        if (coordinateList.length > 0) {
            var accordionElement6 = document.getElementById("panelsStayOpen-collapseSix");
            if (!accordionElement6.classList.contains("show")) {
                accordionElement6.classList.add("show");
            }
        }
        // Users
        if (userList.length > 0) {
            var accordionElement7 = document.getElementById("panelsStayOpen-collapseSeven");
            if (!accordionElement7.classList.contains("show")) {
                accordionElement7.classList.add("show");
            }
        }
        // FractionsAnalyzed
        if (fractionAnalyzedList.length > 0) {
            var accordionElement8 = document.getElementById("panelsStayOpen-collapseEight");
            if (!accordionElement8.classList.contains("show")) {
                accordionElement8.classList.add("show");
            }
        }
        // LabsAndNumbers
        if (labAndNumberList.length > 0) {
            var accordionElement9 = document.getElementById("panelsStayOpen-collapseNine");
            if (!accordionElement9.classList.contains("show")) {
                accordionElement9.classList.add("show");
            }
        }
        // Results
        if (resultList.length > 0) {
            var accordionElement10 = document.getElementById("panelsStayOpen-collapseTen");
            if (!accordionElement10.classList.contains("show")) {
                accordionElement10.classList.add("show");
            }
        }

    } catch (error) {
        console.error("Error during site migration: ", error);
    } finally {
        hideLoading();
    }
}

// Create Tables for already existing items under 'Site Selection' ----------------------
function createExistingSiteList(existingSiteList) {

    if (existingSiteList.length > 0) {

        let table = document.getElementById("existingSiteListTable");

        if (!table) {

            // Get site selection form
            const siteSelectionForm = document.getElementById("siteSelectionForm");

            // Add text
            const headerText = document.createElement("p");
            headerText.innerHTML = "Not migrated, allready existing sites and additional added research projects";
            siteSelectionForm.appendChild(headerText);

            // Create new table
            const newTable = document.createElement("table");
            newTable.className = "table table-striped";
            newTable.id = "existingSiteListTable";

            // Create new table head
            const thead = document.createElement("thead");
            thead.innerHTML = `
            <tr>
                <th scope="col">site</th>
                <th scope="col">site id</th>
                <th scope="col">research projects</th>
                <th scope="col">added research projects</th>
            </tr>
            `;
            newTable.appendChild(thead);

            // Create new table body
            const tbody = document.createElement("tbody");
            // Create lines
            existingSiteList.forEach(item => {
                const row = document.createElement("tr");

                // Add columns
                row.innerHTML = `
                    <td>${item.label}</td>
                    <td>${item.id}</td>
                    <td>${item.researchProjectNames.join(", ")}</td>
                    <td>${item.addedResearchProjectNames.join(", ")}</td>
                `;

                tbody.appendChild(row);

                // Replace ✅ with ❌ in siteList
                Array.from(document.querySelectorAll(".siteCheckbox"))
                .filter(checkbox => item.label == checkbox.value)
                .map(checkbox => {
                    const row = checkbox.closest("tr");
                    const existingSymbol = row.lastElementChild.querySelector("span");
                    existingSymbol.innerHTML = "❌ (already migrated)";
                });
            });        

            newTable.appendChild(tbody);
            siteSelectionForm.appendChild(newTable);
        } 
        // If table allready exists only add lines
        else {
            const tbody = table.querySelector("tbody");

            existingSiteList.forEach(item => {
                const row = document.createElement("tr");

                // Füge die Spalten hinzu
                row.innerHTML = `
                    <td>${item.label}</td>
                    <td>${item.id}</td>
                    <td>${item.researchProjectNames.join(", ")}</td>
                    <td>${item.addedResearchProjectNames.join(", ")}</td>
                `;

                tbody.appendChild(row);

                // Ersetze ✅ mit ❌ in siteList
                Array.from(document.querySelectorAll(".siteCheckbox"))
                    .filter(checkbox => item.label == checkbox.value)
                    .map(checkbox => {
                        const row = checkbox.closest("tr");
                        const existingSymbol = row.lastElementChild.querySelector("span");
                        if (existingSymbol) {
                            existingSymbol.innerHTML = "❌ (already migrated)";
                        }
                    });
            });            
        }
    }    
}

function createExistingFeatureList(existingFeatureList) {

    if (existingFeatureList.length > 0) {

        let table = document.getElementById("existingFeatureListTable");

        if (!table) {

            // Get site selection form
            const siteSelectionForm = document.getElementById("siteSelectionForm");

            // Add text
            const headerText = document.createElement("p");
            headerText.innerHTML = "<br>Not migrated, allready existing features related to selected sites";
            siteSelectionForm.appendChild(headerText);

            // Create new table
            const newTable = document.createElement("table");
            newTable.className = "table table-striped";
            newTable.id = "existingFeatureListTable";

            // Create new table head
            const thead = document.createElement("thead");
            thead.innerHTML = `
            <tr>
                <th scope="col">feature</th>
                <th scope="col">feature id</th>
                <th scope="col">site</th>
            </tr>
            `;
            newTable.appendChild(thead);

            // Create new table body
            const tbody = document.createElement("tbody");
            // Create lines
            existingFeatureList.forEach(item => {
                const row = document.createElement("tr");

                // Add columns
                row.innerHTML = `
                    <td>${item.label}</td>
                    <td>${item.id}</td>
                    <td>${item.siteLabel}</td>
                `;

                tbody.appendChild(row);
            });        

            newTable.appendChild(tbody);
            siteSelectionForm.appendChild(newTable);
        } 
        // If table allready exists only add lines
        else {
            const tbody = table.querySelector("tbody");

            existingFeatureList.forEach(item => {
                const row = document.createElement("tr");

                // Füge die Spalten hinzu
                row.innerHTML = `
                    <td>${item.label}</td>
                    <td>${item.id}</td>
                    <td>${item.siteLabel}</td>
                `;

                tbody.appendChild(row);
            });            
        }
    }    
}

function createExistingSampleList(existingSampleList) {

    if (existingSampleList.length > 0) {

        let table = document.getElementById("existingSampleListTable");

        if (!table) {

            // Get site selection form
            const siteSelectionForm = document.getElementById("siteSelectionForm");

            // Add text
            const headerText = document.createElement("p");
            headerText.innerHTML = "<br>Not migrated, allready existing samples related to selected sites";
            siteSelectionForm.appendChild(headerText);

            // Create new table
            const newTable = document.createElement("table");
            newTable.className = "table table-striped";
            newTable.id = "existingSampleListTable";

            // Create new table head
            const thead = document.createElement("thead");
            thead.innerHTML = `
            <tr>
                <th scope="col">sample</th>
                <th scope="col">sample id</th>
                <th scope="col">site</th>
                <th scope="col">feature</th>
            </tr>
            `;
            newTable.appendChild(thead);

            // Create new table body
            const tbody = document.createElement("tbody");
            // Create lines
            existingSampleList.forEach(item => {
                const row = document.createElement("tr");

                // Add columns
                row.innerHTML = `
                    <td>${item.label}</td>
                    <td>${item.id}</td>
                    <td>${item.siteLabel}</td>
                    <td>${item.featureLabel}</td>
                `;

                tbody.appendChild(row);
            });        

            newTable.appendChild(tbody);
            siteSelectionForm.appendChild(newTable);
        } 
        // If table allready exists only add lines
        else {
            const tbody = table.querySelector("tbody");

            existingSampleList.forEach(item => {
                const row = document.createElement("tr");

                // Füge die Spalten hinzu
                row.innerHTML = `
                    <td>${item.label}</td>
                    <td>${item.id}</td>
                    <td>${item.siteLabel}</td>
                    <td>${item.featureLabel}</td>
                `;

                tbody.appendChild(row);
            });            
        }
    }    
}

function createExistingAbsoluteDatingList(existingAbsoluteDatingList) {

    if (existingAbsoluteDatingList.length > 0) {

        let table = document.getElementById("existingAbsoluteDatingListTable");

        if (!table) {

            // Get site selection form
            const siteSelectionForm = document.getElementById("siteSelectionForm");

            // Add text
            const headerText = document.createElement("p");
            headerText.innerHTML = "<br>Not migrated, allready existing datings related to selected sites";
            siteSelectionForm.appendChild(headerText);

            // Create new table
            const newTable = document.createElement("table");
            newTable.className = "table table-striped";
            newTable.id = "existingAbsoluteDatingListTable";

            // Create new table head
            const thead = document.createElement("thead");
            thead.innerHTML = `
            <tr>
                <th scope="col">sub sample</th>
                <th scope="col">absolute dating id</th>
                <th scope="col">site</th>
                <th scope="col">feature</th>
                <th scope="col">sample</th>
            </tr>
            `;
            newTable.appendChild(thead);

            // Create new table body
            const tbody = document.createElement("tbody");
            // Create lines
            existingAbsoluteDatingList.forEach(item => {
                const row = document.createElement("tr");

                // Add columns
                row.innerHTML = `
                    <td>${item.subSample}</td>
                    <td>${item.id}</td>
                    <td>${item.siteLabel}</td>
                    <td>${item.featureLabel}</td>
                    <td>${item.sampleLabel}</td>
                `;

                tbody.appendChild(row);
            });        

            newTable.appendChild(tbody);
            siteSelectionForm.appendChild(newTable);
        } 
        // If table allready exists only add lines
        else {
            const tbody = table.querySelector("tbody");

            existingAbsoluteDatingList.forEach(item => {
                const row = document.createElement("tr");

                // Füge die Spalten hinzu
                row.innerHTML = `
                    <td>${item.subSample}</td>
                    <td>${item.id}</td>
                    <td>${item.siteLabel}</td>
                    <td>${item.featureLabel}</td>
                    <td>${item.sampleLabel}</td>
                `;

                tbody.appendChild(row);
            });            
        }
    }    
}
