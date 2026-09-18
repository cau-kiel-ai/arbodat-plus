let jsonData = [];

function displayJSON() {
    document.getElementById("jsonDisplay").textContent = JSON.stringify(jsonData, (key, value) => {
        // These attributes are not displayed in the JSON
        if (key === "auxiliaryId" || key === "item" || key === "itemId" || key === "siteId" || 
            key === "sampleId" || key === "absoluteDatingId" || key === "number") {
            return undefined;
        }
        return value;
    }, 4);
}

// Display JSON when loading the page
displayJSON();

function downloadJSON() {
    const dataStr = JSON.stringify(jsonData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "nonMatchingLabels.json";
    a.click();

    // Revoke later: WebKit (macOS app window) cancels downloads whose blob URL is already revoked.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}