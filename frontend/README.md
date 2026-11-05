# ArboDat+ frontend

A static, multi-page HTML/JS app (no framework, no bundler) served by nginx. There is one HTML
page per module plus its own JS files; pages talk to the backend via plain `fetch`/axios calls to
relative URLs (`api/...`), which only work when the app is actually served through nginx (see
below) — opening an `.html` file directly from disk will not work.

## Pages

| Page | Purpose |
|---|---|
| `index.html` | Landing page |
| `input.html` | Data Input |
| `migration.html` | Data Migration (import from legacy MS Access ArboDat) |
| `explorer.html` | Data Explorer (query/filter/edit/export) |
| `report.html` | Data Report (placeholder WIP) |
| `export.html` | Data Export |
| `settings.html` | Settings page (default values for DANTE dropdowns) |
| `contact.html`, `license.html` | Static pages |

Each page's JS lives under `js/` in a matching subfolder (`js/input/`, `js/migration/`,
`js/explorer/`, `js/export/`, `js/settings/`), plus `js/danteAttributes/` (shared: loads/pushes the
DANTE vocabulary lists used across Data Input and Migration).

## nginx: how this becomes one origin

`nginx/templates/default.conf.template` is what actually makes the app work: it serves these
static files *and* reverse-proxies `/api/` to the `web-api` container and `/nominatim-reverse` to
OpenStreetMap (see the comments in that file for why). Both `docker-compose.yml` (dev) and `Dockerfile` (prod) use it, so
dev and prod route requests identically. It is not optional glue — always run this app behind that
nginx config, whether via the Dockerfile below or `docker compose --profile dev up`.

## Building the CSS

SCSS lives in `scss/` (+ Bootstrap's SCSS in `vendor/bootstrap@<version>/scss/`) and compiles to `css/*.min.css`. `css/` is git-ignored
except for `.gitkeep` — it's build output, not source. `Dockerfile` compiles it automatically; for
local editing without Docker, see the *Live Sass Compiler* settings in the top-level
[`../README.md`](../README.md#frontend).

Files starting with `_` (e.g. `scss/_stickyAccordion.scss`) are Sass *partials*: they are never
compiled to their own CSS file, only pulled into a page stylesheet via `@import` (e.g.
`@import 'stickyAccordion';` in `input.scss`). Use a partial for styles shared
by several pages. `Dockerfile` renames `*.scss` to `*.min.scss` before compiling (to get the
`.min.css` output names) but skips partials, so that `@import` still finds them by their original name.

## Third-party libraries (`vendor/`)

No library is loaded from a CDN: the pages reference pinned copies under `vendor/<package>@<version>/`,
so the UI works offline and no visitor data goes to third parties. (Only the map tiles and reverse
geocoding still need the internet.)

- `package.json` / `package-lock.json` are the single source of truth for the versions (exact pins).
- `npm run vendor` (`scripts/vendor.mjs`) copies the needed files from `node_modules/` into `vendor/`
  and rewrites every `vendor/<package>@<version>/` reference in `*.html` and `scss/*.scss`.
- `vendor/` is **committed**, so running the app (dev bind mount, Live Sass) needs no Node. CI re-runs
  the script and fails if the committed files differ from the lockfile.
- Because the folder name contains the version, nginx serves `/vendor/` with `Cache-Control: immutable`.

Add or bump a library:

```
cd frontend
npm install --save-exact <package>@<version>     # or edit package.json, then: npm install
# new library only: add its files to the `manifest` in scripts/vendor.mjs and the tags to the pages
npm run vendor
```

Then commit `package.json`, `package-lock.json`, `vendor/` and the changed pages.

Notes:
- **SheetJS (`xlsx`)** is installed from SheetJS's own server (`https://cdn.sheetjs.com/xlsx-<version>/...tgz`),
  because the copy on the npm registry is outdated and vulnerable.
- **select2** is still on `4.1.0-rc.0` (no final release exists) and needs jQuery, so load jQuery first.
- Bootstrap's SCSS in `vendor/` is build input only: the Dockerfile deletes it from the image and nginx
  never serves `*.scss`.

## Version stamping

The shared footer lives in `components/app-footer.js` and contains a `Version __APP_VERSION__` placeholder.
`Dockerfile` replaces it via `--build-arg APP_VERSION=x.y.z` and also writes `/version.json`
(`{"version": "..."}`), which the desktop app and ops use to confirm which version is actually running
after an update. With the dev bind mount (`frontend-dev`) nothing is stamped, so the footer shows the
literal placeholder.

## Shared components

Markup used on several pages is a native Web Component in `components/` (no build step). A page loads
the component with `<script src="components/<name>.js"></script>` in its `<head>` and uses the element
where it belongs. Components render into the normal DOM (no shadow root); their styles are a `scss/_<name>.scss`
partial, imported by every page stylesheet that uses the component (`stub.scss` serves the plain content
pages `report`/`contact`/`license`).

- `<app-footer>` (`components/app-footer.js`, `_footer.scss`): License / version / Contact. Has `margin-top: auto`,
  which pins it to the bottom of short pages (the `<body>` is a flex column).
- `<app-navbar>` (`components/app-navbar.js`, `_navbar.scss`): Bootstrap navbar with the logo as home link and the
  module entries (edit `NAV_ENTRIES` to change them). Highlights the current page and collapses into a burger menu
  below `$navbar-breakpoint` (top of `_navbar.scss`), so the page must load Bootstrap's JS bundle. It is sticky at
  the top of the page; its height (66px) must match `--page-header-height` in `_stickyAccordion.scss`.

## Docker image

`Dockerfile` compiles the CSS and stamps the version in a `node:24-alpine` build stage, then copies
only what's actually served — the HTML pages, `js/`, the compiled CSS, and the images — into an
`nginx:1.30-alpine` runtime stage. Multi-arch (`linux/amd64`, `linux/arm64`), no `RUN` in the runtime stage.
