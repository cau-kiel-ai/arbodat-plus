fn main() {
    // Declaring the app's commands generates allow-/deny- permissions for them. Only
    // capabilities/launcher.json grants them, so no other window (e.g. the ArboDat+ web UI window)
    // can call them.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
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
            "backup_now",
            "list_backups",
            "open_backup_folder",
            "delete_backup",
            "restore_backup",
            "choose_restore_file",
            "update_stack",
            "roll_back_update",
        ]),
    ))
    .expect("failed to run tauri-build");
}
