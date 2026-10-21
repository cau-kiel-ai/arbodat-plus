// Confirmation popup for updates.
// Usage: confirmUpdate("sample").then(confirmed => { if (!confirmed) return; ... });
function confirmUpdate(entity) {
    return new Promise(resolve => {
        const previouslyFocused = document.activeElement;

        // Overlay -------------------------------------------
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed',
            inset: '0',
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: 99998
        });

        // Dialog --------------------------------------------
        const dialog = document.createElement('div');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        Object.assign(dialog.style, {
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '420px',
            maxWidth: '90vw',
            padding: '20px',
            background: '#fff',
            borderRadius: '10px',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
            fontFamily: 'Arial, sans-serif',
            color: '#333'
        });

        const title = document.createElement('h3');
        title.textContent = `Update ${entity}?`;
        title.style.marginTop = '0';

        const text = document.createElement('p');
        text.textContent = `The existing ${entity} will be overwritten with the current values.`;

        const buttons = document.createElement('div');
        Object.assign(buttons.style, {
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            marginTop: '20px'
        });

        const baseButtonStyle = {
            height: '36px',
            padding: '0 16px',
            cursor: 'pointer',
            borderRadius: '5px',
            border: '1px solid #ccc',
            font: 'inherit'
        };

        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.textContent = 'Cancel';
        Object.assign(cancelButton.style, baseButtonStyle, {
            background: '#f2f2f2',
            color: '#333'
        });

        const updateButton = document.createElement('button');
        updateButton.type = 'button';
        updateButton.textContent = 'Update';
        Object.assign(updateButton.style, baseButtonStyle, {
            background: 'rgb(37, 16, 193)',
            borderColor: 'rgb(37, 16, 193)',
            color: '#fff'
        });

        buttons.append(cancelButton, updateButton);
        dialog.append(title, text, buttons);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        updateButton.focus();

        // Close ---------------------------------------------
        function close(confirmed) {
            document.removeEventListener('keydown', onKeydown, true);
            overlay.remove();
            if (previouslyFocused && previouslyFocused.focus) {
                previouslyFocused.focus({ preventScroll: true });
            }
            resolve(confirmed);
        }

        function onKeydown(event) {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                close(false);
            } else if (event.key === 'Tab') { // keep focus inside the dialog
                event.preventDefault();
                (document.activeElement === updateButton ? cancelButton : updateButton).focus();
            }
        }

        cancelButton.addEventListener('click', () => close(false));
        updateButton.addEventListener('click', () => close(true));
        overlay.addEventListener('mousedown', event => {
            if (event.target === overlay) close(false);
        });
        document.addEventListener('keydown', onKeydown, true);
    });
}
