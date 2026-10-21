fn main() {
    // Declaring the app's commands generates allow-/deny- permissions for them. Only
    // capabilities/launcher.json grants them, so no other window (e.g. the ArboDat+ web UI window)
    // can call them.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["get_status", "install", "start", "stop"]),
    ))
    .expect("failed to run tauri-build");
}
