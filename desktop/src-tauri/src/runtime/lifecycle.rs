//! Installing, starting and stopping the local stack.
//!
//! The decisions ("may we install? start? with which password?") are pure functions of the facts
//! on disk and in Docker, so every combination, in particular every refusal that protects the
//! user's data, is unit-tested. The `RuntimeManager` methods only gather facts, call those
//! functions and then perform the steps.
//!
//! Data-safety rules enforced here:
//! - the database password is generated once and an existing `.env` is never overwritten with a
//!   new one (PostgreSQL only applies the password when the volume is first created);
//! - an existing data volume without its `.env` is never "adopted": its password is unknown;
//! - if the data volume is gone (e.g. Docker Desktop was reset) we refuse to start rather than
//!   silently create a new, empty database;
//! - only `pull`, `up -d --wait` and `stop` are ever run: never `down`, never `-v`.

use std::time::Duration;

use semver::Version;

use super::docker::{DockerCli, RunError};
use super::error::{AppError, ErrorCode};
use super::model::{CliStatus, ComposeStatus, EngineStatus, Operation, ProgressEvent};
use super::parse;
use super::ports::{self, PortCheck};
use super::state::{self, InstallState};
use super::template::{
    COMPOSE_FILE, COMPOSE_YML, DATA_VOLUME, DEFAULT_PORT, ENV_FILE, PASSWORD_LEN, PROJECT,
    parse_env, render_env,
};
use super::{RuntimeManager, compose, compose_status, engine_status, fsutil, probe};

/// Where progress goes (the launcher window, or a test's `Vec`).
pub type Emit<'a> = &'a (dyn Fn(ProgressEvent) + Send + Sync);

/// How long to wait for the web interface to answer once the containers report healthy.
const READY_DEADLINE: Duration = Duration::from_secs(90);
const VOLUME_LABEL: &str = "org.arbodat-plus.volume=database";

// ---------------------------------------------------------------------------------------------
// Decisions (pure)
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InstallPlan {
    /// Nothing exists yet: make a new password.
    Fresh,
    /// An earlier install was interrupted after writing `.env`: keep its password.
    Resume,
}

/// May we install, and how? `state` is `state.json` as loaded.
pub fn plan_install(
    state: &Result<Option<InstallState>, String>,
    env_exists: bool,
    volume_exists: bool,
) -> Result<InstallPlan, AppError> {
    match state {
        Err(e) => Err(AppError::new(
            ErrorCode::StateDamaged,
            "The installation record is damaged, so ArboDat+ will not install over it. Your data is untouched.",
        )
        .with_detail(e.clone())),
        Ok(Some(_)) => Err(AppError::new(ErrorCode::AlreadyInstalled, "ArboDat+ is already installed on this computer.")),
        Ok(None) => match (env_exists, volume_exists) {
            (false, true) => Err(AppError::new(
                ErrorCode::ExistingData,
                "A database from an earlier ArboDat+ installation was found in Docker, but its password is not available. \
                 To protect that data, ArboDat+ will not install over it. Your data is untouched.",
            )),
            (false, false) => Ok(InstallPlan::Fresh),
            (true, _) => Ok(InstallPlan::Resume),
        },
    }
}

/// May we start the installed stack? Returns the installation record to use.
pub fn plan_start(
    state: &Result<Option<InstallState>, String>,
    engine: &EngineStatus,
    app_version: &Version,
    volume_exists: bool,
) -> Result<InstallState, AppError> {
    let state = match state {
        Err(e) => {
            return Err(AppError::new(
                ErrorCode::StateDamaged,
                "The installation record is damaged. Your data is untouched.",
            )
            .with_detail(e.clone()));
        }
        Ok(None) => {
            return Err(AppError::new(
                ErrorCode::NotInstalled,
                "ArboDat+ is not installed yet.",
            ));
        }
        Ok(Some(state)) => state,
    };
    match Version::parse(&state.installed_version) {
        Ok(installed) if installed > *app_version => {
            return Err(AppError::new(
                ErrorCode::NewerThanApp,
                format!(
                    "This installation was last updated by a newer version of ArboDat+ ({installed}) than this app ({app_version}). \
                     Please install the newest app."
                ),
            ));
        }
        Ok(_) => {}
        Err(_) => {
            return Err(AppError::new(
                ErrorCode::StateDamaged,
                format!(
                    "The installation record has an invalid version: {:?}.",
                    state.installed_version
                ),
            ));
        }
    }
    if let (Some(then), Some(now)) = (state.engine_id.as_deref(), engine.running_id())
        && then != now
    {
        return Err(AppError::new(
            ErrorCode::WrongEngine,
            "ArboDat+ was installed with a different Docker installation (for example before Docker Desktop was reset, or in another Docker context). \
             Its data is not available in the current one.",
        ));
    }
    if !volume_exists {
        return Err(AppError::new(
            ErrorCode::VolumeMissing,
            "ArboDat+'s database volume doesn't exist in this Docker. ArboDat+ will not create a new, empty one on its own, \
             because that would look like data loss.",
        ));
    }
    Ok(state.clone())
}

/// A failed or timed-out Docker command, as the user should see it.
pub fn run_failure(what: &str, e: RunError) -> AppError {
    match e {
        RunError::Timeout { secs, .. } => AppError::new(
            ErrorCode::DockerFailed,
            format!(
                "{what} took longer than {} minutes and was stopped.",
                secs.div_ceil(60)
            ),
        ),
        RunError::Spawn { .. } => {
            AppError::new(ErrorCode::DockerNotReady, "Docker couldn't be started.")
                .with_detail(e.to_string())
        }
    }
}

/// A non-zero exit of a Docker command, judged by what it printed.
fn command_failure(what: &str, stderr: &str) -> AppError {
    AppError::docker(what, parse::classify(stderr), stderr)
}

fn cli_problem(status: CliStatus) -> AppError {
    match status {
        CliStatus::NotFound => AppError::new(ErrorCode::DockerNotReady, "Docker isn't installed."),
        CliStatus::Unsupported { reason, .. } => AppError::new(ErrorCode::DockerNotReady, reason),
        CliStatus::Found { .. } => AppError::new(ErrorCode::DockerNotReady, "Docker isn't ready."),
    }
}

// ---------------------------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------------------------

struct Steps<'a> {
    emit: Emit<'a>,
    total: u32,
    index: u32,
}

impl<'a> Steps<'a> {
    fn new(emit: Emit<'a>, total: u32) -> Self {
        Self {
            emit,
            total,
            index: 0,
        }
    }
    fn next(&mut self, label: &str) {
        self.index += 1;
        log::info!("step {}/{}: {label}", self.index, self.total);
        (self.emit)(ProgressEvent::Step {
            index: self.index,
            total: self.total,
            label: label.to_string(),
        });
    }
    fn log(&self, text: impl Into<String>) {
        (self.emit)(ProgressEvent::Log { text: text.into() });
    }
}

// ---------------------------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------------------------

/// Marks an operation as running; clears it again when dropped (also on error and panic).
pub struct OperationGuard<'a> {
    slot: &'a std::sync::Mutex<Option<Operation>>,
}

impl Drop for OperationGuard<'_> {
    fn drop(&mut self) {
        *self
            .slot
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = None;
    }
}

impl RuntimeManager {
    /// The operation in progress, if any.
    pub fn current_operation(&self) -> Option<Operation> {
        *self
            .op
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn begin(&self, operation: Operation) -> Result<OperationGuard<'_>, AppError> {
        let mut slot = self
            .op
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(running) = *slot {
            return Err(AppError::busy(running));
        }
        *slot = Some(operation);
        Ok(OperationGuard { slot: &self.op })
    }

    /// A working docker CLI with a reachable engine and a recent enough Compose, or the reason why not.
    async fn ready_docker(&self) -> Result<(DockerCli, EngineStatus), AppError> {
        let cli = self.docker_cli().await.map_err(cli_problem)?;
        let (compose, engine) = tokio::join!(compose_status(&cli), engine_status(&cli));
        match compose {
            ComposeStatus::Found { .. } => {}
            ComposeStatus::TooOld { version, minimum } => {
                return Err(AppError::new(
                    ErrorCode::DockerNotReady,
                    format!(
                        "Docker Compose {version} is too old; ArboDat+ needs {minimum} or newer."
                    ),
                ));
            }
            ComposeStatus::Missing { detail } => {
                return Err(AppError::new(
                    ErrorCode::DockerNotReady,
                    "Docker Compose isn't available.",
                )
                .with_detail(detail));
            }
            ComposeStatus::Unknown => {
                return Err(AppError::new(
                    ErrorCode::DockerNotReady,
                    "Docker Compose couldn't be checked.",
                ));
            }
        }
        match engine {
            EngineStatus::Running { .. } => Ok((cli, engine)),
            EngineStatus::NotRunning { detail } => Err(AppError::new(
                ErrorCode::DockerNotReady,
                "Docker is not running. Start Docker, wait until it is ready, then try again.",
            )
            .with_detail(detail)),
            EngineStatus::PermissionDenied { detail } => Err(AppError::new(
                ErrorCode::DockerNotReady,
                "Your user account isn't allowed to use Docker.",
            )
            .with_detail(detail)),
            EngineStatus::Error { detail } => Err(AppError::new(
                ErrorCode::DockerNotReady,
                "Docker reported an error.",
            )
            .with_detail(detail)),
            EngineStatus::Unknown => Err(AppError::new(
                ErrorCode::DockerNotReady,
                "Docker couldn't be checked.",
            )),
        }
    }

    pub async fn install(&self, emit: Emit<'_>) -> Result<(), AppError> {
        let _guard = self.begin(Operation::Install)?;
        let mut steps = Steps::new(emit, 9);
        let dir = self.runtime_dir.as_path();

        steps.next("Checking Docker");
        let (cli, engine) = self.ready_docker().await?;

        steps.next("Checking for an existing installation");
        let loaded = state::load(dir).map_err(|e| e.to_string());
        let env_path = dir.join(ENV_FILE);
        let volume_exists = cli
            .volume_exists(DATA_VOLUME)
            .await
            .map_err(|e| command_failure("Checking the database volume", &e))?;
        let plan = plan_install(&loaded, env_path.exists(), volume_exists)?;

        steps.next("Checking the port");
        let port = DEFAULT_PORT;
        self.require_port_free(&cli, port, None).await?;

        steps.next("Preparing the files");
        std::fs::create_dir_all(dir)
            .map_err(|e| AppError::io("Couldn't create ArboDat+'s data folder", &e))?;
        let version = self.app_version.to_string();
        let password = match plan {
            InstallPlan::Fresh => fsutil::random_password(PASSWORD_LEN)
                .map_err(|e| AppError::io("Couldn't generate a password", &e))?,
            InstallPlan::Resume => {
                steps.log("Resuming an interrupted installation (keeping its database password).");
                let text = std::fs::read_to_string(&env_path)
                    .map_err(|e| AppError::io("Couldn't read the existing .env file", &e))?;
                parse_env(&text)
                    .remove("DATABASE_PASSWORD")
                    .filter(|p| !p.is_empty())
                    .ok_or_else(|| {
                        AppError::new(ErrorCode::StateDamaged, "The .env file of an interrupted installation has no database password.")
                    })?
            }
        };
        fsutil::write_atomic(&dir.join(COMPOSE_FILE), COMPOSE_YML.as_bytes(), false)
            .map_err(|e| AppError::io("Couldn't write the stack definition", &e))?;
        let env = render_env(&version, &password, port);
        match plan {
            InstallPlan::Fresh => fsutil::create_new_private(&env_path, env.as_bytes()),
            InstallPlan::Resume => fsutil::write_atomic(&env_path, env.as_bytes(), true),
        }
        .map_err(|e| AppError::io("Couldn't write the settings file", &e))?;

        steps.next("Creating the database volume");
        cli.volume_create(DATA_VOLUME, VOLUME_LABEL)
            .await
            .map_err(|e| command_failure("Creating the database volume", &e))?;

        steps.next("Saving the installation");
        let record = InstallState {
            schema: state::SCHEMA,
            installed_version: version,
            port,
            docker_host: cli.host.clone(),
            engine_id: engine.running_id().map(str::to_string),
        };
        state::save(dir, &record)
            .map_err(|e| AppError::io("Couldn't save the installation record", &e))?;

        steps.next("Downloading ArboDat+");
        self.pull_missing_images(&cli, emit).await?;

        steps.next("Starting ArboDat+");
        self.bring_up(&cli, port, emit).await?;

        steps.next("Waiting for ArboDat+ to answer");
        wait_until_ready(port, emit).await
    }

    pub async fn start(&self, emit: Emit<'_>) -> Result<(), AppError> {
        let _guard = self.begin(Operation::Start)?;
        let mut steps = Steps::new(emit, 6);
        let dir = self.runtime_dir.as_path();

        steps.next("Checking Docker");
        let (cli, engine) = self.ready_docker().await?;

        steps.next("Checking the installation");
        let loaded = state::load(dir).map_err(|e| e.to_string());
        let volume_exists = cli
            .volume_exists(DATA_VOLUME)
            .await
            .map_err(|e| command_failure("Checking the database volume", &e))?;
        let record = plan_start(&loaded, &engine, &self.app_version, volume_exists)?;

        steps.next("Checking the port");
        self.require_port_free(&cli, record.port, Some(PROJECT))
            .await?;

        steps.next("Downloading missing parts");
        self.pull_missing_images(&cli, emit).await?;

        steps.next("Starting ArboDat+");
        self.bring_up(&cli, record.port, emit).await?;

        steps.next("Waiting for ArboDat+ to answer");
        wait_until_ready(record.port, emit).await
    }

    pub async fn stop(&self, emit: Emit<'_>) -> Result<(), AppError> {
        let _guard = self.begin(Operation::Stop)?;
        let mut steps = Steps::new(emit, 2);
        let dir = self.runtime_dir.as_path();

        steps.next("Checking Docker");
        let (cli, _engine) = self.ready_docker().await?;
        match state::load(dir).map_err(|e| e.to_string()) {
            Ok(Some(_)) => {}
            Ok(None) => {
                return Err(AppError::new(
                    ErrorCode::NotInstalled,
                    "ArboDat+ is not installed yet.",
                ));
            }
            Err(e) => {
                return Err(AppError::new(
                    ErrorCode::StateDamaged,
                    "The installation record is damaged.",
                )
                .with_detail(e));
            }
        }

        steps.next("Stopping ArboDat+");
        let out = compose::stop(&cli, dir, |line| {
            emit(ProgressEvent::Log {
                text: line.to_string(),
            })
        })
        .await
        .map_err(|e| run_failure("Stopping ArboDat+", e))?;
        if out.success() {
            Ok(())
        } else {
            Err(command_failure("Stopping ArboDat+", &out.stderr))
        }
    }

    async fn require_port_free(
        &self,
        cli: &DockerCli,
        port: u16,
        ignore_project: Option<&str>,
    ) -> Result<(), AppError> {
        match ports::check(cli, port, ignore_project)
            .await
            .map_err(|e| command_failure("Checking the port", &e))?
        {
            PortCheck::Free => Ok(()),
            PortCheck::InUse(holder) => Err(AppError::port_in_use(port, &holder)),
        }
    }

    /// Downloads only what isn't on this computer yet. Images that are already present are not
    /// fetched again (so a development build with locally built images never touches the registry).
    async fn pull_missing_images(&self, cli: &DockerCli, emit: Emit<'_>) -> Result<(), AppError> {
        let dir = self.runtime_dir.as_path();
        let images = compose::config_images(cli, dir)
            .await
            .map_err(|e| command_failure("Checking which images are needed", &e))?;
        let mut missing = Vec::new();
        for image in &images {
            if !cli
                .image_exists(image)
                .await
                .map_err(|e| command_failure("Checking the images", &e))?
            {
                missing.push(image.as_str());
            }
        }
        if missing.is_empty() {
            emit(ProgressEvent::Log {
                text: "Everything needed is already on this computer.".into(),
            });
            return Ok(());
        }
        // One image at a time, and only the missing ones: `compose pull` would fetch everything.
        for image in missing {
            emit(ProgressEvent::Log {
                text: format!("Downloading {image}"),
            });
            let out = cli
                .pull_image(dir, image, |line| {
                    emit(ProgressEvent::Log {
                        text: line.to_string(),
                    })
                })
                .await
                .map_err(|e| run_failure("Downloading ArboDat+", e))?;
            if !out.success() {
                return Err(command_failure("Downloading ArboDat+", &out.stderr));
            }
        }
        Ok(())
    }

    /// `up -d --wait`. If it fails on the port, look again who holds it so the message can name them.
    async fn bring_up(&self, cli: &DockerCli, port: u16, emit: Emit<'_>) -> Result<(), AppError> {
        let dir = self.runtime_dir.as_path();
        let out = compose::up(cli, dir, |line| {
            emit(ProgressEvent::Log {
                text: line.to_string(),
            })
        })
        .await
        .map_err(|e| run_failure("Starting ArboDat+", e))?;
        if out.success() {
            return Ok(());
        }
        let failure = command_failure("Starting ArboDat+", &out.stderr);
        if failure.code == ErrorCode::PortInUse
            && let Ok(PortCheck::InUse(holder)) = ports::check(cli, port, Some(PROJECT)).await
        {
            return Err(AppError::port_in_use(port, &holder)
                .with_detail(failure.detail.unwrap_or_default()));
        }
        Err(failure)
    }
}

async fn wait_until_ready(port: u16, emit: Emit<'_>) -> Result<(), AppError> {
    probe::wait_ready(port, READY_DEADLINE, |why| {
        emit(ProgressEvent::Log { text: format!("Waiting for ArboDat+ to answer ({why})") });
    })
    .await
    .map_err(|e| {
        AppError::new(
            ErrorCode::NotReady,
            "ArboDat+ started, but its web interface doesn't answer yet. Check again in a moment, or look at the diagnostics.",
        )
        .with_detail(e)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    fn record(version: &str, engine: Option<&str>) -> InstallState {
        InstallState {
            schema: 1,
            installed_version: version.into(),
            port: 8480,
            docker_host: None,
            engine_id: engine.map(Into::into),
        }
    }
    fn running(id: &str) -> EngineStatus {
        EngineStatus::Running {
            version: "28".into(),
            os: "Docker Desktop".into(),
            id: id.into(),
        }
    }
    const V5: Version = Version::new(5, 0, 0);
    fn code(r: Result<impl std::fmt::Debug, AppError>) -> ErrorCode {
        r.unwrap_err().code
    }

    // --- plan_install: every combination ---------------------------------------------------

    #[test]
    fn install_on_a_clean_machine_is_fresh() {
        assert_eq!(
            plan_install(&Ok(None), false, false).unwrap(),
            InstallPlan::Fresh
        );
    }

    #[test]
    fn leftover_env_means_resume_and_keeps_the_password() {
        assert_eq!(
            plan_install(&Ok(None), true, false).unwrap(),
            InstallPlan::Resume
        );
        assert_eq!(
            plan_install(&Ok(None), true, true).unwrap(),
            InstallPlan::Resume
        );
    }

    #[test]
    fn a_volume_without_its_env_is_never_adopted() {
        // This is the case that would lock the user out of (or overwrite) their own data.
        assert_eq!(
            code(plan_install(&Ok(None), false, true)),
            ErrorCode::ExistingData
        );
    }

    #[test]
    fn install_refuses_when_installed_or_when_the_record_is_damaged() {
        let installed = Ok(Some(record("5.0.0", None)));
        for (env, volume) in [(false, false), (true, true), (true, false), (false, true)] {
            assert_eq!(
                code(plan_install(&installed, env, volume)),
                ErrorCode::AlreadyInstalled
            );
            assert_eq!(
                code(plan_install(&Err("truncated".into()), env, volume)),
                ErrorCode::StateDamaged
            );
        }
    }

    // --- plan_start ----------------------------------------------------------------------------

    #[test]
    fn start_returns_the_record_when_everything_is_in_order() {
        let r = plan_start(
            &Ok(Some(record("5.0.0", Some("e1")))),
            &running("e1"),
            &V5,
            true,
        )
        .unwrap();
        assert_eq!(r.port, 8480);
        // an older installation can be started (the update flow is separate)
        assert!(plan_start(&Ok(Some(record("4.9.0", None))), &running("e1"), &V5, true).is_ok());
        // an engine id that was never recorded can't mismatch
        assert!(plan_start(&Ok(Some(record("5.0.0", None))), &running("e9"), &V5, true).is_ok());
    }

    #[test]
    fn start_refuses_unsafe_situations() {
        let ok = Ok(Some(record("5.0.0", Some("e1"))));
        assert_eq!(
            code(plan_start(&Ok(None), &running("e1"), &V5, true)),
            ErrorCode::NotInstalled
        );
        assert_eq!(
            code(plan_start(&Err("x".into()), &running("e1"), &V5, true)),
            ErrorCode::StateDamaged
        );
        assert_eq!(
            code(plan_start(
                &Ok(Some(record("5.1.0", None))),
                &running("e1"),
                &V5,
                true
            )),
            ErrorCode::NewerThanApp
        );
        assert_eq!(
            code(plan_start(
                &Ok(Some(record("five", None))),
                &running("e1"),
                &V5,
                true
            )),
            ErrorCode::StateDamaged
        );
        assert_eq!(
            code(plan_start(&ok, &running("other-engine"), &V5, true)),
            ErrorCode::WrongEngine
        );
    }

    #[test]
    fn a_missing_volume_is_never_silently_recreated() {
        let ok = Ok(Some(record("5.0.0", Some("e1"))));
        let e = plan_start(&ok, &running("e1"), &V5, false).unwrap_err();
        assert_eq!(e.code, ErrorCode::VolumeMissing);
        assert!(e.message.contains("will not create"), "{}", e.message);
    }

    #[test]
    fn wrong_engine_is_reported_before_a_missing_volume() {
        // In another engine the volume is naturally missing: the engine mismatch is the real reason.
        let ok = Ok(Some(record("5.0.0", Some("e1"))));
        assert_eq!(
            code(plan_start(&ok, &running("e2"), &V5, false)),
            ErrorCode::WrongEngine
        );
    }

    // --- failures --------------------------------------------------------------------------------

    #[test]
    fn timeouts_are_reported_in_minutes() {
        let e = run_failure(
            "Downloading ArboDat+",
            RunError::Timeout {
                args: "compose pull".into(),
                secs: 2700,
            },
        );
        assert_eq!(e.code, ErrorCode::DockerFailed);
        assert!(e.message.contains("45 minutes"), "{}", e.message);
    }

    // --- operation guard ---------------------------------------------------------------------

    #[test]
    fn only_one_operation_at_a_time_and_the_slot_is_freed_afterwards() {
        let dir = tempfile::tempdir().unwrap();
        let manager = RuntimeManager::new("5.0.0", dir.path()).unwrap();
        assert_eq!(manager.current_operation(), None);
        {
            let _install = manager.begin(Operation::Install).unwrap();
            assert_eq!(manager.current_operation(), Some(Operation::Install));
            let refused = manager.begin(Operation::Start).err().unwrap();
            assert_eq!(refused.code, ErrorCode::Busy);
            assert_eq!(
                manager.current_operation(),
                Some(Operation::Install),
                "a refused begin must not disturb the running one"
            );
        }
        assert_eq!(manager.current_operation(), None);
        assert!(manager.begin(Operation::Stop).is_ok());
    }

    #[test]
    fn the_slot_is_freed_even_if_the_operation_panics() {
        let dir = tempfile::tempdir().unwrap();
        let manager = RuntimeManager::new("5.0.0", dir.path()).unwrap();
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _guard = manager.begin(Operation::Start).unwrap();
            panic!("boom");
        }));
        assert!(result.is_err());
        assert_eq!(manager.current_operation(), None);
    }

    #[test]
    fn steps_are_numbered_from_one() {
        let seen = Mutex::new(Vec::new());
        let emit = |e: ProgressEvent| seen.lock().unwrap().push(e);
        let mut steps = Steps::new(&emit, 2);
        steps.next("A");
        steps.log("hello");
        steps.next("B");
        let seen = seen.into_inner().unwrap();
        assert_eq!(
            seen,
            [
                ProgressEvent::Step {
                    index: 1,
                    total: 2,
                    label: "A".into()
                },
                ProgressEvent::Log {
                    text: "hello".into()
                },
                ProgressEvent::Step {
                    index: 2,
                    total: 2,
                    label: "B".into()
                },
            ]
        );
    }
}
