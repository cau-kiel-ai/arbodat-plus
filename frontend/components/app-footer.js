// Shared page footer: <app-footer></app-footer>
// Styles live in scss/_footer.scss. The Dockerfile replaces __APP_VERSION__ at build time.
class AppFooter extends HTMLElement {
    connectedCallback() {
        this.setAttribute('role', 'contentinfo');
        const current = location.pathname.split('/').pop();
        const active = (href) => (href === current ? ' class="active" aria-current="page"' : '');

        this.innerHTML = `
            <a href="contact.html"${active('contact.html')}>Contact<strong style="font-size: 16px;"> ☏ </strong></a>
            <span>Version __APP_VERSION__</span>
            <a href="license.html"${active('license.html')}><strong style="font-size: 19px;"> ⚖ </strong>License</a>`;
    }
}

customElements.define('app-footer', AppFooter);
