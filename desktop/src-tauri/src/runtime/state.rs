//! `runtime/state.json`: written when the app installs the stack (Phase 5). Its presence is
//! what "installed" means; a compose file alone isn't enough.

use std::path::Path;

use serde::{Deserialize, Serialize};

pub const STATE_FILE: &str = "state.json";
pub const SCHEMA: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallState {
    pub schema: u32,
    /// The stack version (= the app version that installed or last updated it).
    pub installed_version: String,
    pub port: u16,
    /// Docker endpoint at install time, for diagnostics.
    pub docker_host: Option<String>,
    /// `docker info` ID at install time. If the current engine differs, the data volume isn't
    /// where we left it (Docker Desktop reset, other context) and we must not "reinstall".
    pub engine_id: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum StateError {
    #[error("could not read {path}: {source}")]
    Read {
        path: String,
        source: std::io::Error,
    },
    #[error("{path} is damaged: {source}")]
    Corrupt {
        path: String,
        source: serde_json::Error,
    },
}

/// `Ok(None)` if not installed. A damaged file is an error, never "not installed": treating it
/// as not installed could lead to installing over an existing installation.
pub fn load(runtime_dir: &Path) -> Result<Option<InstallState>, StateError> {
    let path = runtime_dir.join(STATE_FILE);
    let text = match std::fs::read_to_string(&path) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(source) => {
            return Err(StateError::Read {
                path: path.display().to_string(),
                source,
            });
        }
    };
    serde_json::from_str(&text)
        .map(Some)
        .map_err(|source| StateError::Corrupt {
            path: path.display().to_string(),
            source,
        })
}

/// Writes `state.json` atomically (it either keeps the old content or has the complete new one).
pub fn save(runtime_dir: &Path, state: &InstallState) -> std::io::Result<()> {
    let json = serde_json::to_string_pretty(state).map_err(std::io::Error::other)? + "\n";
    super::fsutil::write_atomic(&runtime_dir.join(STATE_FILE), json.as_bytes(), false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_file_means_not_installed() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(load(dir.path()).unwrap(), None);
    }

    #[test]
    fn reads_state() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join(STATE_FILE),
            r#"{"schema":1,"installedVersion":"5.0.0","port":8480,"dockerHost":null,"engineId":"abc"}"#,
        )
        .unwrap();
        let state = load(dir.path()).unwrap().unwrap();
        assert_eq!(state.installed_version, "5.0.0");
        assert_eq!(state.engine_id.as_deref(), Some("abc"));
    }

    #[test]
    fn damaged_file_is_an_error_not_not_installed() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(STATE_FILE), "{ truncated").unwrap();
        assert!(matches!(load(dir.path()), Err(StateError::Corrupt { .. })));
    }

    #[test]
    fn save_then_load_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let record = InstallState {
            schema: SCHEMA,
            installed_version: "5.0.0".into(),
            port: 8480,
            docker_host: Some("unix:///x.sock".into()),
            engine_id: Some("abc".into()),
        };
        save(dir.path(), &record).unwrap();
        assert_eq!(load(dir.path()).unwrap(), Some(record));
    }
}
