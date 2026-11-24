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

    // Add siteList (only selected sites)
    const selectedSites = selectedSiteLabels();

    formData.append("siteList", new Blob([JSON.stringify(selectedSites)], { type: "application/json" }));

    // Send data to backend via POST
    try {
        const response = await axios.post("api/migration", formData, {
            headers: {
                "Content-Type": "multipart/form-data"
            }
        });

        // Migration succeeded: reset researchProject list and box in html container --------------
        researchProjects = window.researchProjects;
        researchProjects.length = 0;
        const container = document.getElementById("researchProjectContainer");
        container.innerHTML = "";
        // -------------------------------------------------------------------

        // The migrated sites get their status, the already existing ones too (and are listed with the other
        // not migrated elements, see siteSelection.js)
        await markSites(selectedSites, "migrated");
        await populateExistingLists(response.data);

        const literatureList = response.data.literatureList;
        const nonMatchingDanteAttributeList = response.data.nonMatchingDanteAttributeList;
        const coordinateList = response.data.coordinateList;
        const userList = response.data.userList;
        const fractionAnalyzedList = response.data.fractionAnalyzedList;
        const labAndNumberList = response.data.labAndNumberList;
        const resultList = response.data.resultList;
        
        await populateNonMatchingDanteAttributes(nonMatchingDanteAttributeList);
        await populateLiterature(literatureList);
        await populateCoordinates(coordinateList);
        await populateUsers(userList);
        populateFractionsAnalyzed(fractionAnalyzedList);
        await populateLabsAndNumbers(labAndNumberList);
        await populateResults(resultList);

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

        // The tables were built in collapsed accordions (no size): draw them now that they are visible
        redrawMigrationTables();

    } catch (error) {
        console.error("Error during site migration: ", error);
        toast.error("Migration failed: " + getErrorMessage(error));
    } finally {
        hideLoading();
    }
}
