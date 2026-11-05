// Reason of a failed request: message sent by the backend, else the client-side error message
function getErrorMessage(error) {
    const data = error.response?.data;
    return (typeof data === "string" && data) ? data : error.message;
}

// Wrapper
const toast = {
    success: msg => showToast('success', msg),
    info: msg => showToast('info', msg),
    error: msg => showToast('error', msg)
};

function showToast(type, message) {
    const iconMap = {
        success: '✅',
        info:    '⚠️',
        error:   '❌'
    };    
    const colorMap = {
        success: '#22c55e',
        info:    '#f59e0b',
        error:   '#ef4444'
    };

    // toast Container ----------------------------------------
    let container = document.querySelector('.toast-container');

    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';

        Object.assign(container.style, {
            position: 'fixed',
            top: '8px',
            right: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            zIndex: 99999
        });

        document.body.appendChild(container);
    } // ------------------------------------------------------
    
    const toast = document.createElement('div');

    Object.assign(toast.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        minWidth: '260px',
        maxWidth: '520px',

        padding: '12px 14px',
        background: '#fff',
        borderRadius: '6px',
        border: `2px solid ${colorMap[type]}`,

        opacity: '1',
        transition: 'all 0.25s ease'
    });

    toast.innerHTML = `
        <div style="font-size:18px; color:${colorMap[type] || '#999'}">
            ${iconMap[type]}
        </div>

        <div style="flex:1; font-size:16px; color:#333">
            ${escapeHtml(message)}
        </div>
    `;

    container.appendChild(toast);

    // auto remove
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(8px)';

        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
