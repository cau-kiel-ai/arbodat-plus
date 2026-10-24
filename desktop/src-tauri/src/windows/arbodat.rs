//! The one window of the app. It shows either the Control Center (our own page) or ArboDat+ (a web
//! page from a URL) and switches between the two by navigating, so there is never a second window.
//!
//! Security: the capability in `capabilities/launcher.json` has no `remote` entry, so it applies
//! to the app's own pages only. A web page loaded in this same window, however it got there, can't
//! call a single command (`commands.rs` has a test for the file; the behaviour itself was checked
//! by calling a command from a web page in the window: refused, while the Control Center may).
//!
//! Links that leave ArboDat+ open in the browser, links within it stay in the window, and downloads
//! land in the Downloads folder.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, PoisonError};
use std::time::Duration;

use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, Url, WebviewWindowBuilder};

use super::{MAIN, bring_forward, download, main_window, open_external};

const SHIMS: &str = include_str!("scripts/shims.js");

/// A navigation to this address is how the cog in the ArboDat+ page asks for the Control Center:
/// the page has no other way to reach the app, and needs none.
pub const CONTROL_CENTER_URL: &str = "arbodat-desktop://control-center";

const TITLE: &str = "ArboDat+";

/// How long a hidden window waits for ArboDat+ to load before it is shown regardless.
const REVEAL_AT_LATEST: Duration = Duration::from_secs(6);

/// Where "Home" goes: the address of ArboDat+ (the local installation, or the server).
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

/// At startup the window stays hidden while it loads ArboDat+, and is shown when the page is there:
/// showing it earlier would flash the Control Center (the page it starts with) for a moment.
#[derive(Default)]
pub struct RevealWhenLoaded(AtomicBool);

impl RevealWhenLoaded {
    fn arm(&self) {
        self.0.store(true, Ordering::SeqCst);
    }

    /// True once per `arm`: whoever shows the window asks, and the answer is consumed.
    fn take(&self) -> bool {
        self.0.swap(false, Ordering::SeqCst)
    }
}

/// The ArboDat+ page that was showing when the Control Center took over, so closing the Control
/// Center can go back to it instead of the start page.
#[derive(Default)]
pub struct LastPage(Mutex<Option<Url>>);

impl LastPage {
    fn set(&self, url: Url) {
        *self.0.lock().unwrap_or_else(PoisonError::into_inner) = Some(url);
    }

    fn take(&self) -> Option<Url> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner).take()
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum Navigation {
    /// Part of ArboDat+ or of the app (or a page-internal URL): load it in this window.
    Stay,
    /// A web or mail link that leaves ArboDat+: the system opens it.
    OpenExternally,
    /// The cog in the ArboDat+ page: show the Control Center.
    ControlCenter,
    /// Nothing a web page should be able to trigger.
    Block,
}

/// Same scheme, host and port. (`Url::origin` can't be used for the app's own `tauri://` pages: it
/// is opaque for schemes the url crate doesn't know, and an opaque origin equals nothing.)
fn same_site(a: &Url, b: &Url) -> bool {
    a.scheme() == b.scheme()
        && a.host_str() == b.host_str()
        && a.port_or_known_default() == b.port_or_known_default()
}

/// Between "ArboDat+" and the page name in the title bar: two em spaces, a wide space like a tab
/// (no dash or other mark).
const TITLE_GAP: &str = "\u{2003}\u{2003}";

/// The title bar: "ArboDat+" for the start page and the Control Center, "ArboDat+    Data Input" and
/// so on for the other pages of the web app (named by their file, so it works under any sub-path).
pub fn window_title(url: &Url, home: Option<&Url>, app: &Url) -> String {
    if same_site(url, app) || !home.is_some_and(|home| same_site(url, home)) {
        return TITLE.into();
    }
    let page = url
        .path_segments()
        .and_then(|mut segments| segments.next_back())
        .unwrap_or_default();
    let name = match page {
        "input.html" => "Data Input",
        "migration.html" => "Data Migration",
        "data-explorer.html" => "Data Explorer",
        "report.html" => "Data Report",
        "export.html" => "Data Export",
        "license.html" => "License",
        "contact.html" => "Contact",
        _ => return TITLE.into(),
    };
    format!("{TITLE}{TITLE_GAP}{name}")
}

pub fn classify(url: &Url, home: Option<&Url>, app: &Url) -> Navigation {
    match url.scheme() {
        // Created by the page itself (downloads, generated documents).
        "blob" | "data" | "about" => Navigation::Stay,
        _ if url.as_str() == CONTROL_CENTER_URL => Navigation::ControlCenter,
        "tauri" | "http" | "https" if same_site(url, app) => Navigation::Stay,
        "http" | "https" if home.is_some_and(|home| same_site(url, home)) => Navigation::Stay,
        "http" | "https" | "mailto" => Navigation::OpenExternally,
        _ => Navigation::Block,
    }
}

/// The address of the app's own pages in the webview: `tauri://localhost/` (`http://tauri.localhost/`
/// on Windows), or the Vite server while developing.
pub fn app_url(app: &AppHandle) -> Url {
    if tauri::is_dev()
        && let Some(dev) = app.config().build.dev_url.clone()
    {
        return dev;
    }
    let url = if cfg!(windows) {
        "http://tauri.localhost/"
    } else {
        "tauri://localhost/"
    };
    Url::parse(url).expect("a valid address")
}

/// What the window counts as ArboDat+ right now. Read at every navigation, not captured when the
/// window is created: the address changes (another server, another port).
fn current_home(app: &AppHandle) -> Option<Url> {
    app.state::<Home>().get()
}

/// Creates the (still hidden) window, with the handlers that keep ArboDat+ inside it.
pub fn create_main(app: &AppHandle) -> tauri::Result<()> {
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == MAIN)
        .cloned()
        .expect("tauri.conf.json defines the main window");
    let own_url = app_url(app);
    let script = format!(
        "window.__ARBODAT_APP_URL = {};\n{SHIMS}",
        serde_json::to_string(own_url.as_str()).expect("a string is serialisable")
    );
    let (nav_app, win_app) = (app.clone(), app.clone());
    #[allow(unused_mut)]
    let mut builder = WebviewWindowBuilder::from_config(app, &config)?
        .initialization_script(script)
        .on_navigation(move |url| {
            match classify(url, current_home(&nav_app).as_ref(), &app_url(&nav_app)) {
                Navigation::Stay => true,
                Navigation::OpenExternally => {
                    open_external(&nav_app, url);
                    false
                }
                Navigation::ControlCenter => {
                    show_control_center_later(&nav_app);
                    false
                }
                Navigation::Block => {
                    log::warn!("blocked navigation to a {}: URL", url.scheme());
                    false
                }
            }
        })
        .on_new_window(move |url, _features| {
            match classify(&url, current_home(&win_app).as_ref(), &app_url(&win_app)) {
                Navigation::Stay => {
                    let app = win_app.clone();
                    let _ = win_app.run_on_main_thread(move || {
                        if let Some(window) = main_window(&app)
                            && let Err(e) = window.navigate(url)
                        {
                            log::warn!("could not follow a link in the window: {e}");
                        }
                    });
                }
                Navigation::OpenExternally => open_external(&win_app, &url),
                Navigation::ControlCenter => show_control_center_later(&win_app),
                Navigation::Block => {
                    log::warn!("blocked a new window for a {}: URL", url.scheme())
                }
            }
            NewWindowResponse::Deny
        })
        .on_download(download::handler(app))
        .on_page_load(|window, payload| {
            let app = window.app_handle();
            match payload.event() {
                tauri::webview::PageLoadEvent::Started => {
                    let title =
                        window_title(payload.url(), current_home(app).as_ref(), &app_url(app));
                    let _ = window.set_title(&title);
                }
                // The ArboDat+ page the window was waiting for is there: now it may be seen.
                tauri::webview::PageLoadEvent::Finished
                    if !same_site(payload.url(), &app_url(app))
                        && app.state::<RevealWhenLoaded>().take() =>
                {
                    bring_forward(&window);
                }
                _ => {}
            }
        });
    // macOS has one menu bar for the app (see `menu::install`); elsewhere the window carries it.
    #[cfg(not(target_os = "macos"))]
    {
        builder = builder.menu(app.state::<super::menu::AppMenu>().0.clone());
    }
    builder.build()?;
    Ok(())
}

/// Shows ArboDat+ in the window: the page that was open before the Control Center (if it belongs
/// to `home`), else the start page. A fresh load; whatever was typed in the old page is gone.
pub fn open(app: &AppHandle, home: Url) -> tauri::Result<()> {
    app.state::<Home>().set(home.clone());
    let Some(window) = main_window(app) else {
        return Ok(());
    };
    let target = match app.state::<LastPage>().take() {
        Some(last) if same_site(&last, &home) => last,
        _ => home.clone(),
    };
    let shows_arbodat = window.url().is_ok_and(|shown| same_site(&shown, &home));
    if !shows_arbodat {
        window.navigate(target)?;
    }
    bring_forward(&window);
    Ok(())
}

/// Startup: loads ArboDat+ in the still hidden window and shows the window once the page is there
/// (or after a few seconds anyway, if it never arrives). Nobody sees the Control Center flash by.
pub fn open_when_ready(app: &AppHandle, home: Url) -> tauri::Result<()> {
    let Some(window) = main_window(app) else {
        return Ok(());
    };
    app.state::<Home>().set(home.clone());
    app.state::<RevealWhenLoaded>().arm();
    window.navigate(home)?;
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(REVEAL_AT_LATEST).await;
        if app.state::<RevealWhenLoaded>().take() {
            let on_main = app.clone();
            let _ = app.run_on_main_thread(move || {
                if let Some(window) = main_window(&on_main) {
                    bring_forward(&window);
                }
            });
        }
    });
    Ok(())
}

/// Shows the Control Center in the window, and remembers the ArboDat+ page it replaces.
pub fn show_control_center(app: &AppHandle) {
    let Some(window) = main_window(app) else {
        return;
    };
    let app_url = app_url(app);
    if let Ok(shown) = window.url() {
        if same_site(&shown, &app_url) {
            bring_forward(&window);
            return;
        }
        if current_home(app).is_some_and(|home| same_site(&shown, &home)) {
            app.state::<LastPage>().set(shown);
        }
    }
    if let Err(e) = window.navigate(app_url) {
        log::warn!("could not show the Control Center: {e}");
    }
    bring_forward(&window);
}

/// For use inside a navigation callback: switching pages is itself a navigation, so it waits until
/// the callback has returned.
fn show_control_center_later(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let on_main = app.clone();
        let _ = app.run_on_main_thread(move || show_control_center(&on_main));
    });
}

/// The menu and the Dock ask for the Control Center: through the page if it is ArboDat+, so its
/// warning about unsaved input can come first.
pub fn request_control_center(app: &AppHandle) {
    let Some(window) = main_window(app) else {
        return;
    };
    let on_arbodat_page = window
        .url()
        .is_ok_and(|shown| current_home(app).is_some_and(|home| same_site(&shown, &home)));
    if on_arbodat_page {
        let script = format!(
            "(window.__arbodatOpenControl || function () {{ location.assign('{CONTROL_CENTER_URL}'); }})();"
        );
        let _ = window.eval(script);
    } else {
        show_control_center(app);
    }
}

/// Is the window showing ArboDat+ (and not the Control Center)?
pub fn shows_arbodat(app: &AppHandle) -> bool {
    main_window(app)
        .and_then(|w| w.url().ok())
        .is_some_and(|shown| current_home(app).is_some_and(|home| same_site(&shown, &home)))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    Back,
    Forward,
}

/// Back or forward in the ArboDat+ window's history (menu, mouse buttons).
pub fn step(app: &AppHandle, step: Step) {
    if let Some(window) = main_window(app) {
        let _ = window.eval(match step {
            Step::Back => "history.back()",
            Step::Forward => "history.forward()",
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn home() -> Url {
        Url::parse("http://127.0.0.1:8480/").unwrap()
    }

    fn app() -> Url {
        Url::parse("tauri://localhost/").unwrap()
    }

    fn classify_str(url: &str) -> Navigation {
        classify(&Url::parse(url).unwrap(), Some(&home()), &app())
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
    fn the_apps_own_pages_stay_in_the_window() {
        for url in ["tauri://localhost/", "tauri://localhost/index.html"] {
            assert_eq!(classify_str(url), Navigation::Stay, "{url}");
        }
        // Windows serves them over http on a made-up host; developing uses the Vite server.
        let windows = Url::parse("http://tauri.localhost/").unwrap();
        let page = Url::parse("http://tauri.localhost/index.html").unwrap();
        assert_eq!(classify(&page, Some(&home()), &windows), Navigation::Stay);
        let dev = Url::parse("http://localhost:1420/").unwrap();
        assert_eq!(classify(&dev, None, &dev), Navigation::Stay);
        // Another port on the same host is not the app.
        let other = Url::parse("http://localhost:1421/").unwrap();
        assert_eq!(classify(&other, None, &dev), Navigation::OpenExternally);
    }

    #[test]
    fn the_cog_is_recognised_only_by_its_exact_address() {
        assert_eq!(classify_str(CONTROL_CENTER_URL), Navigation::ControlCenter);
        for url in [
            "arbodat-desktop://control-center/x",
            "arbodat-desktop://control-center?x=1",
            "arbodat-desktop://other",
            "arbodat-desktop:control-center",
        ] {
            assert_eq!(classify_str(url), Navigation::Block, "{url}");
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
    fn without_an_address_of_arbodat_no_web_page_counts_as_its_own() {
        let url = Url::parse("http://127.0.0.1:8480/").unwrap();
        assert_eq!(classify(&url, None, &app()), Navigation::OpenExternally);
    }

    #[test]
    fn a_page_cannot_trigger_local_files_scripts_or_other_apps() {
        for url in [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "tel:+4912345",
            "ftp://example.org/",
            "ssh://example.org/",
            "tauri://evil/",
        ] {
            assert_eq!(classify_str(url), Navigation::Block, "{url}");
        }
    }

    #[test]
    fn a_server_in_server_mode_is_its_own_origin() {
        let server = Url::parse("https://arbodat.example.org/app/").unwrap();
        let page = Url::parse("https://arbodat.example.org/app/explorer.html").unwrap();
        assert_eq!(classify(&page, Some(&server), &app()), Navigation::Stay);
        let other = Url::parse("https://other.example.org/").unwrap();
        assert_eq!(
            classify(&other, Some(&server), &app()),
            Navigation::OpenExternally
        );
    }

    #[test]
    fn the_title_names_the_page() {
        let title = |url: &str| window_title(&Url::parse(url).unwrap(), Some(&home()), &app());
        assert_eq!(title("http://127.0.0.1:8480/"), "ArboDat+");
        assert_eq!(title("http://127.0.0.1:8480/index.html"), "ArboDat+");
        assert_eq!(title("tauri://localhost/"), "ArboDat+");
        for (page, name) in [
            ("input.html", "Data Input"),
            ("migration.html", "Data Migration"),
            ("data-explorer.html", "Data Explorer"),
            ("report.html", "Data Report"),
            ("export.html", "Data Export"),
            ("license.html", "License"),
            ("contact.html", "Contact"),
        ] {
            assert_eq!(
                title(&format!("http://127.0.0.1:8480/{page}?x=1#top")),
                format!("ArboDat+\u{2003}\u{2003}{name}")
            );
        }
        // Under a sub-path (a server), and for pages that aren't ArboDat+'s.
        let server = Url::parse("https://example.org/arbodat/").unwrap();
        let page = Url::parse("https://example.org/arbodat/input.html").unwrap();
        assert_eq!(
            window_title(&page, Some(&server), &app()),
            "ArboDat+\u{2003}\u{2003}Data Input"
        );
        assert_eq!(title("https://example.org/input.html"), "ArboDat+");
    }

    #[test]
    fn the_reveal_is_consumed_by_the_first_one_who_asks() {
        let reveal = RevealWhenLoaded::default();
        assert!(!reveal.take(), "not armed: nothing to reveal");
        reveal.arm();
        assert!(reveal.take());
        assert!(!reveal.take(), "consumed");
    }

    #[test]
    fn the_last_page_is_remembered_once() {
        let last = LastPage::default();
        assert_eq!(last.take(), None);
        last.set(home());
        assert_eq!(last.take(), Some(home()));
        assert_eq!(last.take(), None);
    }
}
