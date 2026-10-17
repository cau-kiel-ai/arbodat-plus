//! Commands callable from the launcher window (see capabilities/launcher.json and build.rs).

use crate::runtime::{RuntimeManager, model::Status};

/// Never fails: problems (no Docker, engine down, damaged state...) are part of the `Status`.
/// (The `Result` is only there because async commands that borrow state must return one.)
#[tauri::command]
pub async fn get_status(runtime: tauri::State<'_, RuntimeManager>) -> Result<Status, String> {
    Ok(runtime.status().await)
}
