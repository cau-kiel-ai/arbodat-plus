//! Commands callable from the launcher window (see capabilities/launcher.json and build.rs).

use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Url};
use tauri_plugin_dialog::DialogExt;

use crate::runtime::error::{AppError, ErrorCode};
use crate::runtime::model::{ProgressEvent, Status};
use crate::runtime::{RuntimeManager, probe, state};
use crate::settings::{self, SettingsStore, SettingsView};
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
    app: AppHandle,
    runtime: tauri::State<'_, RuntimeManager>,
    on_event: Channel<ProgressEvent>,
) -> Result<(), AppError> {
    runtime.install(&|event| drop(on_event.send(event))).await?;
    windows::arbodat::resume(&app);
    Ok(())
}

/// Starts the installed stack (downloading anything missing first).
#[tauri::command]
pub async fn start(
    app: AppHandle,
    runtime: tauri::State<'_, RuntimeManager>,
    on_event: Channel<ProgressEvent>,
) -> Result<(), AppError> {
    runtime.start(&|event| drop(on_event.send(event))).await?;
    windows::arbodat::resume(&app);
    Ok(())
}

/// Stops the stack. Containers, network and data stay. An open ArboDat+ window says so.
#[tauri::command]
pub async fn stop(
    app: AppHandle,
    runtime: tauri::State<'_, RuntimeManager>,
    on_event: Channel<ProgressEvent>,
) -> Result<(), AppError> {
    runtime.stop(&|event| drop(on_event.send(event))).await?;
    windows::arbodat::show_stopped(&app);
    Ok(())
}

/// Moves ArboDat+ to another port. An open ArboDat+ window follows.
#[tauri::command]
pub async fn change_port(
    app: AppHandle,
    runtime: tauri::State<'_, RuntimeManager>,
    port: u16,
    on_event: Channel<ProgressEvent>,
) -> Result<(), AppError> {
    runtime
        .change_port(port, &|event| drop(on_event.send(event)))
        .await?;
    windows::arbodat::follow(&app, local_url(port));
    Ok(())
}

/// Removes ArboDat+'s containers from Docker. The database, the password file, backups and
/// downloaded images are kept, so installing again picks the same data up.
#[tauri::command]
pub async fn remove_installation(
    app: AppHandle,
    runtime: tauri::State<'_, RuntimeManager>,
    on_event: Channel<ProgressEvent>,
) -> Result<(), AppError> {
    runtime.remove(&|event| drop(on_event.send(event))).await?;
    windows::arbodat::show_stopped(&app);
    Ok(())
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
    if let Some(launcher) = app.get_webview_window(windows::LAUNCHER) {
        dialog = dialog.set_parent(&launcher);
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

/// Opens the ArboDat+ window on the local installation (or brings it forward). The launcher
/// can't choose the address: it always comes from the installation record.
#[tauri::command]
pub async fn open_arbodat(
    app: AppHandle,
    runtime: tauri::State<'_, RuntimeManager>,
) -> Result<(), AppError> {
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
    let url = local_url(port);
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

/// Tests of `capabilities/launcher.json`: a command or URL missing there doesn't fail loudly, it just
/// makes a button do nothing, so the file is checked like code.
#[cfg(test)]
mod capability_tests {
    use serde_json::Value;

    const LAUNCHER: &str = include_str!("../capabilities/launcher.json");
    const BUILD_RS: &str = include_str!("../build.rs");
    /// Every `#[tauri::command]` of this file.
    const COMMANDS: [&str; 11] = [
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
    ];

    fn launcher() -> Value {
        serde_json::from_str(LAUNCHER).expect("launcher.json is valid JSON")
    }

    #[test]
    fn every_command_is_declared_and_granted_to_the_launcher_window_only() {
        let capability = launcher();
        assert_eq!(
            capability["windows"],
            serde_json::json!(["launcher"]),
            "only the launcher window may call commands"
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
    fn the_arbodat_window_is_granted_nothing() {
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
        assert_eq!(
            windows,
            ["launcher"],
            "only the launcher window, no wildcard"
        );
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
