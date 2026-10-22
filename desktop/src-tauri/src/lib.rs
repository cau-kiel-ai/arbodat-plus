mod commands;
pub mod runtime;
mod windows;

use std::time::Duration;

use tauri::{Manager, Url};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be registered first: launching the app again just brings the running one forward.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            windows::focus_main(app);
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
            app.manage(windows::arbodat::Home::default());
            windows::menu::install(app.handle())?;
            #[cfg(target_os = "macos")]
            windows::install_mouse_navigation(app.handle());
            // The launcher starts hidden: if ArboDat+ is already running, it goes straight to
            // the ArboDat+ window instead of flashing the launcher first.
            tauri::async_runtime::spawn(route_on_startup(app.handle().clone()));
            Ok(())
        })
        .on_menu_event(|app, event| windows::menu::handle(app, event.id().as_ref()))
        .invoke_handler(tauri::generate_handler![
            commands::get_status,
            commands::install,
            commands::start,
            commands::stop,
            commands::open_arbodat
        ])
        .on_window_event(|window, event| {
            let app = window.app_handle();
            match event {
                // Closing a window (or quitting) while the stack is being installed, started or
                // stopped would kill the Docker command halfway: refuse, and say why.
                tauri::WindowEvent::CloseRequested { api, .. }
                    if app
                        .state::<runtime::RuntimeManager>()
                        .current_operation()
                        .is_some() =>
                {
                    api.prevent_close();
                    windows::menu::notify_busy(app);
                }
                // While the ArboDat+ window is open the launcher is only hidden, so the menu's
                // "Control Center" can bring it back.
                tauri::WindowEvent::CloseRequested { api, .. }
                    if window.label() == windows::LAUNCHER
                        && app.get_webview_window(windows::arbodat::LABEL).is_some() =>
                {
                    api.prevent_close();
                    let _ = window.hide();
                }
                // Closing the ArboDat+ window ends the app; the stack keeps running.
                tauri::WindowEvent::Destroyed if window.label() == windows::arbodat::LABEL => {
                    app.exit(0);
                }
                tauri::WindowEvent::Focused(true) => windows::menu::on_focus(window),
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building ArboDat+")
        .run(|app, event| match event {
            // `code` is None when the user asked to quit (⌘Q, last window closed).
            tauri::RunEvent::ExitRequested {
                api, code: None, ..
            } if app
                .state::<runtime::RuntimeManager>()
                .current_operation()
                .is_some() =>
            {
                api.prevent_exit();
                windows::menu::notify_busy(app);
            }
            // Clicking the Dock icon with every window hidden.
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen {
                has_visible_windows: false,
                ..
            } => windows::focus_main(app),
            _ => {}
        });
}

/// How long the launcher may stay hidden while we find out whether ArboDat+ is already running.
const ROUTING_DEADLINE: Duration = Duration::from_secs(4);

/// Running stack: open the ArboDat+ window. Anything else (or an answer that takes too long):
/// show the launcher, which explains the state.
async fn route_on_startup(app: tauri::AppHandle) {
    let runtime = app.state::<runtime::RuntimeManager>();
    let status = tokio::time::timeout(ROUTING_DEADLINE, runtime.status()).await;
    let running_at = match status {
        Ok(status) if status.stack.phase == runtime::model::StackPhase::Running => status
            .stack
            .port
            .and_then(|port| Url::parse(&format!("http://127.0.0.1:{port}/")).ok()),
        _ => None,
    };
    if let Some(url) = running_at {
        log::info!("ArboDat+ is running: opening it at {url}");
        // Window creation belongs on the main thread.
        let handle = app.clone();
        let opened = app.run_on_main_thread(move || {
            if let Err(e) = windows::arbodat::open(&handle, url) {
                log::error!("could not open the ArboDat+ window: {e}");
                windows::show_launcher(&handle);
            }
        });
        if opened.is_ok() {
            return;
        }
    }
    log::info!("ArboDat+ isn't running (or didn't answer in time): showing the launcher");
    windows::show_launcher(&app);
}
