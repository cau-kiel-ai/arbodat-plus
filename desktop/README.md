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
  (`capabilities/launcher.json`, `build.rs`); the ArboDat+ web UI window will get none.
- **`Info.plist`.** `NSAllowsArbitraryLoadsInWebContent`: without it, macOS silently blocks
  plain-http servers addressed by hostname (intranet servers in server mode).
