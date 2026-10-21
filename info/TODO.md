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

## Release process

- [ ] **Decide a CITATION.cff versioning policy.** It already tracks its own Zenodo DOI
  (`10.5281/zenodo.17938312`) independently of the app version (currently `1.3.0` vs. the app's
  `4.0.0`). The v5.0.0 release automation (`scripts/check-version.mjs`) deliberately does not touch
  it, so it stays a manual, deliberate action by a maintainer — bumping it on every release
  candidate would mint a citable DOI snapshot for builds nobody should actually cite. Decide
  whether/when to automate it (e.g. only on stable, non-prerelease tags) once there's a real
  release cadence to look at.
- [ ] **Move CI to Ubuntu 26.04 on purpose.** The workflows pin `ubuntu-24.04` because GitHub is
  moving `ubuntu-latest` to 26.04 (from 2026-10-19). Try 26.04 in a branch (the `smoke` jobs rely on
  the runner's Docker/Compose, and the Tauri job on the webkit packages), then switch the pins. Also
  re-check the pinned action versions then: the Docker actions are pinned by commit SHA and need a
  manual bump (`git ls-remote https://github.com/<action>.git refs/tags/<tag>` gives the SHA).
- [ ] **Long-term maintenance (nobody can promise LTS for Actions/images).** Released images and
  installers never expire; what decays is the ability to build a *new* release or ship a fix.
  (1) `.github/dependabot.yml` for github-actions, docker, gradle, npm and cargo, plus auto-merge on
  green CI and Dependabot security updates in the repo settings. (2) `docs/MAINTENANCE.md`: the support
  horizons below, how to bump the SHA pins, and a local release path independent of GitHub Actions
  (`buildx` multi-arch push, `pnpm tauri build` per OS). (3) **Before v5.0.0** (cheapest moment):
  evaluate the baselines. Java 17 ends 2027-10-31 (21: 2029-12, 25: 2031-09). PostgreSQL 16 ends
  2028-11-09 (17: 2029-11, 18: 2030-11); check the Docker image's data-directory layout (changed in
  18, unverified) and Hibernate/JDBC compatibility; our import/update path is dump-based, so a major
  jump is supported. Spring Boot 3.3 has been out of OSS support since 2025-06-30; each line gets only
  about 13 months (3.5: 2026-06, 4.0: 2026-12, 4.1: 2027-07), so plan a yearly upgrade or commercial
  support. Scheduled workflows are disabled after 60 days without repo activity (per GitHub docs), so
  don't rely on a cron as the only early warning. Dates from endoflife.date, fetched 2026-10-21.

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
