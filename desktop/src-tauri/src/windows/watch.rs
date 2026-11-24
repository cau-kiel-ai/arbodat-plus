//! Tells the user, inside the ArboDat+ window, when what it shows stops answering: the server of
//! server mode, or the local installation when it was stopped outside the app (Docker Desktop
//! quit, `docker stop`). The window stays open (it may hold something being typed); the message
//! goes away by itself when the address answers again.

use std::time::Duration;

use tauri::{AppHandle, Manager, Url};

use super::arbodat::{self, Home};
use super::main_window;
use crate::runtime::{RuntimeManager, probe};
use crate::server;
use crate::settings::{Mode, SettingsStore};

const EVERY: Duration = Duration::from_secs(10);
const SERVER_MESSAGE: &str = "ArboDat+ Server is not answering";
const LOCAL_MESSAGE: &str = "ArboDat+ is not answering";

/// The script that shows or removes the message (defined in scripts/shims.js; a page that has
/// just been loaded has the function, one without the shims simply ignores the call).
pub fn banner_script(problem: Option<&str>) -> String {
    match problem {
        Some(message) => {
            let text = serde_json::to_string(message).expect("a string is serialisable");
            format!("window.__arbodatBanner && window.__arbodatBanner({text});")
        }
        None => "window.__arbodatBannerClear && window.__arbodatBannerClear();".into(),
    }
}

async fn answers(app: &AppHandle, home: &Url) -> bool {
    match app.state::<SettingsStore>().get().mode {
        Mode::Server => server::check(home).await.is_ok(),
        // Straight to 127.0.0.1, so no proxy setting can get in the way.
        Mode::Local => match home.port() {
            Some(port) => probe::status_of(port, "/healthz").await == Ok(200),
            None => true,
        },
    }
}

fn message(app: &AppHandle) -> &'static str {
    match app.state::<SettingsStore>().get().mode {
        Mode::Server => SERVER_MESSAGE,
        Mode::Local => LOCAL_MESSAGE,
    }
}

/// Runs for the life of the app.
pub async fn run(app: AppHandle) {
    loop {
        tokio::time::sleep(EVERY).await;
        // Only while the window shows ArboDat+: the Control Center has its own status display.
        let Some(window) = main_window(&app).filter(|_| arbodat::shows_arbodat(&app)) else {
            continue;
        };
        // Installing, starting, stopping or moving the port restarts ArboDat+ on purpose.
        if app.state::<RuntimeManager>().current_operation().is_some() {
            continue;
        }
        let Some(home) = app.state::<Home>().get() else {
            continue;
        };
        let problem = (!answers(&app, &home).await).then(|| message(&app));
        // A page load removes the message, so a failing address gets it again every round.
        let _ = window.eval(banner_script(problem));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_message_is_passed_as_a_safe_string_literal() {
        assert_eq!(
            banner_script(Some("ArboDat+ Server is not answering")),
            r#"window.__arbodatBanner && window.__arbodatBanner("ArboDat+ Server is not answering");"#
        );
        // Quotes and script-closing text can't break out of the literal.
        let script = banner_script(Some(r#"x"); alert(1); ("#));
        assert!(script.contains(r#"\"); alert(1); ("#), "{script}");
    }

    #[test]
    fn no_problem_clears_the_message() {
        assert!(banner_script(None).contains("__arbodatBannerClear"));
    }
}
