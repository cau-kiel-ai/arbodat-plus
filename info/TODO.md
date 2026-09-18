# ArboDat+ – TODO

Work that is deliberately **not** part of the v5.0.0 release (desktop app + GHCR distribution).
Each entry says what to do and why.

## Backend (web-api)

- [ ] **Health & version endpoints.** Add Spring Boot Actuator (`/actuator/health`, `/actuator/info` with the
  build version via `springBoot { buildInfo() }`). Today there is no such endpoint, so the Docker healthcheck and the
  desktop app use `GET /results?page=0&size=1` (queries the DB) and read the version from the frontend's
  `version.json`. A real endpoint is cheaper, reports DB connectivity explicitly, and lets the desktop app confirm
  the backend version after an update.
- [ ] **Flyway migrations instead of `ddl-auto=update`.** Hibernate `update` adds tables/columns at startup but never
  renames, drops or migrates data, and it fails silently or late. Flyway gives versioned, reviewable SQL migrations
  (`db/migration/V1__baseline.sql`, …) and a `flyway_schema_history` table, so upgrades and rollbacks become explicit.
  Start with a baseline of the current schema (`baselineOnMigrate`) so existing databases are adopted unchanged.
  Should be done before releases that change the schema are shipped through the desktop app's update.
- [ ] **Upgrade Spring Boot.** 3.3.x no longer gets OSS support. Move to a supported line and re-test the `.mdb` migration.
- [ ] **CSRF / DNS-rebinding hardening.** Wildcard CORS (`@CrossOrigin("*")`) was removed in v5, so other websites can
  no longer *read* the API or send JSON requests to it. They can still trigger "simple" cross-site requests (HTML
  forms, multipart uploads) whose responses they cannot read. Reject `/api/` requests whose `Origin` header doesn't
  match the host (nginx `map` on `$http_origin`) and add a `Host` allowlist. Document that server reverse proxies must
  forward the original `Host` header.
- [ ] **Authentication for server deployments.** The API has no login. Until it does, server installs must stay
  inside an intranet/VPN or behind reverse-proxy authentication (e.g. OIDC via oauth2-proxy).
- [ ] **Optimistic locking.** Add `@Version` to the entities so two users editing the same record on a shared server
  don't silently overwrite each other.

## Frontend

- [ ] **Vendor the CDN libraries.** jQuery, axios, Bootstrap, Leaflet, Tabulator, SheetJS, select2 and proj4 load from
  5 CDNs (axios and SheetJS unpinned). As a result the UI doesn't work offline, every page view sends the user's IP
  address to third parties, and an unpinned CDN update can break the app. Ship pinned copies in `frontend/vendor/`.
- [ ] **Replace `alert()`.** There are 28 `alert()` calls. macOS WKWebView ignores `alert()`, so the desktop app injects
  a shim. In-page notifications (e.g. Bootstrap toasts) work everywhere.
- [ ] **Clean up assets.** Remove the unused images in `frontend/img` (~81 MB, e.g. `banner.tif`) and the dead
  `manual.html` link in `input.html`.

## Desktop app & release

- [ ] **In-app updater.** Use the Tauri updater plugin: the app checks GitHub Releases for a signed `latest.json`, then
  downloads, verifies and installs the new version. After the restart the app updates the local stack (backup → pull
  → restart) as it does today. This needs an update-signing key pair (a secret in CI) and a release workflow that
  publishes `latest.json`. Until then users download new versions manually.
- [ ] **release-please Release PR.** A bot opens a "Release x.y.z" PR after merges to `main`. The PR bumps the version
  in all files and writes the CHANGELOG from conventional commits. Merging it creates the tag that triggers the
  release workflow. This replaces the manual `scripts/set-version.mjs` + `git tag` steps.
- [ ] **Code signing & notarization.** Apple Developer ID + notarization (macOS), Authenticode (Windows, e.g. Azure
  Trusted Signing or SignPath Foundation). This removes the Gatekeeper "Open Anyway" / SmartScreen warnings and the
  repeated macOS privacy prompts after updates.
- [ ] **Periodic automatic backups.** v1 backs up before updates and on demand. Resetting Docker Desktop to factory
  defaults, or uninstalling it, deletes all volumes. An automatic backup (e.g. on app start when the last one is
  older than 7 days, keeping the last N) protects users who never click "Backup".
- [ ] **Windows arm64 build.**
- [ ] **Tauri 3.** Migrate once it is stable (alphas since Sep 2026); stay on 2.x until then.
- [ ] **License notices for the desktop bundle.** Generate them from the Cargo/npm dependencies (e.g. cargo-about) and
  ship them with the installers.
- [ ] **Supply-chain hygiene.** Pin `postgres` by digest (or mirror it to GHCR to avoid Docker Hub rate limits), and add
  image vulnerability scanning + an SBOM to CI.
- [ ] **Nominatim caching & rate limiting.** OSM's usage policy allows at most 1 request/s. Add `proxy_cache` and
  `limit_req` to the nginx `/nominatim-reverse` location.
