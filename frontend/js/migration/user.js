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
                editor: usersEditor,
                formatter: cell => {
                    const names = userNames(cell.getValue() ?? []);
                    return names ? escapeHtml(names) : `<span class="migration-result-placeholder">select</span>`;
                },
                tooltip: (e, cell) => escapeHtml(userNames(cell.getValue() ?? [])),
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

// Editor of the 'Users' column: several users with a search field (select2).
// Tabulator's list editor can't search when several values can be chosen.
// - chosen users are not in the list any more (removed with the x of their pill)
// - after a user is chosen the search text is cleared
// - the column grows with the pills, so all chosen users stay visible
// Closing the list (click outside, Esc) takes the selection; an unchanged selection is no edit.
const defaultMatcher = $.fn.select2.defaults.defaults.matcher;

function usersEditor(cell, onRendered, success, cancel) {
    const before = cell.getValue() ?? [];
    const select = document.createElement("select");
    select.multiple = true;
    userOptions.forEach(option => select.appendChild(new Option(option.label, option.value, false, before.includes(option.value))));

    onRendered(() => {
        const $select = $(select).select2({
            placeholder: "search",
            closeOnSelect: false,           // several users one after another
            width: "100%",
            dropdownParent: $(document.body),
            // Chosen users are not offered (and can't be highlighted / deselected by Enter)
            matcher: (params, data) => data.element?.selected ? null : defaultMatcher(params, data),
        });
        const select2 = $select.data("select2");
        select2.$container.addClass("users-editor");           // looks like the table cell (see migration.scss)

        // The dropdown is placed directly under the table cell and as wide as it (select2 would align it
        // to its own, smaller field). select2 positions it on open, scroll and resize: corrected after it.
        const dropdown = select2.dropdown;
        const placeUnderCell = () => {
            const rect = cell.getElement().getBoundingClientRect();
            const $parent = dropdown.$dropdownParent;
            const parentOffset = $parent.css("position") !== "static" ? $parent.offset() : { top: 0, left: 0 };
            const above = dropdown.$dropdown.hasClass("select2-dropdown--above");
            const top = above ? rect.top + window.scrollY - dropdown.$dropdown.outerHeight(false) : rect.bottom + window.scrollY;
            // 1px to the left: the dividing line on the left belongs to the cell before
            dropdown.$dropdownContainer.css({ top: top - parentOffset.top, left: rect.left - 1 + window.scrollX - parentOffset.left });
            dropdown.$dropdown.css({ width: rect.width + 1 });
        };
        for (const name of ["_positionDropdown", "_resizeDropdown"]) {
            const original = dropdown[name]?.bind(dropdown);
            if (original) dropdown[name] = (...args) => { original(...args); placeUnderCell(); };
        }

        // Wider column for all pills
        const column = cell.getColumn();
        const fit = () => {
            if (!$select.data("select2")) return; // editor already closed
            const selection = select2.$container.find(".select2-selection")[0];
            const needed = selection.scrollWidth + 12; // + cell padding
            if (needed > column.getWidth()) column.setWidth(needed);
            placeUnderCell();
        };

        // After a user is chosen (or removed with x): clear the search text and list the users again.
        // The query is triggered directly: select2 ignores an input event right after Enter, and Enter on a
        // stale, already chosen entry would close the list.
        const refresh = () => setTimeout(() => {
            select2.$container.find(".select2-search__field").val("");
            select2.trigger("query", { term: "" });
        });
        $select.on("select2:select select2:unselect", refresh);

        // The list stays open when a user is removed with the x of its pill, and on a click into the cell
        // (select2 would close it: a click on its field toggles the list)
        let keepOpen = false;
        const keepOpenNow = () => {
            keepOpen = true;
            setTimeout(() => keepOpen = false);
        };
        $select.on("select2:unselect", keepOpenNow);
        // Capture phase: before select2's own handler on its field (it toggles on click).
        // Removed again on close: the cell element stays as long as its row.
        const cellElement = cell.getElement();
        cellElement.addEventListener("mousedown", keepOpenNow, true);
        cellElement.addEventListener("click", keepOpenNow, true);
        $select.on("select2:closing", event => {
            if (keepOpen) event.preventDefault();
        });
        $select.on("change", () => setTimeout(fit));
        $select.one("select2:close", () => {
            cellElement.removeEventListener("mousedown", keepOpenNow, true);
            cellElement.removeEventListener("click", keepOpenNow, true);
            const values = $select.val() ?? [];
            $select.select2("destroy");
            const unchanged = values.length === before.length && values.every(value => before.includes(value));
            unchanged ? cancel() : success(values);
        });

        fit();
        $select.select2("open");
        fit();
    });
    return select;
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
