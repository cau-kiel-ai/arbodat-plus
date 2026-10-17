mod commands;
pub mod runtime;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be registered first: launching the app again just brings the running one forward.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("launcher") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[allow(unused_mut)]
            let mut data_dir = app.path().app_local_data_dir()?;
            // Development only: point a debug build at a test data directory instead of the
            // real one (see examples/status.rs). Release builds ignore it.
            #[cfg(debug_assertions)]
            if let Some(dir) = std::env::var_os("ARBODAT_DATA_DIR") {
                data_dir = dir.into();
            }
            let version = app.package_info().version.to_string();
            log::info!("ArboDat+ {version}, data directory {}", data_dir.display());
            app.manage(runtime::RuntimeManager::new(&version, &data_dir)?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![commands::get_status])
        .run(tauri::generate_context!())
        .expect("error while running ArboDat+");
}
