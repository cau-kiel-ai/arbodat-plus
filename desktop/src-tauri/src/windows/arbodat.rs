//! The ArboDat+ window: the web app in a system webview. Links that leave ArboDat+ open in the
//! browser, links within it stay in the window, and downloads land in the Downloads folder.

use std::sync::{Mutex, PoisonError};

use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};

use super::{LAUNCHER, download, open_external};

pub const LABEL: &str = "arbodat";
const SHIMS: &str = include_str!("scripts/shims.js");

/// Where "Home" goes: the address the window was opened with.
#[derive(Default)]
pub struct Home(Mutex<Option<Url>>);

impl Home {
    pub fn get(&self) -> Option<Url> {
        self.0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    fn set(&self, url: Url) {
        *self.0.lock().unwrap_or_else(PoisonError::into_inner) = Some(url);
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum Navigation {
    /// Part of ArboDat+ (or a page-internal URL): load it in this window.
    Stay,
    /// A web or mail link that leaves ArboDat+: the system opens it.
    OpenExternally,
    /// Nothing a web page should be able to trigger.
    Block,
}

pub fn classify(url: &Url, home: &Url) -> Navigation {
    match url.scheme() {
        // Created by the page itself (downloads, generated documents).
        "blob" | "data" | "about" => Navigation::Stay,
        "http" | "https" if url.origin() == home.origin() => Navigation::Stay,
        "http" | "https" | "mailto" => Navigation::OpenExternally,
        _ => Navigation::Block,
    }
}

/// Opens the window at `home`, or brings the existing one forward. The launcher steps aside
/// (the menu's "Control Center" brings it back).
pub fn open(app: &AppHandle, home: Url) -> tauri::Result<()> {
    app.state::<Home>().set(home.clone());

    if let Some(window) = app.get_webview_window(LABEL) {
        // The address can change (the port setting): follow it.
        if window.url().map(|u| u.origin()).ok() != Some(home.origin()) {
            window.navigate(home)?;
        }
        super::bring_forward(&window);
    } else {
        let (nav_app, win_app) = (app.clone(), app.clone());
        let (nav_home, window_home) = (home.clone(), home.clone());
        #[allow(unused_mut)]
        let mut builder = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::External(home))
            .title("ArboDat+")
            .inner_size(1280.0, 860.0)
            .min_inner_size(800.0, 560.0)
            .initialization_script(SHIMS)
            .on_navigation(move |url| match classify(url, &nav_home) {
                Navigation::Stay => true,
                Navigation::OpenExternally => {
                    open_external(&nav_app, url);
                    false
                }
                Navigation::Block => {
                    log::warn!("blocked navigation to a {}: URL", url.scheme());
                    false
                }
            })
            .on_new_window(move |url, _features| {
                match classify(&url, &window_home) {
                    Navigation::Stay => {
                        let app = win_app.clone();
                        let _ = win_app.run_on_main_thread(move || {
                            if let Some(window) = app.get_webview_window(LABEL)
                                && let Err(e) = window.navigate(url)
                            {
                                log::warn!("could not follow a link in the window: {e}");
                            }
                        });
                    }
                    Navigation::OpenExternally => open_external(&win_app, &url),
                    Navigation::Block => {
                        log::warn!("blocked a new window for a {}: URL", url.scheme())
                    }
                }
                NewWindowResponse::Deny
            })
            .on_download(download::handler(app));
        // macOS has one menu bar for the app (swapped when the window gets focus, see
        // `menu::on_focus`); elsewhere every window carries its own.
        #[cfg(not(target_os = "macos"))]
        {
            builder = builder.menu(app.state::<super::menu::Menus>().arbodat.clone());
        }
        builder.build()?;
    }

    if let Some(launcher) = app.get_webview_window(LAUNCHER) {
        let _ = launcher.hide();
    }
    Ok(())
}

/// The address of ArboDat+ changed (another port): remember it, and move the window along if it
/// shows ArboDat+ right now. (A window showing the stopped page goes there when ArboDat+ starts.)
pub fn follow(app: &AppHandle, home: Url) {
    app.state::<Home>().set(home.clone());
    if let Some(window) = app.get_webview_window(LABEL)
        && let Ok(shown) = window.url()
        && matches!(shown.scheme(), "http" | "https")
        && shown.origin() != home.origin()
        && let Err(e) = window.navigate(home)
    {
        log::warn!("could not follow ArboDat+ to its new address: {e}");
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    Back,
    Forward,
}

/// Back or forward in the ArboDat+ window's history (menu, mouse buttons).
pub fn step(app: &AppHandle, step: Step) {
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.eval(match step {
            Step::Back => "history.back()",
            Step::Forward => "history.forward()",
        });
    }
}

/// The stack was stopped from the Control Center: tell the window instead of leaving a dead page.
pub fn show_stopped(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(LABEL)
        && let Err(e) = window.navigate(super::stopped::url())
    {
        log::warn!("could not show the stopped page: {e}");
    }
}

/// The stack is running again: if the window shows the stopped page, go back to ArboDat+.
pub fn resume(app: &AppHandle) {
    let Some(window) = app.get_webview_window(LABEL) else {
        return;
    };
    if window.url().is_ok_and(|u| u.scheme() == "data")
        && let Some(home) = app.state::<Home>().get()
        && let Err(e) = window.navigate(home)
    {
        log::warn!("could not return to ArboDat+: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn home() -> Url {
        Url::parse("http://127.0.0.1:8480/").unwrap()
    }

    fn classify_str(url: &str) -> Navigation {
        classify(&Url::parse(url).unwrap(), &home())
    }

    #[test]
    fn pages_of_arbodat_stay_in_the_window() {
        for url in [
            "http://127.0.0.1:8480/",
            "http://127.0.0.1:8480/explorer.html?x=1#top",
            "blob:http://127.0.0.1:8480/5f1c-uuid",
            "data:text/csv;base64,AAAA",
            "about:blank",
        ] {
            assert_eq!(classify_str(url), Navigation::Stay, "{url}");
        }
    }

    #[test]
    fn everything_else_on_the_web_goes_to_the_system() {
        for url in [
            "https://www.gbv.de/",
            "http://uri.gbv.de/terminology/bk/",
            "https://nominatim.openstreetmap.org/",
            "mailto:mail@arbodat.info",
            // Looks local, isn't the same origin: another port, another host name, another scheme.
            "http://127.0.0.1:8481/",
            "http://localhost:8480/",
            "https://127.0.0.1:8480/",
            // The user-info trick: the real host is evil.example.
            "http://127.0.0.1:8480@evil.example/",
        ] {
            assert_eq!(classify_str(url), Navigation::OpenExternally, "{url}");
        }
    }

    #[test]
    fn a_page_cannot_trigger_local_files_scripts_or_other_apps() {
        for url in [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "tel:+4912345",
            "ftp://example.org/",
            "ssh://example.org/",
            "tauri://localhost/",
        ] {
            assert_eq!(classify_str(url), Navigation::Block, "{url}");
        }
    }

    #[test]
    fn a_server_in_server_mode_is_its_own_origin() {
        let server = Url::parse("https://arbodat.example.org/app/").unwrap();
        let page = Url::parse("https://arbodat.example.org/app/explorer.html").unwrap();
        assert_eq!(classify(&page, &server), Navigation::Stay);
        let other = Url::parse("https://other.example.org/").unwrap();
        assert_eq!(classify(&other, &server), Navigation::OpenExternally);
    }
}
