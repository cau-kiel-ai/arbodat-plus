mod commands;
pub mod runtime;
mod server;
mod settings;
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
        .plugin(tauri_plugin_dialog::init())
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
            app.manage(windows::arbodat::LastPage::default());
            app.manage(windows::arbodat::RevealWhenLoaded::default());
            let documents = app
                .path()
                .document_dir()
                .or_else(|_| app.path().home_dir())?;
            app.manage(settings::SettingsStore::new(
                &data_dir,
                settings::default_backup_folder(&documents),
            ));
            windows::menu::install(app.handle())?;
            windows::arbodat::create_main(app.handle())?;
            #[cfg(target_os = "macos")]
            windows::install_mouse_navigation(app.handle());
            // The window starts hidden: if ArboDat+ is already running, it shows ArboDat+ right
            // away instead of flashing the Control Center first.
            tauri::async_runtime::spawn(route_on_startup(app.handle().clone()));
            tauri::async_runtime::spawn(windows::watch::run(app.handle().clone()));
            Ok(())
        })
        .on_menu_event(|app, event| windows::menu::handle(app, event.id().as_ref()))
        .invoke_handler(tauri::generate_handler![
            commands::get_status,
            commands::install,
            commands::start,
            commands::stop,
            commands::open_arbodat,
            commands::change_port,
            commands::remove_installation,
            commands::get_settings,
            commands::set_auto_start,
            commands::choose_backup_folder,
            commands::reset_backup_folder,
            commands::connect_server,
            commands::use_local_mode,
            commands::server_status,
            commands::open_server_in_browser
        ])
        .on_window_event(|window, event| {
            // Closing the window (or quitting) while the stack is being installed, started or
            // stopped would kill the Docker command halfway: refuse, and say why. Otherwise
            // closing the window ends the app; the stack keeps running.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                if app
                    .state::<runtime::RuntimeManager>()
                    .current_operation()
                    .is_some()
                {
                    api.prevent_close();
                    windows::menu::notify_busy(app);
                }
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

/// How long the window may stay hidden while we find out whether ArboDat+ is already running.
const ROUTING_DEADLINE: Duration = Duration::from_secs(4);

/// Server mode: the server answers, show it. Local mode: a running stack is shown. Anything else
/// (or an answer that takes too long): show the Control Center, which explains the state (and is
/// where a first setup happens).
async fn route_on_startup(app: tauri::AppHandle) {
    let target = match app.state::<settings::SettingsStore>().get() {
        settings::Settings {
            mode: settings::Mode::Server,
            server_url: Some(server),
            ..
        } => match server::normalize_url(&server) {
            Ok(base) => tokio::time::timeout(ROUTING_DEADLINE, server::check(&base))
                .await
                .ok()
                .and_then(Result::ok),
            Err(_) => None,
        },
        settings::Settings {
            mode: settings::Mode::Server,
            ..
        } => None,
        _ => {
            let runtime = app.state::<runtime::RuntimeManager>();
            match tokio::time::timeout(ROUTING_DEADLINE, runtime.status()).await {
                Ok(status) if status.stack.phase == runtime::model::StackPhase::Running => status
                    .stack
                    .port
                    .and_then(|port| Url::parse(&format!("http://127.0.0.1:{port}/")).ok()),
                _ => None,
            }
        }
    };
    if let Some(url) = target {
        log::info!("ArboDat+ is available: opening it at {url}");
        // Window creation belongs on the main thread.
        let handle = app.clone();
        let opened = app.run_on_main_thread(move || {
            if let Err(e) = windows::arbodat::open_when_ready(&handle, url) {
                log::error!("could not show ArboDat+: {e}");
                windows::arbodat::show_control_center(&handle);
            }
        });
        if opened.is_ok() {
            return;
        }
    }
    log::info!("ArboDat+ isn't available (or didn't answer in time): showing the Control Center");
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || windows::arbodat::show_control_center(&handle));
}
