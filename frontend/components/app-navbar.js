// Shared page navbar: <app-navbar></app-navbar>
// Needs Bootstrap's JS bundle (burger menu) and scss/_navbar.scss, which sets the burger breakpoint.
const NAV_ENTRIES = [
    ['Data Input', 'input.html'],
    ['Data Migration', 'migration.html'],
    ['Data Explorer', 'explorer.html'],
    ['Report', 'report.html'],
    ['Data Export', 'export.html'],
    ['Settings', 'settings.html'],
];

class AppNavbar extends HTMLElement {
    connectedCallback() {
        const current = location.pathname.split('/').pop() || 'index.html';
        const items = NAV_ENTRIES.map(([label, href]) => `
                        <li class="nav-item">
                            <a class="nav-link${href === current ? ' active' : ''}" href="${href}"${href === current ? ' aria-current="page"' : ''}>${label}</a>
                        </li>`).join('');

        this.innerHTML = `
            <nav class="navbar" data-bs-theme="dark">
                <div class="container-fluid">
                    <a class="navbar-brand" href="index.html"${current === 'index.html' ? ' aria-current="page"' : ''}>
                        <img src="img/logo_arbodat_plus.png" width="109" height="60" alt="ArboDat+ home">
                    </a>
                    <button class="navbar-toggler" type="button" data-bs-toggle="collapse"
                            data-bs-target="#app-navbar-menu" aria-controls="app-navbar-menu"
                            aria-expanded="false" aria-label="Toggle navigation">
                        <span class="navbar-toggler-icon"></span>
                    </button>
                    <div class="collapse navbar-collapse" id="app-navbar-menu">
                        <ul class="navbar-nav">${items}
                        </ul>
                    </div>
                </div>
            </nav>`;

        this.addEventListener('click', (event) => {
            if (event.target.closest('.nav-link')) {
                window.bootstrap?.Collapse.getInstance(this.querySelector('.navbar-collapse'))?.hide();
            }
        });
    }
}

customElements.define('app-navbar', AppNavbar);
