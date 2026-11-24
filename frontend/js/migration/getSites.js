async function getSites() {
  // Get 'ArchBotDaten.mdb' file from the file upload
  const dataFile = document.getElementById('dataFile');
  if (dataFile.files.length === 0) {
    toast.info("Please select a 'ArchBotDaten.mdb' file.");
    return;
  }
  // Check if 'ArchBotStrukDat.mdb' file is also uploaded
  const strukDataFile = document.getElementById('strukDataFile');
  if (strukDataFile.files.length === 0) {
    toast.info("Please select a 'ArchBotStrukDat.mdb' file.");
    return;
  }

  // Create FormData object and add .mdb file
  const formData = new FormData();
  formData.append("file", dataFile.files[0]);

  showLoading();

  try {
    // The migration needs the DANTE vocabularies in the backend. Without internet the vocabularies
    // stored by earlier syncs are used, so this must not stop the upload.
    const vocabulariesComplete = await updateBackendDanteAttributes();
    if (!vocabulariesComplete) {
      toast.info("Some DANTE vocabularies could not be updated. The vocabularies already stored in ArboDat+ are used for them.");
    }

    const response = await axios.post("api/migration/getSites", formData, {
      headers: {
        "Content-Type": "multipart/form-data"
      }
    });

    populateSites(response.data); // Integrate list of sites into frontend
    // show accordion section 1
    var accordionElement1 = document.getElementById("panelsStayOpen-collapseOne");
    if (!accordionElement1.classList.contains("show")) {
      accordionElement1.classList.add("show");
    }
    // show accordion section 2
    var accordionElement2 = document.getElementById("panelsStayOpen-collapseTwo");
    if (!accordionElement2.classList.contains("show")) {
      accordionElement2.classList.add("show");
    }
    
  } catch (error) {
      console.error("Error uploading file", error);
      toast.error("Could not read sites from file: " + getErrorMessage(error));
  } finally {
    hideLoading();
  }
}

// populateSites: see siteSelection.js
