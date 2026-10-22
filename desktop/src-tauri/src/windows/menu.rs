//! Menus. The ArboDat+ window needs an Edit menu (macOS only copies and pastes through it) and
//! a few browser-like Navigate commands; the launcher gets the same without Navigate.

use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Window, Wry};

use super::arbodat::{self, Home};
use super::{LAUNCHER, open_external, show_launcher};

const BACK: &str = "nav-back";
const FORWARD: &str = "nav-forward";
const HOME: &str = "nav-home";
const RELOAD: &str = "nav-reload";
const CONTROL_CENTER: &str = "control-center";
const OPEN_IN_BROWSER: &str = "open-in-browser";
#[cfg(not(target_os = "macos"))]
const QUIT: &str = "quit";

pub struct Menus {
    pub launcher: Menu<Wry>,
    pub arbodat: Menu<Wry>,
}

fn build(app: &AppHandle, with_navigation: bool) -> tauri::Result<Menu<Wry>> {
    let mut menu = MenuBuilder::new(app);

    #[cfg(target_os = "macos")]
    {
        menu = menu.item(
            &SubmenuBuilder::new(app, "ArboDat+")
                .about(None)
                .separator()
                .services()
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
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

    if with_navigation {
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
    if with_navigation {
        window_menu = window_menu.item(
            &MenuItemBuilder::with_id(OPEN_IN_BROWSER, "Open in Browser")
                .accelerator("CmdOrCtrl+Shift+B")
                .build(app)?,
        );
    }
    menu.item(&window_menu.build()?).build()
}

/// Builds both menus and gives the launcher its own.
pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let menus = Menus {
        launcher: build(app, false)?,
        arbodat: build(app, true)?,
    };
    #[cfg(target_os = "macos")]
    app.set_menu(menus.launcher.clone())?;
    #[cfg(not(target_os = "macos"))]
    if let Some(window) = app.get_webview_window(LAUNCHER) {
        window.set_menu(menus.launcher.clone())?;
    }
    app.manage(menus);
    Ok(())
}

/// macOS has one menu bar for the whole app: show the menu of the window that has the focus.
#[cfg_attr(not(target_os = "macos"), allow(unused_variables))]
pub fn on_focus(window: &Window) {
    #[cfg(target_os = "macos")]
    {
        let app = window.app_handle();
        let menus = app.state::<Menus>();
        let menu = if window.label() == arbodat::LABEL {
            &menus.arbodat
        } else {
            &menus.launcher
        };
        let _ = app.set_menu(menu.clone());
    }
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

/// Shows the launcher and tells it why the window can't be closed right now.
pub fn notify_busy(app: &AppHandle) {
    show_launcher(app);
    let _ = app.emit_to(LAUNCHER, "close-blocked", ());
}

pub fn handle(app: &AppHandle, id: &str) {
    let window = app.get_webview_window(arbodat::LABEL);
    match id {
        BACK => arbodat::step(app, arbodat::Step::Back),
        FORWARD => arbodat::step(app, arbodat::Step::Forward),
        RELOAD => {
            if let Some(window) = window {
                let _ = window.eval("location.reload()");
            }
        }
        HOME => {
            if let (Some(window), Some(home)) = (window, app.state::<Home>().get()) {
                let _ = window.navigate(home);
            }
        }
        CONTROL_CENTER => show_launcher(app),
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
