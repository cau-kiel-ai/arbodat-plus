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
OpenStreetMap (see the comments in that file for why, and `../info/TODO.md` for the CDN
dependencies this still has). Both `docker-compose.yml` (dev) and `Dockerfile` (prod) use it, so
dev and prod route requests identically. It is not optional glue — always run this app behind that
nginx config, whether via the Dockerfile below or `docker compose --profile dev up`.

## Building the CSS

SCSS lives in `sass/` (+ `bootstrap-scss/`) and compiles to `css/*.min.css`. `css/` is git-ignored
except for `.gitkeep` — it's build output, not source. `Dockerfile` compiles it automatically; for
local editing without Docker, see the *Live Sass Compiler* settings in the top-level
[`../README.md`](../README.md#frontend).

Files starting with `_` (e.g. `sass/_stickyAccordion.scss`) are Sass *partials*: they are never
compiled to their own CSS file, only pulled into a page stylesheet via `@import` (e.g.
`@import 'stickyAccordion';` in `input.scss`). Use a partial for styles shared
by several pages. `Dockerfile` renames `*.scss` to `*.min.scss` before compiling (to get the
`.min.css` output names) but skips partials, so that `@import` still finds them by their original name.

## Version stamping

Five pages have a `Version __APP_VERSION__` placeholder in their footer. `Dockerfile` replaces it
via `--build-arg APP_VERSION=x.y.z` and also writes `/version.json` (`{"version": "..."}`), which
the desktop app and ops use to confirm which version is actually running after an update. Pages
without a footer (`contact.html`, `license.html`, `report.html`) have no placeholder — `sed` simply
finds nothing to replace there, which is expected.

## Docker image

`Dockerfile` compiles the CSS and stamps the version in a `node:24-alpine` build stage, then copies
only what's actually served — the HTML pages, `js/`, the compiled CSS, and the images — into an
`nginx:1.30-alpine` runtime stage. Multi-arch (`linux/amd64`, `linux/arm64`), no `RUN` in the runtime stage.
