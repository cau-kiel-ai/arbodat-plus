//! What the launcher shows when an operation can't complete: a stable `code` for the UI to act
//! on, a message a non-technical user can follow, and Docker's own words as `detail`.

use serde::Serialize;
use ts_rs::TS;

use super::model::Operation;
use super::parse::DockerErrorKind;
use super::ports::PortHolder;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ErrorCode {
    /// Another operation is still running.
    Busy,
    /// Docker (or Compose) isn't usable right now.
    DockerNotReady,
    AlreadyInstalled,
    NotInstalled,
    /// `state.json` exists but can't be read.
    StateDamaged,
    NewerThanApp,
    /// A different Docker engine than at install time.
    WrongEngine,
    /// A data volume exists but the matching `.env` doesn't (its password is unknown).
    ExistingData,
    /// Installed, but the data volume isn't in this Docker any more.
    VolumeMissing,
    PortInUse,
    /// The user's input can't be used (e.g. a port outside the allowed range).
    InvalidInput,
    /// A server (server mode) doesn't answer: no connection, a certificate problem, too slow.
    ServerUnreachable,
    /// A server answers, but not like an ArboDat+ server.
    NotArbodat,
    Offline,
    RegistryDenied,
    DiskFull,
    /// Any other failure of a Docker command.
    DockerFailed,
    /// The containers are up but the web interface doesn't answer.
    NotReady,
    Io,
}

#[derive(Debug, Clone, Serialize, TS, thiserror::Error)]
#[serde(rename_all = "camelCase")]
#[error("{message}")]
#[ts(export)]
pub struct AppError {
    pub code: ErrorCode,
    pub message: String,
    pub detail: Option<String>,
}

/// The last lines of a command's output, which is where the actual reason is.
pub fn tail_lines(text: &str, n: usize) -> String {
    let lines: Vec<&str> = text
        .lines()
        .map(str::trim_end)
        .filter(|l| !l.is_empty())
        .collect();
    lines[lines.len().saturating_sub(n)..].join("\n")
}

impl AppError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            detail: None,
        }
    }

    pub fn with_detail(mut self, detail: impl Into<String>) -> Self {
        let detail = detail.into();
        self.detail = (!detail.trim().is_empty()).then_some(detail);
        self
    }

    pub fn busy(running: Operation) -> Self {
        let what = match running {
            Operation::Install => "being installed",
            Operation::Start => "starting",
            Operation::Stop => "stopping",
            Operation::ChangePort => "changing its port",
            Operation::Remove => "being removed",
        };
        Self::new(
            ErrorCode::Busy,
            format!("ArboDat+ is {what} right now. Please wait until that has finished."),
        )
    }

    pub fn io(context: &str, e: &std::io::Error) -> Self {
        Self::new(ErrorCode::Io, format!("{context}.")).with_detail(e.to_string())
    }

    pub fn port_in_use(port: u16, holder: &PortHolder) -> Self {
        Self::new(
            ErrorCode::PortInUse,
            format!(
                "{} Stop it, or free the port, then try again.",
                holder.describe(port)
            ),
        )
    }

    /// A failed Docker command (`what` is e.g. "Starting ArboDat+"), judged by its stderr.
    pub fn docker(what: &str, kind: DockerErrorKind, stderr: &str) -> Self {
        let (code, message) = match kind {
            DockerErrorKind::EngineNotRunning => {
                (ErrorCode::DockerNotReady, "Docker stopped responding. Make sure Docker is running, then try again.".to_string())
            }
            DockerErrorKind::PermissionDenied => {
                (ErrorCode::DockerNotReady, "Your user account isn't allowed to use Docker.".to_string())
            }
            DockerErrorKind::ComposeMissing => (ErrorCode::DockerNotReady, "Docker Compose isn't available.".to_string()),
            DockerErrorKind::PortInUse => (
                ErrorCode::PortInUse,
                "The port ArboDat+ needs is already in use by another program or container. Free it, then try again.".to_string(),
            ),
            DockerErrorKind::VolumeMissing => (
                ErrorCode::VolumeMissing,
                "ArboDat+'s database volume doesn't exist in this Docker. ArboDat+ will not create a new, empty one on its own.".to_string(),
            ),
            DockerErrorKind::DiskFull => (
                ErrorCode::DiskFull,
                "Docker has run out of disk space. Free some space (in Docker Desktop: Settings > Resources) and try again.".to_string(),
            ),
            DockerErrorKind::Offline => (
                ErrorCode::Offline,
                "ArboDat+ couldn't be downloaded: no connection to the internet. Check your connection and try again (the first installation downloads about 400 MB)."
                    .to_string(),
            ),
            DockerErrorKind::RegistryUnauthorized => (
                ErrorCode::RegistryDenied,
                "ArboDat+ couldn't be downloaded: access was denied. This version may not have been published yet.".to_string(),
            ),
            DockerErrorKind::CredentialHelper | DockerErrorKind::Other => (ErrorCode::DockerFailed, format!("{what} failed.")),
        };
        Self::new(code, message).with_detail(tail_lines(stderr, 12))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::parse::classify;

    #[test]
    fn tail_keeps_the_last_lines_only() {
        assert_eq!(tail_lines("a\nb\n\nc\nd\n", 2), "c\nd");
        assert_eq!(tail_lines("only", 12), "only");
        assert_eq!(tail_lines("", 3), "");
    }

    #[test]
    fn real_failures_map_to_actionable_codes() {
        let cases = [
            (
                "Bind for 127.0.0.1:8480 failed: port is already allocated",
                ErrorCode::PortInUse,
            ),
            (
                r#"external volume "arbodat-plus-database" not found"#,
                ErrorCode::VolumeMissing,
            ),
            (
                "write /var/lib/docker/tmp/x: no space left on device",
                ErrorCode::DiskFull,
            ),
            (
                r#"Get "https://ghcr.io/v2/": dial tcp: lookup ghcr.io: no such host"#,
                ErrorCode::Offline,
            ),
            (
                r#"Head "https://ghcr.io/v2/x/manifests/5.0.0": denied: denied"#,
                ErrorCode::RegistryDenied,
            ),
            (
                "Cannot connect to the Docker daemon at unix:///x.sock. Is the docker daemon running?",
                ErrorCode::DockerNotReady,
            ),
            (
                "service \"web-api\" didn't complete successfully: exit 1",
                ErrorCode::DockerFailed,
            ),
        ];
        for (stderr, code) in cases {
            let e = AppError::docker("Starting ArboDat+", classify(stderr), stderr);
            assert_eq!(e.code, code, "{stderr}");
            assert!(!e.message.is_empty());
            assert_eq!(
                e.detail.as_deref(),
                Some(stderr),
                "Docker's own words are kept as detail"
            );
        }
    }

    #[test]
    fn unknown_failures_name_what_was_being_done() {
        let e = AppError::docker("Starting ArboDat+", DockerErrorKind::Other, "boom");
        assert_eq!(e.message, "Starting ArboDat+ failed.");
    }

    #[test]
    fn empty_detail_is_none() {
        assert_eq!(
            AppError::new(ErrorCode::Io, "x").with_detail("  \n").detail,
            None
        );
    }

    #[test]
    fn port_and_busy_messages_name_the_holder_and_the_operation() {
        let holder = PortHolder::Container {
            name: "web".into(),
            project: Some("p".into()),
        };
        let e = AppError::port_in_use(8480, &holder);
        assert_eq!(e.code, ErrorCode::PortInUse);
        assert!(
            e.message.contains("\"web\"") && e.message.contains("8480"),
            "{}",
            e.message
        );
        assert!(
            AppError::busy(Operation::Install)
                .message
                .contains("installed")
        );
    }
}
