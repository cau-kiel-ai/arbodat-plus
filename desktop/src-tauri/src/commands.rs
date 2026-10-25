//! Commands callable from the Control Center page (see capabilities/launcher.json and build.rs).

use tauri::ipc::Channel;
use tauri::{AppHandle, Url};
use tauri_plugin_dialog::DialogExt;

use crate::runtime::error::{AppError, ErrorCode};
use crate::runtime::model::{ProgressEvent, Status};
use crate::runtime::{RuntimeManager, probe, state};
use crate::server;
use crate::settings::{self, Mode, SettingsStore, SettingsView};
use crate::windows;

/// Never fails: problems (no Docker, engine down, damaged state...) are part of the `Status`.
/// (The `Result` is only there because async commands that borrow state must return one.)
#[tauri::command]
pub async fn get_status(runtime: tauri::State<'_, RuntimeManager>) -> Result<Status, String> {
    Ok(runtime.status().await)
}

/// Installs ArboDat+ on this computer and starts it. Progress streams through `on_event`.
#[tauri::command]
pub async fn install(
    runtime: tauri::State<'_, RuntimeManager>,
    on_event: Channel<ProgressEvent>,
) -> Result<(), AppError> {
    runtime.install(&|event| drop(on_event.send(event))).await
}

/// Starts the installed stack (downloading anything missing first).
#[tauri::command]
pub async fn start(
    runtime: tauri::State<'_, RuntimeManager>,
    on_event: Channel<ProgressEvent>,
) -> Result<(), AppError> {
    runtime.start(&|event| drop(on_event.send(event))).await
}

/// Stops the stack. Containers, network and data stay.
#[tauri::command]
pub async fn stop(
    runtime: tauri::State<'_, RuntimeManager>,
    on_event: Channel<ProgressEvent>,
) -> Result<(), AppError> {
    runtime.stop(&|event| drop(on_event.send(event))).await
}

/// Moves ArboDat+ to another port.
#[tauri::command]
pub async fn change_port(
    runtime: tauri::State<'_, RuntimeManager>,
    port: u16,
    on_event: Channel<ProgressEvent>,
) -> Result<(), AppError> {
    runtime
        .change_port(port, &|event| drop(on_event.send(event)))
        .await
}

/// Removes ArboDat+'s containers from Docker. The database, the password file, backups and
/// downloaded images are kept, so installing again picks the same data up.
#[tauri::command]
pub async fn remove_installation(
    runtime: tauri::State<'_, RuntimeManager>,
    on_event: Channel<ProgressEvent>,
) -> Result<(), AppError> {
    runtime.remove(&|event| drop(on_event.send(event))).await
}

#[tauri::command]
pub fn get_settings(store: tauri::State<'_, SettingsStore>) -> SettingsView {
    store.view()
}

fn save_failed(e: &std::io::Error) -> AppError {
    AppError::io("Couldn't save the settings", e)
}

#[tauri::command]
pub fn set_auto_start(
    store: tauri::State<'_, SettingsStore>,
    enabled: bool,
) -> Result<SettingsView, AppError> {
    store
        .update(|s| s.auto_start = enabled)
        .map_err(|e| save_failed(&e))
}

/// Lets the user pick the backup folder. `None` if they cancelled.
#[tauri::command]
pub async fn choose_backup_folder(
    app: AppHandle,
    store: tauri::State<'_, SettingsStore>,
) -> Result<Option<SettingsView>, AppError> {
    let mut dialog = app
        .dialog()
        .file()
        .set_title("Choose the folder for ArboDat+ backups");
    let current = store.backup_folder();
    if current.is_dir() {
        dialog = dialog.set_directory(current);
    }
    if let Some(window) = windows::main_window(&app) {
        dialog = dialog.set_parent(&window);
    }
    let Some(picked) = dialog.blocking_pick_folder() else {
        return Ok(None);
    };
    let folder = picked.into_path().map_err(|e| {
        AppError::new(ErrorCode::Io, "That folder can't be used.").with_detail(e.to_string())
    })?;
    settings::check_writable(&folder).map_err(|e| {
        AppError::new(
            ErrorCode::Io,
            "ArboDat+ can't write to that folder. Please choose another one.",
        )
        .with_detail(e.to_string())
    })?;
    store
        .update(|s| s.backup_folder = Some(folder))
        .map(Some)
        .map_err(|e| save_failed(&e))
}

#[tauri::command]
pub fn reset_backup_folder(
    store: tauri::State<'_, SettingsStore>,
) -> Result<SettingsView, AppError> {
    store
        .update(|s| s.backup_folder = None)
        .map_err(|e| save_failed(&e))
}

fn local_url(port: u16) -> Url {
    Url::parse(&format!("http://127.0.0.1:{port}/")).expect("a valid local address")
}

/// Shows ArboDat+ (the local installation or the server) in the window. The Control Center
/// can't choose the address: it always comes from the installation record.
#[tauri::command]
pub async fn open_arbodat(
    app: AppHandle,
    runtime: tauri::State<'_, RuntimeManager>,
    store: tauri::State<'_, SettingsStore>,
) -> Result<(), AppError> {
    let settings = store.get();
    let url = match (settings.mode, settings.server_url) {
        (Mode::Server, Some(server)) => server::check(&server::normalize_url(&server)?).await?,
        (Mode::Server, None) => {
            return Err(AppError::new(
                ErrorCode::NotInstalled,
                "No server has been chosen yet.",
            ));
        }
        (Mode::Local, _) => {
            let port = match state::load(runtime.runtime_dir()) {
                Ok(Some(installed)) => installed.port,
                Ok(None) => {
                    return Err(AppError::new(
                        ErrorCode::NotInstalled,
                        "ArboDat+ isn't installed on this computer yet.",
                    ));
                }
                Err(e) => {
                    return Err(AppError::new(
                        ErrorCode::StateDamaged,
                        "ArboDat+'s installation record can't be read.",
                    )
                    .with_detail(e.to_string()));
                }
            };
            // An empty window with a connection error is no answer to "Open".
            if probe::status_of(port, "/healthz").await != Ok(200) {
                return Err(AppError::new(
                    ErrorCode::NotReady,
                    "ArboDat+ isn't answering. Start it first, or wait a moment if it is still starting.",
                ));
            }
            local_url(port)
        }
    };
    open_window(&app, url).await
}

/// Opens (or brings forward) the ArboDat+ window on `url`.
async fn open_window(app: &AppHandle, url: Url) -> Result<(), AppError> {
    // Creating windows from a worker thread is unreliable on some platforms.
    let handle = app.clone();
    let (done, result) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        let _ = done.send(windows::arbodat::open(&handle, url));
    })
    .map_err(|e| {
        AppError::new(ErrorCode::Io, "The ArboDat+ window couldn't be opened.")
            .with_detail(e.to_string())
    })?;
    match result.await {
        Ok(Ok(())) => Ok(()),
        Ok(Err(e)) => Err(
            AppError::new(ErrorCode::Io, "The ArboDat+ window couldn't be opened.")
                .with_detail(e.to_string()),
        ),
        Err(_) => Err(AppError::new(
            ErrorCode::Io,
            "The ArboDat+ window couldn't be opened.",
        )),
    }
}

/// Switches to server mode: checks the address, saves it and shows the server in the window. The
/// local installation is left alone. With `force` (the user wants an address that didn't pass the
/// check) it is only saved: the Control Center then shows that the server doesn't answer, and Open
/// works as soon as it does, instead of leaving the user in front of an empty browser error page.
#[tauri::command]
pub async fn connect_server(
    app: AppHandle,
    store: tauri::State<'_, SettingsStore>,
    url: String,
    force: bool,
) -> Result<SettingsView, AppError> {
    let typed = server::normalize_url(&url)?;
    let base = if force {
        typed.clone()
    } else {
        server::check(&typed).await?
    };
    let view = store
        .update(|s| {
            s.mode = Mode::Server;
            s.server_url = Some(base.to_string());
        })
        .map_err(|e| save_failed(&e))?;
    if !force {
        open_window(&app, base).await?;
    }
    Ok(view)
}

/// Back to ArboDat+ on this computer. The server stays remembered.
#[tauri::command]
pub fn use_local_mode(store: tauri::State<'_, SettingsStore>) -> Result<SettingsView, AppError> {
    store
        .update(|s| s.mode = Mode::Local)
        .map_err(|e| save_failed(&e))
}

/// Opens the server of server mode in the system browser. The address is the saved one, never
/// something the Control Center passes in.
#[tauri::command]
pub fn open_server_in_browser(
    app: AppHandle,
    store: tauri::State<'_, SettingsStore>,
) -> Result<(), AppError> {
    let Some(server) = store.get().server_url else {
        return Err(AppError::new(
            ErrorCode::NotInstalled,
            "No server has been chosen yet.",
        ));
    };
    windows::open_external(&app, &server::normalize_url(&server)?);
    Ok(())
}

/// A report about the app, Docker and the installation, to copy into a message when asking for
/// help. Reads only; the database password is left out.
#[tauri::command]
pub async fn get_diagnostics(
    app: AppHandle,
    runtime: tauri::State<'_, RuntimeManager>,
    store: tauri::State<'_, SettingsStore>,
) -> Result<String, AppError> {
    crate::diagnostics::collect(&app, &runtime, &store)
        .await
        .map_err(|e| AppError::new(ErrorCode::Io, "The report couldn't be created.").with_detail(e))
}

/// Does the server of server mode answer right now?
#[tauri::command]
pub async fn server_status(
    store: tauri::State<'_, SettingsStore>,
) -> Result<server::ServerStatus, AppError> {
    let Some(server) = store.get().server_url else {
        return Err(AppError::new(
            ErrorCode::NotInstalled,
            "No server has been chosen yet.",
        ));
    };
    Ok(server::status(&server::normalize_url(&server)?).await)
}

/// Tests of `capabilities/launcher.json`: a command or URL missing there doesn't fail loudly, it just
/// makes a button do nothing, so the file is checked like code.
#[cfg(test)]
mod capability_tests {
    use serde_json::Value;

    const LAUNCHER: &str = include_str!("../capabilities/launcher.json");
    const BUILD_RS: &str = include_str!("../build.rs");
    /// Every `#[tauri::command]` of this file.
    const COMMANDS: [&str; 16] = [
        "get_status",
        "install",
        "start",
        "stop",
        "open_arbodat",
        "change_port",
        "remove_installation",
        "get_settings",
        "set_auto_start",
        "choose_backup_folder",
        "reset_backup_folder",
        "connect_server",
        "use_local_mode",
        "server_status",
        "open_server_in_browser",
        "get_diagnostics",
    ];

    fn launcher() -> Value {
        serde_json::from_str(LAUNCHER).expect("launcher.json is valid JSON")
    }

    #[test]
    fn every_command_is_declared_and_granted_to_the_launcher_window_only() {
        let capability = launcher();
        assert_eq!(
            capability["windows"],
            serde_json::json!(["main"]),
            "only the app's own window may call commands, and only its own pages (no `remote` entry)"
        );
        let permissions: Vec<&str> = capability["permissions"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(Value::as_str)
            .collect();
        for command in COMMANDS {
            assert!(
                BUILD_RS.contains(&format!("\"{command}\"")),
                "build.rs doesn't declare {command}"
            );
            let permission = format!("allow-{}", command.replace('_', "-"));
            assert!(
                permissions.contains(&permission.as_str()),
                "launcher.json doesn't grant {permission}"
            );
        }
        let source = include_str!("commands.rs")
            .split("#[cfg(test)]")
            .next()
            .unwrap();
        assert_eq!(
            source.matches("#[tauri::command]").count(),
            COMMANDS.len(),
            "a command was added without updating COMMANDS"
        );
    }

    /// The ArboDat+ window loads a web page (and in server mode, someone else's server): it must
    /// not be able to call anything of ours. Capabilities are matched by window label, so the only
    /// capability file there is must name the launcher alone, with no wildcard and no `remote`
    /// access (which is what would let a web page use the commands).
    #[test]
    fn a_web_page_in_the_window_is_granted_nothing() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("capabilities");
        let files: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(
            files,
            ["launcher.json"],
            "a new capability file needs a review"
        );
        let capability = launcher();
        assert!(
            capability.get("remote").is_none(),
            "remote origins must have no access"
        );
        assert!(capability.get("webviews").is_none());
        let windows: Vec<&str> = capability["windows"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(Value::as_str)
            .collect();
        assert_eq!(windows, ["main"], "only the app's window, no wildcard");
        // `local` defaults to true: the capability applies to the app's own pages. A web page
        // (ArboDat+) in the same window is a remote origin and only matches `remote` entries,
        // of which there are none: that is the whole protection, so it must stay that way.
        assert!(capability.get("local").is_none_or(|v| v == true));
    }

    /// The patterns the opener plugin will match a URL against (as a literal string; it does not
    /// normalise it, so `http://127.0.0.1:8480` without the final `/` is NOT the same as with it).
    fn opener_patterns() -> Vec<glob::Pattern> {
        let capability = launcher();
        let entry = capability["permissions"]
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["identifier"] == "opener:allow-open-url")
            .expect("opener permission");
        entry["allow"]
            .as_array()
            .unwrap()
            .iter()
            .map(|a| glob::Pattern::new(a["url"].as_str().unwrap()).unwrap())
            .collect()
    }

    fn allowed(url: &str) -> bool {
        opener_patterns().iter().any(|p| p.matches(url))
    }

    #[test]
    fn the_local_arbodat_url_may_be_opened_and_only_that() {
        for url in [
            "http://127.0.0.1:8480/",
            "http://127.0.0.1:18480/",
            "http://127.0.0.1:1024/",
            "http://127.0.0.1:65535/",
        ] {
            assert!(allowed(url), "{url} must be allowed");
        }
        for url in [
            "http://127.0.0.1:8480", // no trailing slash: the exact mistake that made the button do nothing
            "http://127.0.0.1:1@evil.example/", // user-info trick: the real host would be evil.example
            "http://127.0.0.1:8480@evil.example/",
            "http://127.0.0.1:80a0/",
            "http://127.0.0.1:80/", // privileged ports are never used by the app
            "http://127.0.0.1:8480/api/sites", // only the start page
            "http://localhost:8480/",
            "http://evil.example/",
            "file:///etc/passwd",
        ] {
            assert!(!allowed(url), "{url} must NOT be allowed");
        }
    }

    #[test]
    fn documentation_links_stay_limited_to_docker_and_this_project() {
        assert!(allowed(
            "https://docs.docker.com/desktop/setup/install/mac-install/"
        ));
        assert!(allowed(
            "https://github.com/cau-kiel-ai/arbodat-plus/releases"
        ));
        assert!(!allowed("https://github.com/someone-else/repo"));
        assert!(!allowed("https://docs.docker.com.evil.example/"));
    }
}
