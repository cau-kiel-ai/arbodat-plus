# Developing ArboDat+

How to set up the repository, contribute changes, and make a release. For what the parts do, see
the READMEs of [frontend/](../frontend/README.md), [web-api/](../web-api/README.md),
[desktop/](../desktop/README.md) and [deploy/](../deploy/README.md). For installing the finished
app, see [INSTALL.md](INSTALL.md).

## Set up

### What you need

| For | Install |
|---|---|
| Everything | git, [Docker Desktop](https://docs.docker.com/desktop/) (or Docker Engine with the Compose plugin ≥ 2.21 on Linux) |
| Frontend (CSS, vendored libraries) | Node.js 24 with npm |
| web-api outside Docker | JDK 17 (the Gradle wrapper `web-api/gradlew` brings Gradle) |
| Desktop app | Rust (stable), pnpm (version pinned in `desktop/package.json`, e.g. via `corepack enable`), on Linux the [Tauri libraries](https://v2.tauri.app/start/prerequisites/#linux) (`libwebkit2gtk-4.1-dev libxdo-dev librsvg2-dev build-essential`) |

### Clone

```sh
git clone git@github.com:cau-kiel-ai/arbodat-plus.git
cd arbodat-plus
git switch develop
```

### Run it

#### Web app (dev stack)

1. `cp .env.example .env`
2. `docker compose --profile dev up --build`  
   (rebuild without cache: `docker compose --profile dev build --no-cache`)
3. Compile the CSS files from the SCSS files with *Sass* (see [Frontend](#frontend)).

- The frontend folder is bind-mounted into the nginx container, so frontend changes show up on
  reload while the app is running.
- The UI is at http://localhost:8480 (same nginx config as production, see
  `frontend/nginx/templates`).
- The web-api is additionally published at http://localhost:8080 for debugging (dev only).

#### Database: PostgreSQL

The database runs in the *postgres:16-trixie* Docker image. A separate test database:

```sh
docker run --name test-database -p 5432:5432 --env POSTGRES_PASSWORD=password -d postgres:16-trixie
```

#### Web API: Spring Boot

See [web-api/README.md](../web-api/README.md) for running it standalone. The web-api (backend) is
built with *Spring Boot 3.3*, using *Gradle 8.8* as the build tool and *JDK 17* as the runtime.

- Run it: *Gradle → Tasks → application → bootRun* (in your IDE), or `./gradlew bootRun` in `web-api/`.
- Build `web-api.jar`:
  - Windows: `cd web-api && gradlew build && cd ..`
  - Linux/macOS: `cd web-api && chmod u+x gradlew && ./gradlew build && cd ..` (`chmod` makes
    `gradlew` executable; needed once)

#### Frontend

See [frontend/README.md](../frontend/README.md) for the structure of the frontend.

The CSS files have to be compiled from the SCSS files (needed in dev mode: `frontend/css` is
git-ignored). Recommended: the VS Code extension
[*Live Sass Compiler*](https://marketplace.visualstudio.com/items?itemName=glenn2223.live-sass)
with these settings in `.vscode/settings.json`:

```json
"liveSassCompile.settings.formats": [
    {
        "format": "compressed",
        "extensionName": ".min.css",
        "savePath": "/frontend/css"
    }
],
"liveSassCompile.settings.forceBaseDirectory": "/frontend/scss"
```

Then *Live Sass Compiler → Watch Sass* generates the CSS files and updates them on every change.

#### Desktop app

See [desktop/README.md](../desktop/README.md#development) (`pnpm install`,
`pnpm tauri dev`). The app runs the images of **its own version** (the `version` in
`desktop/package.json`) and only downloads images that aren't on the computer yet. While that
version has no published images (e.g. `5.1.0-dev`), build them locally with exactly the names the
app expects:
```sh
V=5.1.0-dev
docker build -t ghcr.io/cau-kiel-ai/arbodat-plus-web-api:$V --build-arg APP_VERSION=$V web-api
docker build -t ghcr.io/cau-kiel-ai/arbodat-plus-frontend:$V --build-arg APP_VERSION=$V frontend
```
Careful: the desktop app manages the **real** installation of your computer (data volume
`arbodat-plus-database`). Test risky things with a debug build and `ARBODAT_DATA_DIR` (see the
desktop README), and make a backup first.

## Contribute

### Branches

| Branch | Holds |
|---|---|
| `main` | Released versions only. Changes reach it by merging `develop` for a release. |
| `develop` | The next version. Every change goes here first. |
| `feature/…`, `fix/…` | One piece of work, branched off `develop`, merged back by pull request. |

```sh
git switch develop && git pull
git switch -c feature/short-name
# … work, commit …
git push -u origin feature/short-name   # then open a pull request into develop
```

### Commit messages

[Conventional Commits](https://www.conventionalcommits.org/): `type(scope): what changed`, in
the imperative, with a body when the reason isn't obvious.

- types: `feat`, `fix`, `docs`, `refactor`, `chore`
- scopes: `frontend`, `web-api`, `desktop`, `deploy`, `ci`, `scripts`, `release`, or none for repo-wide changes

```
fix(desktop): pull anonymously even with a stale registry login on the system
```

### Before you push

CI (`.github/workflows/ci.yml`) runs on every pull request and every push to `develop` and
`main`. Run the checks for the parts you changed first:

| Changed | Run | CI also checks |
|---|---|---|
| `web-api/` | `cd web-api && ./gradlew bootJar` | — |
| `frontend/` libraries (`package.json`) | `cd frontend && npm ci && npm run vendor`, commit `vendor/` | `vendor/` is current, `npm audit` |
| `desktop/` | `cd desktop && pnpm check`, then in `desktop/src-tauri`: `cargo fmt --check`, `cargo clippy --locked --all-targets -- -D warnings`, `cargo test --locked` | the same on Linux, macOS and Windows; the generated TypeScript types in `src/lib/bindings/` are committed (`cargo test` regenerates them) |
| anything in the stack | `docker compose --profile prod up -d --build --wait`, open http://localhost:8480, then `docker compose --profile prod down` | the same stack with real requests (`smoke`) |

Never commit `.env` files or real data.

## Release

One version number covers everything: the desktop app `5.2.0` runs the images `5.2.0`, and
the release is tagged `v5.2.0`. Versions follow [SemVer](https://semver.org/). Test versions
are release candidates `X.Y.Z-rc.N`. Every final release goes through at least one of them.

### What a tag does

Pushing a tag `v*` starts `.github/workflows/release.yml`:

1. **meta:** stops unless the tag matches the version in every version file
   (`node scripts/check-version.mjs <tag>`). If it stops, nothing else has run yet.
2. **images:** builds `web-api` and `frontend` for amd64 and arm64 and pushes them to GHCR as
   `ghcr.io/cau-kiel-ai/arbodat-plus-<name>:<version>` (public; there is no `latest` tag).
3. **smoke:** pulls these images anonymously and runs the stack with real requests.
4. **desktop / desktop-linux:** builds the installers (macOS universal `.dmg`, Windows `.exe`,
   Linux `.deb` + AppImage for x64 and arm64).
5. **release:** only if all of the above passed: a **draft** GitHub Release with the installers,
   the server files from `deploy/` and `SHA256SUMS`. A version with `-` is marked as a pre-release.

The images are public as soon as step 2 has finished. The draft only becomes visible to everyone
when you publish it.

### Release candidate

On `develop`, with CI green:

```sh
git switch develop && git pull
node scripts/set-version.mjs 5.2.0-rc.1      # changes every version file, see scripts/version-files.mjs
git commit -am "chore(release): 5.2.0-rc.1"
git push
git tag v5.2.0-rc.1
git push origin v5.2.0-rc.1                  # this starts the release
```

Then test the draft (GitHub → Releases; you need to be logged in to see drafts). At least:

- install on macOS, Windows and Linux as described in [INSTALL.md](INSTALL.md);
- a fresh installation, and **Update now** from the previous version;
- backup and restore;
- the changes in this version.

A problem means: fix it on `develop`, then make `rc.2`. Don't publish release candidates: the
draft is enough for testing, and nobody should install a test version by accident. Delete an
rc's draft once the next rc or the final release exists.

### Final release

When the last rc passed every test, without changes since:

```sh
git switch develop && git pull
node scripts/set-version.mjs 5.2.0
git commit -am "chore(release): 5.2.0"
git push
```

Open a pull request **develop → main** and merge it once CI is green. Then tag the merged commit
on `main`:

```sh
git switch main && git pull
git tag v5.2.0
git push origin v5.2.0
```

Check the draft (installers, notes), then **Publish release**.
