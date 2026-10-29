function populateFractionsAnalyzed(fractionAnalyzedList) {
    const tableBody = document.getElementById("fractionAnalyzedTableBody");

    // Create lines
    fractionAnalyzedList.forEach((item, index) => {
        const row = document.createElement("tr");
        row.dataset.originalIndex = index;
        
        const siteLabel        = item.siteLabel;
        const sampleId         = item.sampleId;
        const fractionAnalyzed = item.fractionAnalyzed;
        const orgOrMin         = item.orgOrMin;
        const sieveSize        = item.sieveSize;
        const originalFraction = item.fraction;
        const fraction         = item.fraction;

        row.dataset.siteLabel        = siteLabel;
        row.dataset.sampleId         = sampleId;
        row.dataset.fractionAnalyzed = fractionAnalyzed;
        row.dataset.originalFraction = originalFraction;
        row.dataset.fraction         = fraction;

        // Add columns
        row.innerHTML = `
            <td><input type="checkbox"></td>
            <td>${siteLabel}
                <br>
                ${item.featureLabel}
                <br>
                ${item.sampleLabel}
            </td>
            <td>${fractionAnalyzed}</td>
            <td>${item.modifiedFraction ? fraction : ''}</td>
            <td>
                <select id="orgOrMin_${sampleId}_${fraction.replace(/[^\w-]/g, '_')}"
                        onchange="updateCheckedDropdowns(this.value, 'fractionAnalyzedTableBody', 'orgOrMin_')"
                        original-value="${originalFraction}">
                        <option value="org" ${orgOrMin === 'org' ? 'selected' : ''}>org</option>
                        <option value="min" ${orgOrMin === 'min' ? 'selected' : ''}>min</option>
                </select>
            </td>
            <td>
                <input type="text" 
                        id="sieveSize_${sampleId}_${fraction.replace(/[^\w-]/g, '_')}"
                        onchange="updateCheckedInputs(this.value, 'fractionAnalyzedTableBody', 'sieveSize_')"
                        value="${sieveSize ?? ''}"
                        original-value="${originalFraction}">
            </td>
            <td>
                <button 
                    id="createButton_${sampleId}_${fraction.replace(/[^\w-]/g, '_')}"
                    type="button">
                    Create
                </button>
            </td>
        `;

        const createButton = row.querySelector(`#createButton_${sampleId}_${fraction.replace(/[^\w-]/g, '_')}`);
        createButton.addEventListener('click', function () {
            const orgOrMinSelectElement = row.querySelector(`#orgOrMin_${sampleId}_${fraction.replace(/[^\w-]/g, '_')}`);
            const orgOrMin  = orgOrMinSelectElement.value;

            const sieveSizeInputElement = row.querySelector(`#sieveSize_${sampleId}_${fraction.replace(/[^\w-]/g, '_')}`);
            const sieveSize = sieveSizeInputElement.value;

            createFractionAnalyzed (orgOrMin, sieveSize, row)
        });
        
        tableBody.appendChild(row);
    });
}

document.getElementById("sieveSizeHeader").addEventListener("click", sortBySieveSize);

let sieveSizeSortState = 0;
// 0 = original
// 1 = ascending
// 2 = descending

function sortBySieveSize() {
    const tableBody = document.getElementById("fractionAnalyzedTableBody");
    const header = document.getElementById("sieveSizeHeader");
    const rows = Array.from(tableBody.querySelectorAll("tr"));

    sieveSizeSortState = (sieveSizeSortState + 1) % 3;

    // Original order
    if (sieveSizeSortState === 0) {
        rows.sort((a, b) => {
            return Number(a.dataset.originalIndex)
                - Number(b.dataset.originalIndex);
        });
        header.innerHTML = "sieveSize";
    }

    // Ascending order
    else if (sieveSizeSortState === 1) {
        rows.sort((a, b) => {
            const aValue = parseFloat(
                a.querySelector('input[id^="sieveSize_"]').value
            ) || 0;
            const bValue = parseFloat(
                b.querySelector('input[id^="sieveSize_"]').value
            ) || 0;
            return aValue - bValue;
        });
        header.innerHTML = "sieveSize ▲";
    }

    // Descending order
    else {
        rows.sort((a, b) => {
            const aValue = parseFloat(
                a.querySelector('input[id^="sieveSize_"]').value
            ) || 0;
            const bValue = parseFloat(
                b.querySelector('input[id^="sieveSize_"]').value
            ) || 0;
            return bValue - aValue;
        });
        header.innerHTML = "sieveSize ▼";
    }

    tableBody.innerHTML = "";
    rows.forEach(row => tableBody.appendChild(row));
}

async function postFractionAnalyzed(payload) {
    const response = await fetch(
        'api/fractions_analyzed',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        }
    );
    if (!response.ok) {
        throw new Error(`HTTP Error! Status: ${response.status}`);
    }
    const data = await response.text();
    console.log(data);
    return data;
}

// Fill fractionAnalyzed, orgOrMin and sieveSize in all matching result rows
function fillResultFractionCells(siteLabel, sampleId, originalFraction, fractionAnalyzed, orgOrMin, sieveSize) {
    const resultTableBody =
        document.getElementById(`resultTableBody_${siteLabel}`);

    Array.from(resultTableBody.rows).forEach(row => {
        const sampleCell           = row.cells[2];
        const fractionAnalyzedCell = row.cells[5];
        const orgOrMinCell         = row.cells[6];
        const sieveSizeCell        = row.cells[7];

        if (
            sampleCell.getAttribute('data-sampleId') === sampleId &&
            orgOrMinCell.getAttribute('data-originalFraction') === originalFraction &&
            sieveSizeCell.getAttribute('data-originalFraction') === originalFraction
        ) {
            fractionAnalyzedCell.textContent = fractionAnalyzed;
            orgOrMinCell.textContent = orgOrMin;
            sieveSizeCell.textContent = sieveSize;
        }
    });
}

// True if the 'Fractions Analyzed' table still has a row for this site + sample + fraction
function hasPendingFractionAnalyzedRow(siteLabel, sampleId, fraction) {
    const tableBody = document.getElementById("fractionAnalyzedTableBody");
    return Array.from(tableBody.rows).some(row =>
        row.dataset.siteLabel === siteLabel &&
        row.dataset.sampleId === String(sampleId) &&
        row.dataset.originalFraction === fraction
    );
}

// Open popup to create a fraction analyzed for a result row without pending fraction analyzed row
function openCreateFractionModal(item, resultRow) {
    const result           = item.result;
    const siteLabel        = result.sample.feature.site.label;
    const sampleId         = String(result.sample.id);
    const originalFraction = item.fractionAnalyzed.fraction;

    const modal        = document.getElementById("fractionAnalyzedModal");
    const select       = document.getElementById("fractionAnalyzedModalSelect");
    const orgRadio     = document.getElementById("fractionAnalyzedModalOrg");
    const minRadio     = document.getElementById("fractionAnalyzedModalMin");
    const sieveInput   = document.getElementById("fractionAnalyzedModalSieveSize");
    const submitButton = document.getElementById("fractionAnalyzedModalSubmitButton");

    // Reset form ---------------------------------------------------
    select.value = "";
    orgRadio.checked = false;
    minRadio.checked = false;
    sieveInput.value = "";
    [orgRadio, minRadio, sieveInput].forEach(el => { el.disabled = true; el.required = false; });

    document.getElementById("fractionAnalyzedModalInfo").innerHTML =
        `${siteLabel}<br>${result.sample.feature.label}<br>${result.sample.label}`;

    // Enable orgOrMin and sieveSize when fractionAnalyzed is selected
    select.onchange = function () {
        const enabled = select.value !== "";
        [orgRadio, minRadio, sieveInput].forEach(el => { el.disabled = !enabled; el.required = enabled; });
    };

    // Show Popup ---------------------------------------------------
    modal.style.display = "block";

    const closeModal = () => { modal.style.display = "none"; };
    modal.querySelector(".close").onclick = closeModal;
    modal.onclick = function (event) {
        if (event.target === modal) { closeModal(); }
    };

    submitButton.onclick = async function () {
        const fractionAnalyzed = select.value;
        const orgOrMin         = (orgRadio.checked && "org") || (minRadio.checked && "min") || "";
        const sieveSize        = sieveInput.value;

        if (!fractionAnalyzed || !orgOrMin || !sieveSize) {
            toast.info("Please select fraction analyzed, organic / minerals and enter a sieve size.");
            return;
        }

        try {
            await postFractionAnalyzed({
                fractionAnalyzed: fractionAnalyzed,
                orgOrMin: orgOrMin,
                sieveSize: sieveSize,
                sample: {
                    id: sampleId
                }
            });

            fillResultFractionCells(siteLabel, sampleId, originalFraction, fractionAnalyzed, orgOrMin, sieveSize);
            closeModal();

            // Continue with creating the result
            createResult(resultRow.dataset.itemId, resultRow);
        } catch (error) {
            console.error('Error:', error);
            alert("Failed to create FractionAnalyzed.");
        }
    };
}

async function createFractionAnalyzed (orgOrMin, sieveSize, row, triggerNext=true) {
    const siteLabel = row.dataset.siteLabel;
    const sampleId = row.dataset.sampleId;
    const fractionAnalyzed = row.dataset.fractionAnalyzed;
    const originalFraction = row.dataset.originalFraction;

    if (orgOrMin && sieveSize) {

        const payload = {
            fractionAnalyzed: fractionAnalyzed,
            orgOrMin: orgOrMin,
            sieveSize: sieveSize,
            sample: {
                id: sampleId 
            }
        };

        try {
            await postFractionAnalyzed(payload);

            fillResultFractionCells(siteLabel, sampleId, originalFraction, fractionAnalyzed, orgOrMin, sieveSize);

            row.remove();
            if (triggerNext) { updateCheckedFractionAnalyzed(); }
            return true;

        } catch (error) {
            console.error('Error:', error);
            alert("Failed to create FractionAnalyzed.");
        }

    } else {
        if (triggerNext) {
            toast.info(`No orgOrMin selected and/or sieveSize entered.`);
        }
        return false;
    }    
}

async function updateCheckedFractionAnalyzed() {
    const tableBody = document.getElementById('fractionAnalyzedTableBody');
    if (tableBody) {
        const checkboxes = Array.from(
            tableBody.querySelectorAll('input[type="checkbox"]:checked')
        );
        const concurrencyLimit = 100;
        showLoading();
        try {
            for (let i = 0; i < checkboxes.length; i += concurrencyLimit) {
                const batch = checkboxes.slice(i, i + concurrencyLimit);

                const promises = batch.map(async checkbox => {
                    if (checkbox.disabled) return true;

                    const row = checkbox.closest('tr');

                    const sampleId = row.dataset.sampleId;
                    const fraction = row.dataset.fraction;
                    const orgOrMinSelectElement =
                        row.querySelector(
                            `#orgOrMin_${sampleId}_${fraction.replace(/[^\w-]/g, '_')}`
                        );
                    const orgOrMin =
                        orgOrMinSelectElement.value;

                    const sieveSizeInputElement =
                        row.querySelector(
                            `#sieveSize_${sampleId}_${fraction.replace(/[^\w-]/g, '_')}`
                        );
                    const sieveSize =
                        sieveSizeInputElement.value;

                    return createFractionAnalyzed(orgOrMin, sieveSize, row, triggerNext = false);
                });

                await Promise.allSettled(promises);
            }
        } finally {
            hideLoading();
        }
    }
}
