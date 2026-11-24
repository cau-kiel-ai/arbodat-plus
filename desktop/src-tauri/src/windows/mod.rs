//! The app's one window. It shows either the Control Center (our own page, which may call the
//! app's commands) or ArboDat+ itself (a web page from a URL, which may not), and switches between
//! the two by navigating. See `arbodat.rs`.

pub mod arbodat;
pub mod download;
pub mod menu;
#[cfg(target_os = "macos")]
mod mouse_nav;
pub mod watch;

use tauri::{AppHandle, Manager, Url};
use tauri_plugin_opener::OpenerExt;

pub const MAIN: &str = "main";

pub fn main_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    app.get_webview_window(MAIN)
}

/// Brings the window forward (the Dock icon, launching the app a second time).
pub fn focus_main(app: &AppHandle) {
    if let Some(window) = main_window(app) {
        bring_forward(&window);
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
