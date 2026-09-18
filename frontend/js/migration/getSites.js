async function getSites() {
  showLoading();

  await updateBackendDanteAttributes();

  // Get 'ArchBotDaten.mdb' file from the file upload
  const dataFile = document.getElementById('dataFile');
  if (dataFile.files.length === 0) {
    toast.info("Please select a 'ArchBotDaten.mdb' file.");
    hideLoading();
    return;
  }
  // Check if 'ArchBotStrukDat.mdb' file is also uploaded
  const strukDataFile = document.getElementById('strukDataFile');
  if (strukDataFile.files.length === 0) {
    toast.info("Please select a 'ArchBotStrukDat.mdb' file.");
    hideLoading();
    return;
  }

  // Create FormData object and add .mdb file
  const formData = new FormData();
  formData.append("file", dataFile.files[0]);

  try {
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
  } finally {
    hideLoading();
  }
}

function populateSites(sites) {
  const tableBody = document.getElementById("siteTableBody");
  tableBody.innerHTML = ""; // Reset table

  sites.forEach(site => {
    const row = document.createElement("tr");

    // First column: Site label
    const siteLabelCell = document.createElement("td");
    siteLabelCell.textContent = site;
    row.appendChild(siteLabelCell);

    // Second column: Selection checkbox
    const checkboxCell = document.createElement("td");
    checkboxCell.style = "text-align: right;"
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = site;
    checkbox.classList.add("siteCheckbox"); // Access to checkboxes
    checkboxCell.appendChild(checkbox);
    row.appendChild(checkboxCell);

    tableBody.appendChild(row);
  });
}