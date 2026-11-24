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

        // Sites, whose migration failed: they were rolled back and can be migrated again
        const failedSiteList = response.data.failedSiteList ?? [];
        const failedSites = new Map(failedSiteList.map(item => [item.label, item.message]));
        markFailedSites(failedSites);

        if (failedSites.size === selectedSites.length) {
            toast.error("Migration failed for all selected sites, nothing was migrated.");
            return;
        }
        if (failedSites.size > 0) {
            toast.info(`Migration failed for ${failedSites.size} site(s): ${[...failedSites.keys()].join(", ")}. `
                       + "They were rolled back, all other sites were migrated.");
        }

        // Migration succeeded: reset researchProject list and box in html container --------------
        researchProjects = window.researchProjects;
        researchProjects.length = 0;
        const container = document.getElementById("researchProjectContainer");
        container.innerHTML = "";
        // -------------------------------------------------------------------

        // The migrated sites get their status, the already existing ones too (and are listed with the other
        // not migrated elements, see siteSelection.js); failed sites keep theirs (markFailedSites)
        await markSites(selectedSites.filter(label => !failedSites.has(label)), "migrated");
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
            showAccordionSection("panelsStayOpen-collapseFour");
        }        
        // NonMatchingDanteAttributes
        if (nonMatchingDanteAttributeList.length > 0) {
            showAccordionSection("panelsStayOpen-collapseFive");
        }
        // Coordinates
        if (coordinateList.length > 0) {
            showAccordionSection("panelsStayOpen-collapseSix");
        }
        // Users
        if (userList.length > 0) {
            showAccordionSection("panelsStayOpen-collapseSeven");
        }
        // FractionsAnalyzed
        if (fractionAnalyzedList.length > 0) {
            showAccordionSection("panelsStayOpen-collapseEight");
        }
        // LabsAndNumbers
        if (labAndNumberList.length > 0) {
            showAccordionSection("panelsStayOpen-collapseNine");
        }
        // Results
        if (resultList.length > 0) {
            showAccordionSection("panelsStayOpen-collapseTen");
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
