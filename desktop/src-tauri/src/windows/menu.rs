//! The menu. The window needs an Edit menu (macOS only copies and pastes through it) and a few
//! browser-like Navigate commands, which act on the ArboDat+ page.

#[cfg(target_os = "macos")]
use tauri::menu::AboutMetadataBuilder;
use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Wry};

use super::arbodat::{self, Home};
use super::{MAIN, main_window, open_external};

const BACK: &str = "nav-back";
const FORWARD: &str = "nav-forward";
const HOME: &str = "nav-home";
const RELOAD: &str = "nav-reload";
const CONTROL_CENTER: &str = "control-center";
const OPEN_IN_BROWSER: &str = "open-in-browser";
#[cfg(not(target_os = "macos"))]
const QUIT: &str = "quit";

/// The menu bar, kept so a window created later can carry it (Windows and Linux; macOS has one
/// menu bar for the whole app).
#[cfg_attr(target_os = "macos", allow(dead_code))]
pub struct AppMenu(pub Menu<Wry>);

fn build(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let mut menu = MenuBuilder::new(app);

    #[cfg(target_os = "macos")]
    {
        // The standard panel shows "Version 5.0.0-dev (5.0.0-dev)": version and build number are
        // the same text here. An empty build number leaves the brackets out.
        let about = AboutMetadataBuilder::new()
            .name(Some("ArboDat+"))
            .version(Some(app.package_info().version.to_string()))
            .short_version(Some(""))
            .build();
        menu = menu.item(
            &SubmenuBuilder::new(app, "ArboDat+")
                .about_with_text("About ArboDat+", Some(about))
                .separator()
                .services()
                .separator()
                .hide_with_text("Hide ArboDat+")
                .hide_others()
                .show_all()
                .separator()
                .quit_with_text("Quit ArboDat+")
                .build()?,
        );
    }
    #[cfg(not(target_os = "macos"))]
    {
        menu = menu.item(
            &SubmenuBuilder::new(app, "File")
                .item(&MenuItemBuilder::with_id(QUIT, "Quit").build(app)?)
                .build()?,
        );
    }

    menu = menu.item(
        &SubmenuBuilder::new(app, "Edit")
            .undo()
            .redo()
            .separator()
            .cut()
            .copy()
            .paste()
            .select_all()
            .build()?,
    );

    {
        menu = menu.item(
            &SubmenuBuilder::new(app, "Navigate")
                .item(
                    &MenuItemBuilder::with_id(BACK, "Back")
                        .accelerator("CmdOrCtrl+[")
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::with_id(FORWARD, "Forward")
                        .accelerator("CmdOrCtrl+]")
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::with_id(HOME, "Home")
                        .accelerator("CmdOrCtrl+Shift+H")
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::with_id(RELOAD, "Reload")
                        .accelerator("CmdOrCtrl+R")
                        .build(app)?,
                )
                .build()?,
        );
    }

    let mut window_menu = SubmenuBuilder::new(app, "Window").minimize().maximize();
    #[cfg(target_os = "macos")]
    {
        window_menu = window_menu.close_window();
    }
    window_menu = window_menu
        .separator()
        .item(&MenuItemBuilder::with_id(CONTROL_CENTER, "Control Center").build(app)?);
    window_menu = window_menu.item(
        &MenuItemBuilder::with_id(OPEN_IN_BROWSER, "Open in Browser")
            .accelerator("CmdOrCtrl+Shift+B")
            .build(app)?,
    );
    menu.item(&window_menu.build()?).build()
}

/// Builds the menu. On macOS it is the app's menu bar right away; elsewhere the window created
/// afterwards carries it.
pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let menu = build(app)?;
    #[cfg(target_os = "macos")]
    app.set_menu(menu.clone())?;
    app.manage(AppMenu(menu));
    Ok(())
}

/// Quitting while installing, starting or stopping would kill the Docker command halfway.
#[cfg(not(target_os = "macos"))]
fn quit(app: &AppHandle) {
    use crate::runtime::RuntimeManager;
    if app.state::<RuntimeManager>().current_operation().is_some() {
        notify_busy(app);
    } else {
        app.exit(0);
    }
}

/// Shows the Control Center and tells it why the window can't be closed right now.
pub fn notify_busy(app: &AppHandle) {
    arbodat::show_control_center(app);
    let _ = app.emit_to(MAIN, "close-blocked", ());
}

pub fn handle(app: &AppHandle, id: &str) {
    let window = main_window(app);
    match id {
        BACK => arbodat::step(app, arbodat::Step::Back),
        FORWARD => arbodat::step(app, arbodat::Step::Forward),
        RELOAD => {
            if let Some(window) = window {
                let _ = window.eval("location.reload()");
            }
        }
        HOME => {
            // On the Control Center there is no "home" to go to; its own x does that.
            if arbodat::shows_arbodat(app)
                && let (Some(window), Some(home)) = (window, app.state::<Home>().get())
            {
                let _ = window.navigate(home);
            }
        }
        CONTROL_CENTER => arbodat::request_control_center(app),
        OPEN_IN_BROWSER => {
            // The page being looked at, or the start page if the window shows something internal.
            let url = window
                .and_then(|w| w.url().ok())
                .filter(|u| matches!(u.scheme(), "http" | "https"))
                .or_else(|| app.state::<Home>().get());
            if let Some(url) = url {
                open_external(app, &url);
            }
        }
        #[cfg(not(target_os = "macos"))]
        QUIT => quit(app),
        _ => {}
    }
}
