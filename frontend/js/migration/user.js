// Team accordion: one Tabulator (only the visible rows are rendered), the rows are plain objects (see toUserRow).
// Each row is a role of a site (siteDirector, archaeologist, botanist) or the botanical determination of a sample,
// with the name from ArboDat (userLabel) and the users of ArboDat+ chosen for it.

let userTable = null;
let userRowCounter = 0;

// Users of ArboDat+: [{ value: id, label: name }] (reloaded after a user is created in the popup)
let userOptions = [];

// Rows per bulk request (requests are sent one after another)
const USER_CHUNK_SIZE = 500;

function toUserRow(item) {
    const isSample = item.type === "sample";
    return {
        id:           `user_${++userRowCounter}`,
        type:         item.type, // site or sample
        entityId:     item.id,
        siteLabel:    isSample ? item.siteLabel : item.label,
        featureLabel: isSample ? item.featureLabel : "",
        sampleLabel:  isSample ? item.label : "",
        userRole:     item.userRole,
        userLabel:    item.userLabel,
        users:        [], // ids of the chosen users
        error:        "", // reason, if the last 'Update' failed
    };
}

async function populateUsers(userList) {
    await fetchUsers();

    const rows = userList.map(toUserRow);

    // Sites migrated later: add the rows to the table
    if (userTable) {
        userTable.addData(rows);
        return;
    }
    userTable = createUserTable(rows);
}

// Users of ArboDat+ (also called by the user popup, see js/input/user.js, after a user was created)
async function fetchUsers() {
    try {
        const users = (await axios.get("api/users")).data;
        userOptions = users.map(user => ({ value: user.id, label: formatName(user) }));
    } catch (error) {
        console.error("Error during user GET request: ", error);
    }
    // Show the names of the reloaded users
    if (userTable?.initialized) userTable.redraw(true);
}

function createUserTable(rows) {
    const userNames = ids => ids
        .map(id => userOptions.find(option => option.value === id)?.label)
        .filter(Boolean)
        .join(", ");

    const table = newTabulator(document.getElementById("userTable"), {
        data: rows,
        index: "id",
        maxHeight: "70vh",
        layout: "fitDataFill", // columns as wide as their content (no stretched last column)
        placeholder: "no users",
        columns: [
            selectionColumn(),
            filterTextColumn("Site", "siteLabel"),
            filterTextColumn("Feature", "featureLabel"),
            filterTextColumn("Sample", "sampleLabel"),
            filterListColumn("userRole", "userRole"),
            filterListColumn("userLabel", "userLabel"),
            {title: "Users", field: "users", headerSort: false, minWidth: 220,
                editor: multiSelectEditor, editorParams: () => ({ values: userOptions }),
                formatter: cell => {
                    const names = userNames(cell.getValue() ?? []);
                    return names ? escapeHtml(names) : `<span class="migration-result-placeholder">select</span>`;
                },
                // not while the editor is open
                tooltip: (e, cell) => cell.getElement().classList.contains("tabulator-editing") ? "" : escapeHtml(userNames(cell.getValue() ?? [])),
            },
            {title: "Update", headerSort: false, hozAlign: "center", width: 80, // as wide as the button
                formatter: cell => {
                    const error = cell.getRow().getData().error;
                    return `<button type="button">Update</button>
                            ${error ? `<div class="text-danger small text-wrap">${escapeHtml(error)}</div>` : ""}`;
                },
                cellClick: (e, cell) => {
                    if (e.target.closest("button")) updateWithUsers(cell.getRow());
                },
            },
            {title: "New user", headerSort: false, hozAlign: "center", width: 90, // as wide as the button
                formatter: () => `<button type="button">Create</button>`,
                cellClick: (e, cell) => {
                    if (e.target.closest("button")) openUserWindow(cell.getRow().getData().userLabel);
                },
            },
        ],
    });
    setupMigrationTable(table, {
        counter: document.getElementById("userCounter"),
        copyFields: { users: () => true },
    });
    return table;
}

// Tabulator can't measure itself in a collapsed accordion -> redraw when it is opened
document.addEventListener("shown.bs.collapse", event => {
    if (event.target.id === "panelsStayOpen-collapseSeven" && userTable) {
        userTable.redraw();
    }
});

function openUserWindow (userLabel) {

    // Reset institutionForm
    document.getElementById("institutionForm").reset();
    document.getElementById("institutionId").value = '';
    document.getElementById("institutionSubmitButton").innerHTML = "create";

    // Reset userForm
    document.getElementById('userForm').reset();
    $('#userInstitutions').val(null).trigger('change');
    window.institutionList = [];
    document.getElementById("institutionContainer").innerHTML = "";
    document.getElementById("userId").value = '';
    document.getElementById("userSubmitButton").innerHTML = "create";

    // Set userLabel from migration ---------------------------------
    document.getElementById("usersFromMigration").textContent = `${userLabel}`;

    // Show Popup ---------------------------------------------------
    const userModal = document.getElementById("userModal");
    userModal.style.display = "block";

    const closeButton = userModal.querySelector(".close");
    closeButton.onclick = function() {
        userModal.style.display = "none";
    }
    window.onclick = function(event) {
        if (event.target === userModal) {
            userModal.style.display = "none";
        }
    }
}

// Update ---------------------------------------------------------------------------------------

function buildUserItem(data) {
    if (!data.users || data.users.length === 0) {
        return { reason: "no user selected", message: "Select at least one employee." };
    }
    return { item: { clientId: data.id, type: data.type, id: data.entityId, userRole: data.userRole, userIds: data.users } };
}

// 'Update' button: sets the users of the clicked row and of all other selected rows
async function updateWithUsers(row) {
    const data = row.getData();

    const clicked = buildUserItem(data);
    if (!clicked.item) {
        toast.info(clicked.message);
        return;
    }

    const items = [clicked.item];
    const skippedReasons = [];
    userTable.getSelectedData().forEach(other => {
        if (other.id === data.id) return;
        const entry = buildUserItem(other);
        if (entry.item) {
            items.push(entry.item);
        } else {
            skippedReasons.push(entry.reason);
        }
    });

    const updated = [];
    const errors = [];
    showLoading();
    try {
        for (let i = 0; i < items.length; i += USER_CHUNK_SIZE) {
            const chunk = items.slice(i, i + USER_CHUNK_SIZE);
            try {
                const response = await axios.put("api/users/assignments/bulk", chunk);
                response.data.forEach(status => {
                    if (status.status === "updated") updated.push(status.clientId);
                    else errors.push({ id: status.clientId, error: status.message || "failed" });
                });
            } catch (error) {
                console.error("Error during bulk update of the team: ", error);
                const message = getErrorMessage(error);
                chunk.forEach(item => errors.push({ id: item.clientId, error: message }));
            }
        }

        if (updated.length > 0) await deleteTableRows(userTable, updated);
        if (errors.length > 0)  await updateTableRows(userTable, errors);
    } finally {
        hideLoading();
    }

    // Summary --------------------------------------------------
    if (items.length > 1 || skippedReasons.length > 0) {
        let message = `${updated.length} ${updated.length === 1 ? "row" : "rows"} updated.`;
        if (skippedReasons.length > 0) {
            message += ` ${skippedReasons.length} selected skipped (${[...new Set(skippedReasons)].join(", ")}).`;
        }
        if (errors.length > 0) {
            message += ` ${errors.length} failed (see the rows).`;
        }
        (errors.length > 0 ? toast.error : toast.success)(message);
    } else if (errors.length > 0) {
        toast.error("Failed to update User: " + errors[0].error);
    }
}
