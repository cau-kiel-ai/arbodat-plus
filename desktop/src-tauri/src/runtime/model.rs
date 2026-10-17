//! Data sent to the launcher UI. `cargo test` exports these as TypeScript types into
//! `desktop/src/lib/bindings/` (ts-rs), so frontend and backend can't drift apart.

use serde::Serialize;
use ts_rs::TS;

/// Everything the launcher needs to render, from one `get_status` call.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Status {
    pub app_version: String,
    pub docker: DockerStatus,
    pub stack: StackStatus,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct DockerStatus {
    pub cli: CliStatus,
    pub compose: ComposeStatus,
    pub engine: EngineStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(tag = "state", rename_all = "camelCase")]
#[ts(export)]
pub enum CliStatus {
    NotFound,
    /// Found, but a packaging we can't work with (e.g. the snap package can't read the
    /// app's data folder, where the compose file lives).
    Unsupported {
        path: String,
        reason: String,
    },
    Found {
        path: String,
        version: Option<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(tag = "state", rename_all = "camelCase")]
#[ts(export)]
pub enum ComposeStatus {
    /// Not checked (no docker CLI).
    Unknown,
    Missing {
        detail: String,
    },
    TooOld {
        version: String,
        minimum: String,
    },
    Found {
        version: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(tag = "state", rename_all = "camelCase")]
#[ts(export)]
pub enum EngineStatus {
    /// Not checked (no docker CLI).
    Unknown,
    /// Docker Desktop / the daemon isn't running (or is still starting).
    NotRunning {
        detail: String,
    },
    /// Linux: the user isn't allowed to use the docker socket (not in the `docker` group).
    PermissionDenied {
        detail: String,
    },
    Error {
        detail: String,
    },
    Running {
        version: String,
        os: String,
        id: String,
    },
}

impl EngineStatus {
    pub fn running_id(&self) -> Option<&str> {
        match self {
            EngineStatus::Running { id, .. } => Some(id),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct StackStatus {
    pub phase: StackPhase,
    pub installed_version: Option<String>,
    /// The installed stack is older than this app (the app would offer to update it).
    pub update_available: bool,
    /// One entry per expected service, in a fixed order; empty when not installed / unknown.
    pub services: Vec<ServiceStatus>,
    /// Why the phase is `unknown`, for the diagnostics view.
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum StackPhase {
    NotInstalled,
    /// Installed, but Docker isn't reachable, so the stack's state can't be known.
    EngineUnavailable,
    /// Installed against a different Docker engine than the current one (e.g. after a
    /// Docker Desktop reset or a context switch): the data volume isn't where it was.
    WrongEngine,
    /// Installed by a newer version of this app: only open/stop are safe.
    NewerThanApp,
    Stopped,
    Starting,
    Running,
    /// Some services up, some not (crashed, unhealthy, restarting, missing).
    Degraded,
    /// Couldn't be determined (corrupt state file, compose error); see `detail`.
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ServiceStatus {
    pub name: String,
    pub state: ServiceState,
    pub health: Option<ServiceHealth>,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ServiceState {
    /// No container exists for this service.
    Missing,
    Created,
    Running,
    Restarting,
    Paused,
    Exited,
    Dead,
    Removing,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ServiceHealth {
    Starting,
    Healthy,
    Unhealthy,
}
