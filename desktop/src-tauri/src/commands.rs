//! Commands callable from the launcher window (see capabilities/launcher.json and build.rs).

use tauri::ipc::Channel;

use crate::runtime::RuntimeManager;
use crate::runtime::error::AppError;
use crate::runtime::model::{ProgressEvent, Status};

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

/// Tests of `capabilities/launcher.json`: a command or URL missing there doesn't fail loudly, it just
/// makes a button do nothing, so the file is checked like code.
#[cfg(test)]
mod capability_tests {
    use serde_json::Value;

    const LAUNCHER: &str = include_str!("../capabilities/launcher.json");
    const BUILD_RS: &str = include_str!("../build.rs");
    /// Every `#[tauri::command]` of this file.
    const COMMANDS: [&str; 4] = ["get_status", "install", "start", "stop"];

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
