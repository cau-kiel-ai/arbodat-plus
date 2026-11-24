// Escape text for use in innerHTML and in quoted HTML attribute values.
// Use it for everything which comes from the database, an uploaded file or DANTE and is put into a template string.
function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    }[character]));
}
