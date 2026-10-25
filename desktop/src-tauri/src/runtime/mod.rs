//! The local runtime: finding Docker, and knowing the state of the ArboDat+ stack.
//! Independent of Tauri (only paths go in), so it can be exercised from tests and
//! `examples/status.rs` against a real Docker without the GUI.

pub mod compose;
pub mod discovery;
pub mod docker;
pub mod error;
pub mod fsutil;
pub mod lifecycle;
pub mod model;
pub mod parse;
pub mod ports;
pub mod probe;
pub mod state;
pub mod status;
pub mod template;

use std::path::{Path, PathBuf};
use std::time::Duration;

use semver::Version;
use tokio::sync::Mutex;

use discovery::Discovery;
use docker::DockerCli;
use model::{CliStatus, ComposeStatus, DockerStatus, EngineStatus, Operation, Status};
use parse::DockerErrorKind;

/// NDJSON `compose ps` output and `up --wait` need at least this.
pub const MIN_COMPOSE: Version = Version::new(2, 21, 0);

const VERSION_TIMEOUT: Duration = Duration::from_secs(5);
const COMPOSE_VERSION_TIMEOUT: Duration = Duration::from_secs(10);
/// Docker Desktop can take a while to answer while it's starting.
const INFO_TIMEOUT: Duration = Duration::from_secs(15);

pub struct RuntimeManager {
    app_version: Version,
    /// compose.yml, .env and state.json of the local installation.
    runtime_dir: PathBuf,
    /// The app-owned DOCKER_CONFIG (see docker.rs).
    docker_config_dir: PathBuf,
    /// Discovered docker CLI with its resolved endpoint; rediscovered when it disappears or the
    /// engine becomes unreachable (the user may have installed Docker or switched context).
    docker: Mutex<Option<DockerCli>>,
    /// The operation running right now (install/start/stop); see `lifecycle`.
    op: std::sync::Mutex<Option<Operation>>,
}

impl RuntimeManager {
    pub fn new(app_version: &str, data_dir: &Path) -> Result<Self, semver::Error> {
        Ok(Self {
            app_version: Version::parse(app_version)?,
            runtime_dir: data_dir.join("runtime"),
            docker_config_dir: data_dir.join("docker-config"),
            docker: Mutex::new(None),
            op: std::sync::Mutex::new(None),
        })
    }

    pub fn runtime_dir(&self) -> &Path {
        &self.runtime_dir
    }

    pub async fn status(&self) -> Status {
        let state = state::load(&self.runtime_dir).map_err(|e| e.to_string());
        let app_version = self.app_version.to_string();
        let busy = self.current_operation();

        let cli = match self.docker_cli().await {
            Ok(cli) => cli,
            Err(cli_status) => {
                let engine = EngineStatus::Unknown;
                let stack =
                    status::stack_status(&state, &engine, None, &self.app_version, None, busy);
                let docker = DockerStatus {
                    cli: cli_status,
                    compose: ComposeStatus::Unknown,
                    engine,
                };
                return Status {
                    app_version,
                    docker,
                    stack,
                };
            }
        };

        let (version, compose, engine) =
            tokio::join!(cli_version(&cli), compose_status(&cli), engine_status(&cli));
        if !matches!(engine, EngineStatus::Running { .. }) {
            // Re-resolve the endpoint next time: Docker may come up under another context.
            *self.docker.lock().await = None;
        }

        let installed = matches!(state, Ok(Some(_)));
        let containers = match (&engine, &compose) {
            // While we are changing the stack, its containers are a moving target: don't ask.
            _ if !installed || busy.is_some() => None,
            (EngineStatus::Running { .. }, ComposeStatus::Found { .. }) => {
                Some(compose::ps(&cli, &self.runtime_dir).await)
            }
            (EngineStatus::Running { .. }, _) => Some(Err(format!(
                "Docker Compose {MIN_COMPOSE} or newer is needed to check the stack"
            ))),
            _ => None,
        };
        // An installed stack needs its database volume; ask once per refresh (cheap).
        let volume_exists =
            if installed && busy.is_none() && matches!(engine, EngineStatus::Running { .. }) {
                cli.volume_exists(template::DATA_VOLUME).await.ok()
            } else {
                None
            };
        let stack = status::stack_status(
            &state,
            &engine,
            containers.as_ref(),
            &self.app_version,
            volume_exists,
            busy,
        );
        let docker = DockerStatus {
            cli: CliStatus::Found {
                path: cli.bin.display().to_string(),
                version,
            },
            compose,
            engine,
        };
        Status {
            app_version,
            docker,
            stack,
        }
    }

    /// The recent log lines of the installed stack, or why they can't be had. Read-only.
    pub async fn logs(&self, tail: u32) -> Result<String, String> {
        let cli = self
            .docker_cli()
            .await
            .map_err(|_| "Docker isn't available".to_string())?;
        compose::logs(&cli, &self.runtime_dir, tail).await
    }

    async fn docker_cli(&self) -> Result<DockerCli, CliStatus> {
        let mut cached = self.docker.lock().await;
        // The binary and the app-owned settings must both still exist: a user who deletes the
        // app's data folder while it runs would otherwise leave `docker compose` without plugins.
        if let Some(cli) = cached.as_ref().filter(|cli| cli.is_usable()) {
            return Ok(cli.clone());
        }
        *cached = None;
        let inherited_path = std::env::var_os("PATH");
        match discovery::discover(
            inherited_path.as_deref(),
            &docker::home_dir(),
            Path::is_file,
        ) {
            Discovery::NotFound => Err(CliStatus::NotFound),
            Discovery::Unsupported { path, reason } => Err(CliStatus::Unsupported {
                path: path.display().to_string(),
                reason,
            }),
            Discovery::Found(binary) => {
                let path = binary.path.display().to_string();
                let cli = DockerCli::prepare(binary, &self.docker_config_dir)
                    .await
                    .map_err(|e| CliStatus::Unsupported {
                        path,
                        reason: format!("could not write the app's Docker settings: {e}"),
                    })?;
                log::info!("docker: {} (endpoint {:?})", cli.bin.display(), cli.host);
                *cached = Some(cli.clone());
                Ok(cli)
            }
        }
    }
}

async fn cli_version(cli: &DockerCli) -> Option<String> {
    // Not `docker version`: that also contacts the engine (and crashes when the host is invalid).
    let out = cli.run(["--version"], VERSION_TIMEOUT).await.ok()?;
    out.success()
        .then(|| parse::docker_cli_version(&out.stdout))
        .flatten()
}

async fn compose_status(cli: &DockerCli) -> ComposeStatus {
    let out = match cli
        .run(["compose", "version", "--short"], COMPOSE_VERSION_TIMEOUT)
        .await
    {
        Ok(out) => out,
        Err(e) => {
            return ComposeStatus::Missing {
                detail: e.to_string(),
            };
        }
    };
    if !out.success() {
        return ComposeStatus::Missing { detail: out.stderr };
    }
    let version = out.stdout.trim().to_string();
    match parse::parse_version(&version) {
        Some(v) if v >= MIN_COMPOSE => ComposeStatus::Found { version },
        Some(_) => ComposeStatus::TooOld {
            version,
            minimum: MIN_COMPOSE.to_string(),
        },
        None => ComposeStatus::Missing {
            detail: format!("unrecognised `docker compose version` output: {version}"),
        },
    }
}

async fn engine_status(cli: &DockerCli) -> EngineStatus {
    let out = match cli
        .run(["info", "--format", "{{json .}}"], INFO_TIMEOUT)
        .await
    {
        Ok(out) => out,
        Err(docker::RunError::Timeout { .. }) => {
            return EngineStatus::NotRunning {
                detail: format!("Docker did not answer within {} s", INFO_TIMEOUT.as_secs()),
            };
        }
        Err(e) => {
            return EngineStatus::Error {
                detail: e.to_string(),
            };
        }
    };
    // Success must be judged by the exit code: with the engine down, docker still prints `""`.
    if out.success() {
        return match parse::parse_engine_info(&out.stdout) {
            Ok(info) => EngineStatus::Running {
                version: info.server_version,
                os: info.operating_system,
                id: info.id,
            },
            Err(detail) => EngineStatus::Error { detail },
        };
    }
    match parse::classify(&out.stderr) {
        DockerErrorKind::EngineNotRunning => EngineStatus::NotRunning { detail: out.stderr },
        DockerErrorKind::PermissionDenied => EngineStatus::PermissionDenied { detail: out.stderr },
        _ => EngineStatus::Error { detail: out.stderr },
    }
}
