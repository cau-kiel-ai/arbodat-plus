# ArboDat+ desktop app

A [Tauri 2](https://v2.tauri.app/) app (Rust + Svelte 5) that runs ArboDat+ on the user's own
computer with Docker, or (later) connects to an ArboDat+ server. The stack it runs is exactly
[`../deploy/compose.yml`](../deploy/compose.yml), embedded at build time, so the app version and the
stack definition always ship together (app 5.0.0 runs images 5.0.0).

> Status: Phase 4 of the desktop plan. The app finds Docker and shows the state of the local
> stack. Install, start/stop, the ArboDat+ window, update and backup follow in later phases.

## Development

Requirements: Rust (stable, edition 2024), Node 24+, pnpm (version pinned in `package.json`), and
on Linux the [Tauri system libraries](https://v2.tauri.app/start/prerequisites/#linux).

```sh
pnpm install
pnpm tauri dev          # app with hot-reloading UI
pnpm tauri build        # installers in src-tauri/target/release/bundle/
pnpm check              # type-check the UI (svelte-check)
cd src-tauri && cargo test
```

- `cargo test` also regenerates the TypeScript types in `src/lib/bindings/` from the Rust structs
  ([ts-rs](https://github.com/Aleph-Alpha/ts-rs)). Commit them; CI fails if they're out of date.
- `cargo run --example status -- <dir>` prints the status JSON against your real Docker without
  the GUI, using `<dir>` as the app's data directory. Run it under
  `env -i HOME="$HOME" PATH=/usr/bin:/bin:/usr/sbin:/sbin` to see what a Finder-launched app sees.
- `cargo run --example lifecycle -- <dir> install|start|stop|status` runs the real install/start/stop
  against your Docker without the GUI (progress is printed). Careful: install creates the real data
  volume `arbodat-plus-database` and uses port 8480, exactly like the app; use a scratch `<dir>`
  and remove the volume afterwards.
- Debug builds honour `ARBODAT_DATA_DIR=<dir>` to use a test data directory instead of the real
  one (release builds ignore it).
- The app icon: `app-icon.png` (1024 px) is the source; regenerate everything with
  `pnpm tauri icon app-icon.png` and keep only the files already in `src-tauri/icons/` (the command
  also writes `android/`, `ios/` and `64x64.png`, which this desktop app doesn't use).

## Where things live

| | macOS | Windows | Linux |
|---|---|---|---|
| App data | `~/Library/Application Support/de.cau-kiel-ai.arbodat-plus/` | `%LOCALAPPDATA%\de.cau-kiel-ai.arbodat-plus\` | `~/.local/share/de.cau-kiel-ai.arbodat-plus/` |
| Log | `~/Library/Logs/de.cau-kiel-ai.arbodat-plus/` | `%LOCALAPPDATA%\de.cau-kiel-ai.arbodat-plus\logs\` | `~/.local/share/de.cau-kiel-ai.arbodat-plus/logs/` |

Inside the data directory: `runtime/` (compose.yml, .env, state.json of the local installation;
`state.json` is what "installed" means) and `docker-config/` (see below). The database itself is
the Docker volume `arbodat-plus-database`.

## Design decisions worth knowing

All verified on macOS in the Phase 4a spike; see the plan for details.

- **Finding Docker.** Apps started from Finder/the Start menu don't get the shell's PATH (on macOS
  it's `/usr/bin:/bin:/usr/sbin:/sbin`), so `src-tauri/src/runtime/discovery.rs` searches the
  known install locations too, and puts docker's own directory first on child processes' PATH.
- **Own Docker config.** All docker commands run with an app-owned `DOCKER_CONFIG` (no credential
  helper) and `DOCKER_HOST` pinned to the user's current context. With the user's config,
  `docker pull` calls Docker Desktop's credential helper, which makes macOS ask whether ArboDat+
  may "access data from other apps". Our images are public, so no login is needed.
- **Pinned project.** Every compose call passes project name, directory and file explicitly; the
  data volume is `external` in compose.yml, so compose can never create, recreate or delete it.
  Tests in `runtime/template.rs` fail the build if compose.yml breaks these invariants.
- **Permissions.** Only the launcher window may call the app's commands
  (`capabilities/launcher.json`, `build.rs`); the ArboDat+ window gets none, so a web page loaded
  there (later possibly someone else's server) cannot reach the app. A test fails if a second
  capability file or a window other than the launcher appears.
- **The ArboDat+ window** (`src-tauri/src/windows/`). Links within ArboDat+ stay in the window;
  every other web or mail link opens in the system's browser or mail program; `file:`,
  `javascript:` and other schemes are dropped. Downloads go to the Downloads folder under a name
  that never overwrites a file (`export (1).csv`), and a message in the page says where. Three
  gaps of the macOS webview are patched by `windows/scripts/shims.js`: left-clicks on
  `target="_blank"` links, `alert()` (a silent no-op there) and the download message.
  The mouse's back and forward buttons never reach a macOS web page either, so
  `windows/mouse_nav.rs` picks them up as AppKit events (Windows and Linux handle them natively). It
  understands the buttons themselves and horizontal swipe events, which is what trackpad gestures.
- **Windows and quitting.** Opening ArboDat+ hides the launcher; the menu's *Window → Control
  Center* brings it back. Closing the ArboDat+ window quits the app, the stack keeps running.
  Starting the app while ArboDat+ is running goes straight to the ArboDat+ window. If the stack is
  stopped from the Control Center while that window is open, the window shows "ArboDat+ is stopped"
  (`windows/stopped.html`, in the layout of the web app's license page) and returns to ArboDat+
  when the stack is started again. Nothing can be
  closed or quit while the stack is being installed, started or stopped.
- **`Info.plist`.** `NSAllowsArbitraryLoadsInWebContent`: without it, macOS silently blocks
  plain-http servers addressed by hostname (intranet servers in server mode).

## What the app does to your Docker, and what it never does

The launcher installs, starts, stops and reconfigures the stack with a handful of Compose commands:
`pull`, `up -d --wait`, `stop` and, only for *Remove ArboDat+ from Docker*, a plain `down`. It never
runs `rm`, `-v`/`--volumes`, `--rmi` or `-y` (`runtime/compose.rs` has a test that fails if one
appears).

- **Install** checks, in this order: Docker is usable, nothing is installed yet, the port is free,
  then writes `compose.yml`, `.env` and `state.json` and creates the data volume once. Images that are
  already on the computer are not downloaded again.
- **The database password** is generated once (32 random letters and digits from the operating
  system) and kept in `.env`, readable by you only. PostgreSQL applies it only when the volume is
  first created, so the app never replaces an existing `.env`.
- **It refuses, and changes nothing,** when: the installation record is damaged; a database volume
  exists but its `.env` doesn't (the password is unknown, so adopting it would lock you out); the port
  is taken (the message names the Docker container or says it is another program); the installation
  was made in a different Docker engine; or the database volume has disappeared (for example after a
  Docker Desktop reset). In that last case it will not create a new, empty database on its own.
- **An interrupted install resumes** with the same password instead of starting over.
- **Settings.** *Port*: rewrites `.env` and the installation record and, if ArboDat+ is running,
  restarts it on the new port; if that fails, everything goes back to the old port. *Start when
  this app opens*: starts a stopped installation once, when Docker is ready. *Backup folder*:
  where backups will be written. All of it is stored in `settings.json` in the data directory.
- **Remove ArboDat+ from Docker** runs `down` and forgets `state.json`, nothing else: the database
  volume, `.env` (the password), `compose.yml`, the downloaded images and your backups stay, so
  *Install* afterwards finds and keeps the same data and the same port. If Docker no longer has the
  database (a Docker Desktop reset), removing is how you get out of that state; the next install
  then starts with a new, empty database, and the button says so before it does anything.
- The window can't be closed, and the app can't be quit, while one of these operations is running.
