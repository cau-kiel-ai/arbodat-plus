//! The diagnostics report: what someone helping needs to see in one piece of text (the app, Docker,
//! the installation, the recent logs), and nothing they must not see (the database password).
//!
//! `render` and the helpers are pure so every part, the redaction above all, is unit-tested.
//! `collect` gathers the facts; it only reads: no container, file or setting is changed.

use std::fmt::Write as _;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};

use crate::runtime::RuntimeManager;
use crate::runtime::model::{CliStatus, ComposeStatus, EngineStatus, ServiceStatus, Status};
use crate::runtime::state::STATE_FILE;
use crate::runtime::template::{ENV_FILE, parse_env};
use crate::server::{self, ServerStatus};
use crate::settings::{Mode, SettingsStore, SettingsView};

const LOG_LINES: u32 = 150;
const APP_LOG_LINES: usize = 80;
const HIDDEN: &str = "<hidden>";

pub struct Input {
    pub created: String,
    pub app_version: String,
    pub system: String,
    pub data_dir: String,
    pub settings: SettingsView,
    /// Server mode: how the server answers.
    pub server: Option<ServerStatus>,
    /// Local mode: what the Control Center shows, as one status.
    pub status: Option<Status>,
    /// `runtime/state.json` and `runtime/.env` as read (the `.env` is cleaned in `render`).
    pub state_file: Option<Result<String, String>>,
    pub env_file: Option<Result<String, String>>,
    pub logs: Option<Result<String, String>>,
    pub app_log: Option<String>,
}

// ---------------------------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------------------------

/// `2026-10-24 13:40:05 UTC` for a Unix time (days-to-date after Howard Hinnant's algorithm, so no
/// date library is needed for one line of text).
pub fn utc_timestamp(unix_secs: u64) -> String {
    let (days, rest) = (unix_secs / 86_400, unix_secs % 86_400);
    let z = days as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let day_of_era = z.rem_euclid(146_097);
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let mp = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = year_of_era + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02} {:02}:{:02}:{:02} UTC",
        rest / 3_600,
        rest % 3_600 / 60,
        rest % 60
    )
}

pub fn last_lines(text: &str, n: usize) -> String {
    let lines: Vec<&str> = text.lines().collect();
    lines[lines.len().saturating_sub(n)..].join("\n")
}

/// Keys whose value is not shown: the database password, and anything that looks like a secret.
fn is_secret_key(key: &str) -> bool {
    let key = key.to_ascii_lowercase();
    ["password", "passwd", "secret", "token", "api_key", "apikey"]
        .iter()
        .any(|word| key.contains(word))
}

/// The settings of a `.env` file, one `KEY=value` per line, with the values of secret keys hidden.
/// Comments are left out: they are only the explanation of the file.
pub fn env_without_secrets(text: &str) -> String {
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(|line| match line.split_once('=') {
            Some((key, _)) if is_secret_key(key) => format!("{}={HIDDEN}", key.trim()),
            _ => line.to_string(),
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// The database password out of a `.env` file.
pub fn password_of(env_text: &str) -> Option<String> {
    parse_env(env_text)
        .remove("DATABASE_PASSWORD")
        .filter(|p| !p.is_empty())
}

/// Hides everything in `text` that must not leave the computer: the given secrets wherever they
/// occur (a log line may quote one), and the value after `password=`, `secret: ` and the like.
pub fn redact(text: &str, secrets: &[&str]) -> String {
    let mut out = text.to_string();
    for secret in secrets.iter().filter(|s| s.len() >= 4) {
        out = out.replace(secret, HIDDEN);
    }
    hide_assigned_secrets(&out)
}

fn hide_assigned_secrets(text: &str) -> String {
    const WORDS: [&str; 5] = ["password", "passwd", "secret", "token", "api_key"];
    let lower = text.to_ascii_lowercase();
    let bytes = text.as_bytes();
    let mut out = String::with_capacity(text.len());
    let mut at = 0;
    while at < text.len() {
        let hit = WORDS
            .iter()
            .filter(|w| lower[at..].starts_with(**w))
            .map(|w| w.len())
            .max();
        let Some(len) = hit else {
            let ch = text[at..].chars().next().expect("not at the end");
            out.push(ch);
            at += ch.len_utf8();
            continue;
        };
        // Past the word: optional spaces or quotes, then `=` or `:`, then the value.
        let mut cursor = at + len;
        while cursor < bytes.len() && matches!(bytes[cursor], b' ' | b'"' | b'\'') {
            cursor += 1;
        }
        if cursor < bytes.len() && matches!(bytes[cursor], b'=' | b':') {
            cursor += 1;
            while cursor < bytes.len() && matches!(bytes[cursor], b' ' | b'"' | b'\'') {
                cursor += 1;
            }
            let value_end = text[cursor..]
                .find(|c: char| {
                    c.is_whitespace() || matches!(c, '&' | ',' | ';' | '"' | '\'' | ')')
                })
                .map_or(text.len(), |i| cursor + i);
            if value_end > cursor {
                out.push_str(&text[at..cursor]);
                out.push_str(HIDDEN);
                at = value_end;
                continue;
            }
        }
        out.push_str(&text[at..at + len]);
        at += len;
    }
    out
}

// ---------------------------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------------------------

fn lower(value: impl std::fmt::Debug) -> String {
    format!("{value:?}").to_lowercase()
}

fn describe_service(s: &ServiceStatus) -> String {
    let mut text = format!("  {}: {}", s.name, lower(s.state));
    if let Some(health) = s.health {
        let _ = write!(text, ", {}", lower(health));
    }
    if let Some(code) = s.exit_code {
        let _ = write!(text, ", exited with code {code}");
    }
    text
}

fn section(out: &mut String, title: &str) {
    let _ = write!(out, "\n== {title}\n");
}

pub fn render(input: &Input) -> String {
    let mut out = String::new();
    let _ = writeln!(out, "ArboDat+ diagnostics, created {}", input.created);

    section(&mut out, "App");
    let _ = writeln!(out, "Version: {}", input.app_version);
    let _ = writeln!(out, "System: {}", input.system);
    let _ = writeln!(out, "Data folder: {}", input.data_dir);
    let mode = match input.settings.mode {
        Mode::Local => "ArboDat+ on this computer",
        Mode::Server => "ArboDat+ on a server",
    };
    let _ = writeln!(out, "Mode: {mode}");
    let _ = writeln!(
        out,
        "Autostart: {}",
        if input.settings.auto_start {
            "yes"
        } else {
            "no"
        }
    );
    let _ = writeln!(
        out,
        "Backup folder: {}{}",
        input.settings.backup_folder,
        if input.settings.backup_folder_is_default {
            " (default)"
        } else {
            ""
        }
    );

    match input.settings.mode {
        Mode::Server => {
            section(&mut out, "Server");
            let _ = writeln!(
                out,
                "Address: {}",
                input.settings.server_url.as_deref().unwrap_or("(none)")
            );
            match &input.server {
                Some(s) if s.reachable => {
                    let _ = writeln!(out, "Answers: yes");
                }
                Some(s) => {
                    let _ = writeln!(out, "Answers: no");
                    if let Some(problem) = &s.problem {
                        let _ = writeln!(out, "Problem: {problem}");
                    }
                    if let Some(detail) = &s.detail {
                        let _ = writeln!(out, "Detail: {detail}");
                    }
                }
                None => {
                    let _ = writeln!(out, "Answers: (not checked)");
                }
            }
            section(&mut out, "Docker");
            let _ = writeln!(out, "Not looked at: the app is using a server.");
        }
        Mode::Local => {
            if let Some(status) = &input.status {
                section(&mut out, "Docker");
                match &status.docker.cli {
                    CliStatus::NotFound => {
                        let _ = writeln!(out, "docker: not found");
                    }
                    CliStatus::Unsupported { path, reason } => {
                        let _ = writeln!(out, "docker: {path} (not supported: {reason})");
                    }
                    CliStatus::Found { path, version } => {
                        let _ = writeln!(
                            out,
                            "docker: {path}{}",
                            version
                                .as_deref()
                                .map(|v| format!(" ({v})"))
                                .unwrap_or_default()
                        );
                    }
                }
                match &status.docker.compose {
                    ComposeStatus::Unknown => {
                        let _ = writeln!(out, "compose: (not checked)");
                    }
                    ComposeStatus::Missing { detail } => {
                        let _ = writeln!(out, "compose: missing ({})", detail.trim());
                    }
                    ComposeStatus::TooOld { version, minimum } => {
                        let _ = writeln!(out, "compose: {version} (too old, needs {minimum})");
                    }
                    ComposeStatus::Found { version } => {
                        let _ = writeln!(out, "compose: {version}");
                    }
                }
                match &status.docker.engine {
                    EngineStatus::Unknown => {
                        let _ = writeln!(out, "engine: (not checked)");
                    }
                    EngineStatus::NotRunning { detail } => {
                        let _ = writeln!(out, "engine: not running ({})", detail.trim());
                    }
                    EngineStatus::PermissionDenied { detail } => {
                        let _ = writeln!(out, "engine: permission denied ({})", detail.trim());
                    }
                    EngineStatus::Error { detail } => {
                        let _ = writeln!(out, "engine: error ({})", detail.trim());
                    }
                    EngineStatus::Running { version, os, id } => {
                        let _ = writeln!(out, "engine: running, {version}, {os}, id {id}");
                    }
                }

                section(&mut out, "ArboDat+ on this computer");
                let stack = &status.stack;
                let _ = writeln!(out, "State: {}", lower(stack.phase));
                if let Some(op) = stack.operation {
                    let _ = writeln!(out, "Working on: {}", lower(op));
                }
                let _ = writeln!(
                    out,
                    "Installed version: {}",
                    stack
                        .installed_version
                        .as_deref()
                        .unwrap_or("(not installed)")
                );
                if let Some(port) = stack.port {
                    let _ = writeln!(out, "Port: {port}");
                }
                if stack.update_available {
                    let _ = writeln!(out, "An update is available.");
                }
                if !stack.services.is_empty() {
                    let _ = writeln!(out, "Services:");
                    for service in &stack.services {
                        let _ = writeln!(out, "{}", describe_service(service));
                    }
                }
                if let Some(detail) = &stack.detail {
                    let _ = writeln!(out, "Detail: {detail}");
                }
            }
            if let Some(state) = &input.state_file {
                section(&mut out, "runtime/state.json");
                match state {
                    Ok(text) => {
                        let _ = writeln!(out, "{}", text.trim_end());
                    }
                    Err(e) => {
                        let _ = writeln!(out, "(not available: {e})");
                    }
                }
            }
            if let Some(env) = &input.env_file {
                section(&mut out, "runtime/.env (secrets hidden)");
                match env {
                    Ok(text) => {
                        let _ = writeln!(out, "{}", env_without_secrets(text).trim_end());
                    }
                    Err(e) => {
                        let _ = writeln!(out, "(not available: {e})");
                    }
                }
            }
            if let Some(logs) = &input.logs {
                section(
                    &mut out,
                    &format!("Logs of ArboDat+ (last {LOG_LINES} lines per service)"),
                );
                match logs {
                    Ok(text) if text.trim().is_empty() => {
                        let _ = writeln!(out, "(no log lines)");
                    }
                    Ok(text) => {
                        let _ = writeln!(out, "{}", text.trim_end());
                    }
                    Err(e) => {
                        let _ = writeln!(out, "(not available: {e})");
                    }
                }
            }
        }
    }

    if let Some(log) = &input.app_log {
        section(&mut out, &format!("App log (last {APP_LOG_LINES} lines)"));
        let _ = writeln!(out, "{}", log.trim_end());
    }
    out
}

// ---------------------------------------------------------------------------------------------
// Collecting
// ---------------------------------------------------------------------------------------------

/// "macOS 26.6.2 (aarch64)", "Ubuntu 24.04 LTS (x86_64)", "windows (x86_64)".
#[cfg(target_os = "macos")]
async fn system_description() -> String {
    let version = tokio::process::Command::new("sw_vers")
        .arg("-productVersion")
        .output()
        .await
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());
    let arch = std::env::consts::ARCH;
    match version {
        Some(v) => format!("macOS {v} ({arch})"),
        None => format!("macOS ({arch})"),
    }
}

#[cfg(target_os = "linux")]
async fn system_description() -> String {
    let name = std::fs::read_to_string("/etc/os-release")
        .ok()
        .and_then(|text| {
            text.lines()
                .find_map(|l| l.strip_prefix("PRETTY_NAME="))
                .map(|v| v.trim_matches('"').to_string())
        });
    format!(
        "{} ({})",
        name.unwrap_or_else(|| "Linux".into()),
        std::env::consts::ARCH
    )
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
async fn system_description() -> String {
    format!("{} ({})", std::env::consts::OS, std::env::consts::ARCH)
}

/// The end of the newest `*.log` file in the app's log folder.
fn newest_app_log(dir: &Path) -> Option<String> {
    let newest = std::fs::read_dir(dir)
        .ok()?
        .filter_map(Result::ok)
        .filter(|e| e.path().extension().is_some_and(|x| x == "log"))
        .max_by_key(|e| e.metadata().and_then(|m| m.modified()).ok())?;
    let text = std::fs::read_to_string(newest.path()).ok()?;
    Some(last_lines(&text, APP_LOG_LINES))
}

pub async fn collect(
    app: &AppHandle,
    runtime: &RuntimeManager,
    store: &SettingsStore,
) -> Result<String, String> {
    let settings = store.view();
    let runtime_dir = runtime.runtime_dir();
    let state_file =
        |name: &str| std::fs::read_to_string(runtime_dir.join(name)).map_err(|e| e.to_string());

    let mut input = Input {
        created: utc_timestamp(
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0),
        ),
        app_version: app.package_info().version.to_string(),
        system: system_description().await,
        data_dir: runtime_dir
            .parent()
            .map(|p| p.display().to_string())
            .unwrap_or_default(),
        settings: settings.clone(),
        server: None,
        status: None,
        state_file: None,
        env_file: None,
        logs: None,
        app_log: app
            .path()
            .app_log_dir()
            .ok()
            .and_then(|dir| newest_app_log(&dir)),
    };

    let mut secrets: Vec<String> = Vec::new();
    match settings.mode {
        Mode::Server => {
            if let Some(url) = settings
                .server_url
                .as_deref()
                .and_then(|u| server::normalize_url(u).ok())
            {
                input.server = Some(server::status(&url).await);
            }
        }
        Mode::Local => {
            let status = runtime.status().await;
            let installed = status.stack.installed_version.is_some();
            input.state_file = Some(state_file(STATE_FILE));
            let env = state_file(ENV_FILE);
            if let Ok(text) = &env {
                secrets.extend(password_of(text));
            }
            input.env_file = Some(env);
            // Logs exist only for an installation, and only Docker can tell them.
            if installed {
                input.logs = Some(runtime.logs(LOG_LINES).await);
            }
            input.status = Some(status);
        }
    }

    let secrets: Vec<&str> = secrets.iter().map(String::as_str).collect();
    Ok(redact(&render(&input), &secrets))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::model::{ServiceHealth, ServiceState, StackPhase, StackStatus};

    #[test]
    fn timestamps_are_utc_and_right_around_leap_days() {
        assert_eq!(utc_timestamp(0), "1970-01-01 00:00:00 UTC");
        assert_eq!(utc_timestamp(951_782_400), "2000-02-29 00:00:00 UTC");
        assert_eq!(utc_timestamp(1_792_849_205), "2026-10-24 13:40:05 UTC");
        assert_eq!(utc_timestamp(4_107_542_399), "2100-02-28 23:59:59 UTC");
    }

    #[test]
    fn last_lines_keeps_the_end() {
        assert_eq!(last_lines("a\nb\nc\nd", 2), "c\nd");
        assert_eq!(last_lines("a\nb", 10), "a\nb");
        assert_eq!(last_lines("", 3), "");
    }

    #[test]
    fn the_env_file_loses_its_secrets_and_comments() {
        let env = "# comment mentions PASSWORD=not-a-value\nARBODAT_VERSION=5.0.0\n\nDATABASE_PASSWORD=hunter2hunter2\nARBODAT_PORT=8480\n";
        assert_eq!(
            env_without_secrets(env),
            "ARBODAT_VERSION=5.0.0\nDATABASE_PASSWORD=<hidden>\nARBODAT_PORT=8480"
        );
    }

    #[test]
    fn known_secrets_are_hidden_wherever_they_appear() {
        let text = "connecting as postgres/Zq8LmN2pXv5RtYw1 to db\nFATAL: password authentication failed (Zq8LmN2pXv5RtYw1)";
        let cleaned = redact(text, &["Zq8LmN2pXv5RtYw1"]);
        assert!(!cleaned.contains("Zq8LmN2pXv5RtYw1"), "{cleaned}");
        assert!(cleaned.contains("connecting as postgres/<hidden> to db"));
    }

    #[test]
    fn assigned_secrets_are_hidden_even_if_not_known() {
        for (input, expected) in [
            ("DATABASE_PASSWORD=abc123", "DATABASE_PASSWORD=<hidden>"),
            (
                "jdbc:postgresql://db/postgres?user=u&password=abc&ssl=true",
                "jdbc:postgresql://db/postgres?user=u&password=<hidden>&ssl=true",
            ),
            ("password: abc123 rest", "password: <hidden> rest"),
            (
                r#"{"token": "abc123", "x": 1}"#,
                r#"{"token": "<hidden>", "x": 1}"#,
            ),
            ("Secret = abc", "Secret = <hidden>"),
        ] {
            assert_eq!(redact(input, &[]), expected);
        }
        // Words without a value stay readable.
        for harmless in [
            "password authentication failed",
            "Waiting for the token",
            "the password is kept in .env",
            "password:",
        ] {
            assert_eq!(redact(harmless, &[]), harmless);
        }
    }

    #[test]
    fn short_or_empty_secrets_do_not_wreck_the_text() {
        assert_eq!(redact("a b c", &["", "a"]), "a b c");
    }

    #[test]
    fn the_password_is_found_in_the_env_file() {
        assert_eq!(
            password_of("A=1\nDATABASE_PASSWORD=xyz98765\n"),
            Some("xyz98765".into())
        );
        assert_eq!(password_of("DATABASE_PASSWORD=\n"), None);
        assert_eq!(password_of("A=1"), None);
    }

    fn settings(mode: Mode) -> SettingsView {
        SettingsView {
            mode,
            server_url: Some("https://arbodat.example.org/".into()),
            auto_start: true,
            backup_folder: "/Users/x/Documents/ArboDat+ Backups".into(),
            backup_folder_is_default: true,
        }
    }

    fn base_input(mode: Mode) -> Input {
        Input {
            created: "2026-10-24 13:40:05 UTC".into(),
            app_version: "5.0.0-dev".into(),
            system: "macOS 26.6.2 (aarch64)".into(),
            data_dir: "/Users/x/Library/Application Support/de.cau-kiel-ai.arbodat-plus".into(),
            settings: settings(mode),
            server: None,
            status: None,
            state_file: None,
            env_file: None,
            logs: None,
            app_log: None,
        }
    }

    #[test]
    fn a_local_report_has_every_part_and_no_password() {
        let mut input = base_input(Mode::Local);
        input.status = Some(Status {
            app_version: "5.0.0-dev".into(),
            docker: crate::runtime::model::DockerStatus {
                cli: CliStatus::Found {
                    path: "/usr/local/bin/docker".into(),
                    version: Some("28.3.0".into()),
                },
                compose: ComposeStatus::Found {
                    version: "2.38.1".into(),
                },
                engine: EngineStatus::Running {
                    version: "28.3.0".into(),
                    os: "Docker Desktop".into(),
                    id: "96c7".into(),
                },
            },
            stack: StackStatus {
                phase: StackPhase::Degraded,
                installed_version: Some("5.0.0-dev".into()),
                port: Some(8480),
                update_available: false,
                operation: None,
                services: vec![
                    ServiceStatus {
                        name: "database".into(),
                        state: ServiceState::Running,
                        health: Some(ServiceHealth::Healthy),
                        exit_code: None,
                    },
                    ServiceStatus {
                        name: "web-api".into(),
                        state: ServiceState::Exited,
                        health: None,
                        exit_code: Some(1),
                    },
                ],
                detail: None,
            },
        });
        input.state_file = Some(Ok("{\"port\": 8480}".into()));
        input.env_file = Some(Ok(
            "ARBODAT_PORT=8480\nDATABASE_PASSWORD=Zq8LmN2pXv5RtYw1\n".into(),
        ));
        input.logs = Some(Ok("web-api-1  | started\n".into()));
        input.app_log = Some("INFO started".into());
        let report = render(&input);
        for part in [
            "ArboDat+ diagnostics, created 2026-10-24 13:40:05 UTC",
            "== App",
            "Mode: ArboDat+ on this computer",
            "== Docker",
            "docker: /usr/local/bin/docker (28.3.0)",
            "compose: 2.38.1",
            "engine: running, 28.3.0, Docker Desktop, id 96c7",
            "== ArboDat+ on this computer",
            "State: degraded",
            "Port: 8480",
            "  database: running, healthy",
            "  web-api: exited, exited with code 1",
            "== runtime/state.json",
            "== runtime/.env (secrets hidden)",
            "DATABASE_PASSWORD=<hidden>",
            "== Logs of ArboDat+",
            "web-api-1  | started",
            "== App log",
        ] {
            assert!(report.contains(part), "missing {part:?} in\n{report}");
        }
        assert!(!report.contains("Zq8LmN2pXv5RtYw1"));
    }

    #[test]
    fn a_server_report_never_mentions_docker_state() {
        let mut input = base_input(Mode::Server);
        input.server = Some(ServerStatus {
            url: "https://arbodat.example.org/".into(),
            reachable: false,
            problem: Some("arbodat.example.org can't be reached.".into()),
            detail: Some("connection refused".into()),
        });
        let report = render(&input);
        assert!(report.contains("Mode: ArboDat+ on a server"));
        assert!(report.contains("Address: https://arbodat.example.org/"));
        assert!(report.contains("Answers: no"));
        assert!(report.contains("Problem: arbodat.example.org can't be reached."));
        assert!(report.contains("Not looked at: the app is using a server."));
        assert!(!report.contains("compose:"));
        assert!(!report.contains("runtime/.env"));
    }

    #[test]
    fn a_report_without_an_installation_says_so() {
        let mut input = base_input(Mode::Local);
        input.state_file = Some(Err("No such file or directory".into()));
        input.env_file = Some(Err("No such file or directory".into()));
        let report = render(&input);
        assert!(report.contains("(not available: No such file or directory)"));
    }
}
