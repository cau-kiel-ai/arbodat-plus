let researchProjects = [];

async function getResearchProjects() {
    const { data } = await axios.get('api/research_projects');    
    researchProjects = data;
}

// Form and Fields -------------------------------------------------------------
const researchProjectForm = document.getElementById('researchProjectForm');

const projectNameInput         = document.getElementById("projectName");
const funderNameInput          = document.getElementById("funder");
const authorisationNumberInput = document.getElementById("authorisationNumber");
const licenseDropdown          = document.getElementById("licenseDropdown");
const exportFileNameInput      = document.getElementById("exportFileName");

// Populate license dropdown ------------------------------
document.addEventListener("DOMContentLoaded", async () => {
    await fetchDanteAttribute("license");
    populateDanteDropdown("license", licenseDropdown);
}); // ----------------------------------------------------

function create_update_researchProject() {
    if (researchProjectForm.checkValidity()) {

        // Extract license
        const licenseId = licenseDropdown ? licenseDropdown.value : null;
        const licenseLabel = licenseDropdown ? licenseDropdown.options[licenseDropdown.selectedIndex].getAttribute("data-label") : null;
    
        // Create payload
        const payload = {
            projectName:         projectNameInput.value.trim(),
            funder:              funderNameInput.value.trim(),
            authorisationNumber: authorisationNumberInput.value.trim(),
            license:             licenseId ? { id: licenseId, label: licenseLabel } : null,
            exportFileName:      exportFileNameInput.value.trim()
        };

        const researchProjectId = document.getElementById("researchProjectId")?.value ?? null;
        
        if (researchProjectId) { // Update (PUT) ---------------------------------------------
            payload.id = researchProjectId; // Add id to payload
            
            confirmUpdate("research project").then(confirmed => {
                if (!confirmed) return;

                axios.put(`api/research_projects/${researchProjectId}`, payload)
                .then(response => {
                    console.log(response.data);
                    toast.success("research project updated");
                })
                .catch(error => {
                    console.error('Error during PUT request to update research project:', error);
                    alert("action failed");
                });
            });

        } else { // Create (POST) ------------------------------------------------------------
            axios.post('api/research_projects', payload)
            .then((response) => {
                console.log(response.data);
                toast.success("research project created");

                // Reset form ------------------------------------
                researchProjectForm.reset();
                $('#licenseDropdown').val(null).trigger('change');
                // -----------------------------------------------
            })
            .catch((error) => {
                console.error('Error during POST request to create research project:', error);
                alert("action failed");
            });
        };

    } else { // Report -----------
        // Bootstrap's `scroll-behavior: smooth` animates the browser's scroll
        // to the invalid field; jump to it instantly, then report.
        const firstInvalid = researchProjectForm.querySelector(':invalid');
        if (firstInvalid) {
            firstInvalid.scrollIntoView({ block: 'center', behavior: 'instant' });
            firstInvalid.focus({ preventScroll: true });
        }
        researchProjectForm.reportValidity();
    } // -------------------------
}
