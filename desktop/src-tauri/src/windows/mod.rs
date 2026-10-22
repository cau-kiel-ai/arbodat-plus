//! The app's two windows: the launcher (our own UI, may call the app's commands) and the
//! ArboDat+ window (the web app itself, loaded from a URL; no capability, so no IPC).

pub mod arbodat;
pub mod download;
pub mod menu;
#[cfg(target_os = "macos")]
mod mouse_nav;
pub mod stopped;

use tauri::{AppHandle, Manager, Url};
use tauri_plugin_opener::OpenerExt;

pub const LAUNCHER: &str = "launcher";

pub fn show_launcher(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(LAUNCHER) {
        bring_forward(&window);
    }
}

/// Brings the window the user is working in forward: the ArboDat+ window if there is one.
pub fn focus_main(app: &AppHandle) {
    match app.get_webview_window(arbodat::LABEL) {
        Some(window) => bring_forward(&window),
        None => show_launcher(app),
    }
}

fn bring_forward(window: &tauri::WebviewWindow) {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

/// Hands a link to the system (browser, mail program). Only web and mail links: anything else
/// (`file:`, `javascript:`, other apps' schemes) is not something a web page should trigger.
pub fn open_external(app: &AppHandle, url: &Url) {
    if !matches!(url.scheme(), "http" | "https" | "mailto") {
        log::warn!("not opening a {}: link", url.scheme());
        return;
    }
    if let Err(e) = app.opener().open_url(url.as_str(), None::<&str>) {
        log::warn!("could not open {url}: {e}");
    }
}

#[cfg(target_os = "macos")]
pub fn install_mouse_navigation(app: &AppHandle) {
    mouse_nav::install(app);
}
