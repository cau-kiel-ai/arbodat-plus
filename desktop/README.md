# ArboDat+ desktop app

A [Tauri 2](https://v2.tauri.app/) app (Rust + Svelte 5) that runs ArboDat+ on the user's own
computer with Docker, or connects to an ArboDat+ server. The stack it runs is exactly
[`../deploy/compose.yml`](../deploy/compose.yml), embedded at build time, so the app version and the
stack definition always ship together (app 5.0.0 runs images 5.0.0).

For users: how to install the app, Docker is in [docs/INSTALL.md](../docs/INSTALL.md).
This README is for developers.

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
- **Permissions.** The app has one window. It shows either the Control Center (the app's own page)
  or ArboDat+ (a web page, from this computer or someone else's server), and switches by
  navigating. Only the Control Center may call the app's commands: the capability
  (`capabilities/launcher.json`, `build.rs`) names the window but has no `remote` entry, so it
  applies to the app's own pages only and never to the web page. Tests check the file, and the
  behaviour was checked for real: a command called from the web page is refused
  (`… not allowed on window "main"`), from the Control Center it works.
- **ArboDat+ in the window** (`src-tauri/src/windows/`). Links within ArboDat+ stay in the window;
  every other web or mail link opens in the system's browser or mail program; `file:`,
  `javascript:` and other schemes are dropped. Downloads go to the Downloads folder under a name
  that never overwrites a file (`export (1).csv`), and a message in the page says where. Three
  gaps of the macOS webview are patched by `windows/scripts/shims.js`: left-clicks on
  `target="_blank"` links, `alert()` (a silent no-op there) and the download message.
  The mouse's back and forward buttons never reach a macOS web page either, so
  `windows/mouse_nav.rs` picks them up as AppKit events (Windows and Linux handle them natively). It
  understands the buttons themselves and horizontal swipe events, which is what trackpad gestures.
- **One window, two pages.** The Control Center is a card that slides in from the right edge; a cog
  in the top right corner of every ArboDat+ page (injected, `windows/scripts/shims.js`; it keeps its
  place whether or not the page has a scrollbar) opens
  it and turns into an "x" that closes it again, back to the page you left. The "x" is only there
  while there is something to go back to: a server, or a running local ArboDat+. The cog can't call the app: it
  "navigates" to `arbodat-desktop://control-center`, which the window recognises and cancels. The
  ArboDat+ page is not kept alive behind the Control Center, so opening it unloads that page. If
  something was typed and not saved since the page loaded (Data Input, Explorer, Export; a
  successful create/update clears it), or, on the migration page, anything was chosen or sent
  (that page holds the whole migration state), a dialog asks first. Until ArboDat+ or a server is
  set up the Control Center is all there is and has no "x"; it also opens by itself when ArboDat+
  isn't available at startup, and can't be left while an operation runs.
- **Title bar.** "ArboDat+" on the start page and in the Control Center; "ArboDat+  Data Input" (a gap as wide as the one between the window buttons and the title, no dash)
  (and Data Migration, Data Explorer, Data Report, Data Export, License, Contact) on the other pages,
  named by file so it also works under a server's sub-path (`window_title` in `windows/arbodat.rs`).
- **Quitting.** Closing the window quits the app, the stack keeps running. Starting the app while
  ArboDat+ is running goes straight to it: the window stays hidden until the ArboDat+ page has
  loaded (at the latest after 6 seconds), so the Control Center never flashes by. The window checks its address every 10 seconds: if it
  stops answering (the server, or ArboDat+ stopped outside the app) a message appears in its corner
  ("ArboDat+ Server is not answering" / "ArboDat+ is not answering") and disappears when it answers
  again. Choosing another server shows that server in the same window. Nothing can be closed or
  quit while the stack is being installed, started or stopped.
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
- **Server mode.** Instead of running ArboDat+ in Docker, the app can be a window onto an ArboDat+
  server of your institute. *Use a server instead* takes an address (`https://` is assumed if none
  is given; no user name or password in it; a sub-path is fine), asks the server's `/healthz`
  (certificates and proxy settings of the operating system apply, like in a browser; redirects, say
  from http to https, are followed and the window starts from where they lead) and, if it answers,
  switches to server mode and shows it in the window. If it doesn't answer, the error says why and the
  address can still be saved on request (Open then waits until the server answers). In server mode the app does not touch Docker at all; the
  local installation stays as it is and *Use ArboDat+ on this computer instead* goes back to it.
  Backups, updates and access are the server administrator's business.
- **Backups** (`src-tauri/src/runtime/backup.rs`, `src/autobackup.rs`). A backup is a `pg_dump` custom-format file
  plus a JSON sidecar (kind, time, versions, size, sha256, exact row count per table), named
  `arbodat-plus_<date>_<time>_<kind>_v<version>.dump` in the backup folder. It is written as `.partial`,
  flushed, then checked by reading it completely (`pg_restore -f /dev/null` in the database container;
  `--list` alone would accept a dump whose end is missing) and only then renamed. If ArboDat+ is stopped,
  only the database is started for the backup and stopped again. *Back up* makes one by hand, with an optional short description (at most 25 characters, "manual
  backup" by default); one is
  made by itself once a day while the app is open and ArboDat+ is running. Retention keeps the newest
  daily backup of each of the last 7 days, 4 weeks and 12 months, and applies **only** to those daily
  ones: backups made by hand, before an update or a restore, and any file the app didn't make are never
  deleted. A backup can be deleted by hand from the list (trash icon, then *Delete*); that removes
  only that `.dump` and its details file, nothing outside the backup folder.
- **Restore** (`src-tauri/src/runtime/restore.rs`): from the list (the arrow icon) or *Restore from file*
  (any `pg_dump -Fc` file); the dump is ritten inside the container and copied out with `docker cp`, because
  a `>` redirect in Windows PowerShell 5 re-encodes the binary output and breaks the file). Before anything changes,
  the backup is checked: custom format, checksum against its details file, read completely, its PostgreSQL
  and ArboDat+ versions not newer than this installation's. Then a "before restore" backup of the current
  data is made, web-api and frontend are stopped, and the restore runs as **one transaction**: drop the
  `public` schema, recreate it, load the backup, compare every table's row count with the details file,
  commit. A damaged file, an SQL error or a wrong count rolls everything back and the data stays as it was;
  the commit is only sent after `pg_restore` itself finished without error. Afterwards ArboDat+ is running
  again (web-api upgrades an older schema on start) or stopped again, as before.
- **Update** (`src-tauri/src/runtime/update.rs`). When the app is newer than ArboDat+ on this computer,
  the Control Center asks first (*Update now* / *Later*; automatic start waits for the answer). An
  update writes a journal (`runtime/journal.json`), makes a "before update" backup, stages the new
  version's files in `runtime/next/` and downloads only missing images (if either fails, nothing has
  changed), then keeps the current files as `*.prev`, switches, starts with `up -d --wait
  --remove-orphans` and checks that ArboDat+ answers and `version.json` reports the new version.
  If that fails, or the app is closed during it, the journal stays and the Control Center shows
  *Try again* or *Go back to version …*: the `.prev` files back and the "before update" backup restored
  (one transaction, like any restore; what was entered since is kept in a "before restore" backup).
  Until then no other operation than those two, or Stop, is possible. An update that stopped before the
  switch changed nothing; its journal is removed at the next start. Old images are never deleted.
- **Diagnostics.** The Control Center's *Create Report* collects one piece of text to copy into a
  message when asking for help (`src-tauri/src/diagnostics.rs`): app and system versions, the mode,
  Docker, the state of ArboDat+ and its services, `state.json`, the `.env` without its secrets, the
  last 150 log lines per service (`docker compose logs`) and the end of the app's own log; in
  server mode the server's answer instead of everything Docker. It only reads. The database
  password is left out twice over: the `.env` shows `DATABASE_PASSWORD=<hidden>`, and the whole
  report is then cleaned of that password wherever a log quotes it and of any `password=…`, `secret: …`
  or `token=…` value. Folder names and the user name in paths are not removed.
- **Remove ArboDat+ from Docker** runs `down` and forgets `state.json`, nothing else: the database
  volume, `.env` (the password), `compose.yml`, the downloaded images and your backups stay, so
  *Install* afterwards finds and keeps the same data and the same port. If Docker no longer has the
  database (a Docker Desktop reset), removing is how you get out of that state; the next install
  then starts with a new, empty database, and the button says so before it does anything.
- The window can't be closed, and the app can't be quit, while one of these operations is running.
