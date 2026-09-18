let authors = [];

async function getAuthors() {
    const { data } = await axios.get('api/authors');    
    authors = data;
}

// Form and Fields -------------------------------------------------------------
const authorForm = document.getElementById('authorForm');

const authorLastNameInput    = document.getElementById("authorLastName");
const authorFirstNameInput   = document.getElementById("authorFirstName");
const authorMiddleNamesInput = document.getElementById("authorMiddleNames");

function create_update_author() {
    if (authorForm.checkValidity()) {

        // Create payload
        const payload = {
            lastName:   authorLastNameInput.value.trim(),
            firstName:  authorFirstNameInput.value.trim(),
            middleName: authorMiddleNamesInput.value.trim(),
        };

        const authorId = document.getElementById("authorId")?.value ?? null;

        if (authorId) { // Update (PUT) --------------------------------------------
            payload.id = authorId; // Add id to payload

            axios.put(`api/authors/${authorId}`, payload)
            .then(response => {
                console.log(response.data);
                toast.success("author updated");
            })
            .catch(error => {
                console.error('Error during PUT request to update author:', error);
                alert("action failed");
            });

        } else { // Create (POST) --------------------------------------------------
            axios.post('api/authors', payload)
            .then(response => {
                console.log(response.data);
                toast.success("author created");
                
                // Reset form
                authorForm.reset();
            })
            .catch(error => {
                console.error('Error during POST request to create author:', error);
                alert("action failed");
            });
        };
        
    } else { // Report -----------------
        authorLastNameInput.focus();
        // wait until focus is set
        setTimeout(() => {
            authorForm.reportValidity();
        }, 200);
    } // -------------------------------
}
