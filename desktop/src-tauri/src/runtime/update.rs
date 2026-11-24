//! Updating the local installation to the app's version, and going back if the new version fails.
//!
//! The order keeps the data safe at every point:
//! 1. a journal (`runtime/journal.json`) says what is being done, then a "before update" backup is
//!    made; if it fails, nothing is updated;
//! 2. the new version's files are staged in `runtime/next/` and its images downloaded; if that
//!    fails (offline, unknown version), nothing has changed;
//! 3. only then the files are switched (the current ones kept as `*.prev`), and the journal says so;
//! 4. the new version is started and checked: it answers, and `version.json` reports it.
//!
//! An update that fails (or is interrupted) after the switch leaves the journal at `switched`: the
//! Control Center then offers to try again, or to go back, which puts the `*.prev` files back and
//! restores the "before update" backup (the new version may already have changed the schema), as
//! one transaction like any restore. One that stops before the switch changed nothing; its journal
//! is cleaned up at the next start. Old images are never deleted.

use std::path::{Path, PathBuf};

use chrono::Local;
use semver::Version;
use serde::{Deserialize, Serialize};

use super::RuntimeManager;
use super::backup::{BackupKind, DB_SERVICE};
use super::compose;
use super::docker::DockerCli;
use super::error::{AppError, ErrorCode};
use super::fsutil;
use super::lifecycle::{Emit, Steps, command_failure, plan_start, run_failure, wait_until_ready};
use super::model::{
    EngineStatus, Operation, ProgressEvent, RecoveryView, StackPhase, StackStatus, UpdateStage,
};
use super::probe;
use super::restore::as_log;
use super::state::{self, InstallState, STATE_FILE};
use super::template::{COMPOSE_FILE, COMPOSE_YML, DATA_VOLUME, ENV_FILE, env_for_version};

pub const JOURNAL_FILE: &str = "journal.json";
const JOURNAL_SCHEMA: u32 = 1;
const NEXT_DIR: &str = "next";
/// The installation's files, in the order they are switched (the record last).
const FILES: [&str; 3] = [COMPOSE_FILE, ENV_FILE, STATE_FILE];
const APP_SERVICES: [&str; 2] = ["web-api", "frontend"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateJournal {
    pub schema: u32,
    pub from_version: String,
    pub to_version: String,
    /// RFC 3339, local time.
    pub started: String,
    pub stage: UpdateStage,
    /// File name of the "before update" backup, once it exists.
    pub backup: Option<String>,
    /// The backup folder at the time (the setting may change in between).
    pub backup_folder: Option<String>,
}

fn prev(name: &str) -> String {
    format!("{name}.prev")
}

pub fn load_journal(runtime_dir: &Path) -> Result<Option<UpdateJournal>, String> {
    let path = runtime_dir.join(JOURNAL_FILE);
    match std::fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text)
            .map(Some)
            .map_err(|e| format!("{} is damaged: {e}", path.display())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("could not read {}: {e}", path.display())),
    }
}

fn save_journal(runtime_dir: &Path, journal: &UpdateJournal) -> Result<(), AppError> {
    let json = serde_json::to_string_pretty(journal).expect("serializable") + "\n";
    fsutil::write_atomic(&runtime_dir.join(JOURNAL_FILE), json.as_bytes(), false)
        .map_err(|e| AppError::io("Couldn't write down the update's progress", &e))
}

fn delete_journal(runtime_dir: &Path) {
    let _ = std::fs::remove_file(runtime_dir.join(JOURNAL_FILE));
    let _ = std::fs::remove_dir_all(runtime_dir.join(NEXT_DIR));
}

/// Has the installation's state been touched by this update (so it has to be finished or undone)?
fn needs_recovery(stage: UpdateStage) -> bool {
    matches!(stage, UpdateStage::Switched | UpdateStage::RollingBack)
}

// ---------------------------------------------------------------------------------------------
// Decisions (pure)
// ---------------------------------------------------------------------------------------------

/// What the status says, given the journal: an update to finish or undo overrides the phase
/// (unless an operation is running right now, which then shows as busy).
pub fn apply_journal(
    stack: &mut StackStatus,
    journal: &Result<Option<UpdateJournal>, String>,
    busy: bool,
) {
    if busy {
        return;
    }
    match journal {
        Ok(Some(j)) if needs_recovery(j.stage) => {
            stack.phase = StackPhase::Recovery;
            stack.update_available = false;
            stack.recovery = Some(RecoveryView {
                from_version: j.from_version.clone(),
                to_version: j.to_version.clone(),
                stage: j.stage,
                backup: j.backup.clone(),
            });
        }
        Ok(_) => {}
        Err(e) => {
            stack.phase = StackPhase::Unknown;
            stack.detail = Some(format!("The record of an update is damaged: {e}"));
        }
    }
}

/// May the installation be updated to `app_version`? Returns its record.
pub fn plan_update(
    state: &Result<Option<InstallState>, String>,
    engine: &EngineStatus,
    app_version: &Version,
    volume_exists: bool,
    journal: &Result<Option<UpdateJournal>, String>,
) -> Result<InstallState, AppError> {
    match journal {
        Ok(Some(j)) if needs_recovery(j.stage) => {
            return Err(AppError::new(
                ErrorCode::UpdateUnfinished,
                format!(
                    "The update from {} to {} didn't finish. Try it again or go back first.",
                    j.from_version, j.to_version
                ),
            ));
        }
        Err(e) => {
            return Err(AppError::new(
                ErrorCode::StateDamaged,
                "The record of an earlier update is damaged.",
            )
            .with_detail(e.clone()));
        }
        Ok(_) => {}
    }
    let record = plan_start(state, engine, app_version, volume_exists)?;
    match Version::parse(&record.installed_version) {
        Ok(installed) if installed < *app_version => Ok(record),
        _ => Err(AppError::new(
            ErrorCode::UpToDate,
            format!(
                "ArboDat+ on this computer already has version {}.",
                record.installed_version
            ),
        )),
    }
}

/// The record after switching to `version`: everything else (port, engine) stays.
pub fn switched_record(record: &InstallState, version: &str) -> InstallState {
    InstallState {
        installed_version: version.to_string(),
        ..record.clone()
    }
}

// ---------------------------------------------------------------------------------------------
// The operations
// ---------------------------------------------------------------------------------------------

impl RuntimeManager {
    /// At app start: a journal of an update that stopped before switching has nothing to undo.
    pub fn clean_stale_journal(&self) {
        let dir = self.runtime_dir.as_path();
        if let Ok(Some(journal)) = load_journal(dir)
            && !needs_recovery(journal.stage)
        {
            log::info!(
                "removing the journal of an update to {} that stopped before changing anything",
                journal.to_version
            );
            delete_journal(dir);
        }
    }

    pub async fn update(&self, folder: &Path, emit: Emit<'_>) -> Result<(), AppError> {
        let _guard = self.begin(Operation::Update)?;
        let mut steps = Steps::new(emit, 8);
        let dir = self.runtime_dir.as_path();

        steps.next("Checking Docker");
        let (cli, engine) = self.ready_docker().await?;

        steps.next("Checking the installation");
        let loaded = state::load(dir).map_err(|e| e.to_string());
        let volume_exists = cli
            .volume_exists(DATA_VOLUME)
            .await
            .map_err(|e| command_failure("Checking the database volume", &e))?;
        let record = plan_update(
            &loaded,
            &engine,
            &self.app_version,
            volume_exists,
            &load_journal(dir),
        )?;
        let to = self.app_version.to_string();
        steps.log(format!(
            "From version {} to {to}.",
            record.installed_version
        ));

        steps.next("Backing up the current data");
        let mut journal = UpdateJournal {
            schema: JOURNAL_SCHEMA,
            from_version: record.installed_version.clone(),
            to_version: to.clone(),
            started: Local::now().to_rfc3339(),
            stage: UpdateStage::BackingUp,
            backup: None,
            backup_folder: Some(folder.display().to_string()),
        };
        save_journal(dir, &journal)?;
        let nested = as_log(emit);
        let safety = match self
            .backup_within_operation(BackupKind::BeforeUpdate, None, folder, &nested)
            .await
        {
            Ok(info) => info,
            Err(e) => {
                delete_journal(dir);
                return Err(AppError::new(
                    e.code,
                    format!(
                        "The current data couldn't be backed up, so nothing was updated. {}",
                        e.message
                    ),
                )
                .with_detail(e.detail.unwrap_or_default()));
            }
        };
        steps.log(format!(
            "The current data is saved in {}.",
            safety.file_name
        ));
        journal.backup = Some(safety.file_name.clone());

        steps.next("Downloading the new version");
        journal.stage = UpdateStage::Downloading;
        save_journal(dir, &journal)?;
        if let Err(e) = self.stage_next(&cli, &to, emit).await {
            delete_journal(dir);
            return Err(AppError::new(
                e.code,
                format!(
                    "{} Nothing was changed: ArboDat+ stays at version {}.",
                    e.message, journal.from_version
                ),
            )
            .with_detail(e.detail.unwrap_or_default()));
        }

        steps.next("Switching to the new version");
        for name in FILES {
            let current = dir.join(name);
            let contents = std::fs::read(&current)
                .map_err(|e| AppError::io(&format!("Couldn't read {name}"), &e))?;
            fsutil::write_atomic(&dir.join(prev(name)), &contents, name == ENV_FILE)
                .map_err(|e| AppError::io(&format!("Couldn't keep a copy of {name}"), &e))?;
        }
        journal.stage = UpdateStage::Switched;
        save_journal(dir, &journal)?;
        self.write_next_files(&record, &to)?;

        self.start_and_check(&cli, record.port, &to, &mut steps, emit)
            .await
            .map_err(|e| update_failed(e, &journal.from_version))?;

        steps.next("Finishing");
        delete_journal(dir);
        steps.log(format!("ArboDat+ now runs version {to}."));
        Ok(())
    }

    /// After a failed update: write the new version's files again, start and check it.
    pub async fn retry_update(&self, emit: Emit<'_>) -> Result<(), AppError> {
        let _guard = self.begin(Operation::Update)?;
        let mut steps = Steps::new(emit, 6);
        let dir = self.runtime_dir.as_path();

        steps.next("Checking Docker");
        let (cli, _engine) = self.ready_docker().await?;

        steps.next("Checking the unfinished update");
        let journal = match load_journal(dir) {
            Ok(Some(j)) if j.stage == UpdateStage::Switched => j,
            _ => {
                return Err(AppError::new(
                    ErrorCode::InvalidInput,
                    "There is no unfinished update to try again.",
                ));
            }
        };
        let record = state::load(dir)
            .ok()
            .flatten()
            .or_else(|| read_state(&dir.join(prev(STATE_FILE))))
            .ok_or_else(|| {
                AppError::new(
                    ErrorCode::StateDamaged,
                    "The installation record can't be read.",
                )
            })?;

        steps.next("Downloading the new version");
        self.stage_next(&cli, &journal.to_version, emit).await?;
        self.write_next_files(&record, &journal.to_version)?;

        self.start_and_check(&cli, record.port, &journal.to_version, &mut steps, emit)
            .await
            .map_err(|e| update_failed(e, &journal.from_version))?;

        steps.next("Finishing");
        delete_journal(dir);
        steps.log(format!("ArboDat+ now runs version {}.", journal.to_version));
        Ok(())
    }

    /// After a failed update: the previous version's files back, the "before update" backup
    /// restored (one transaction, with its own safety backup first), the previous version started.
    pub async fn roll_back_update(&self, emit: Emit<'_>) -> Result<(), AppError> {
        let _guard = self.begin(Operation::RollBack)?;
        let mut steps = Steps::new(emit, 10);
        let dir = self.runtime_dir.as_path();

        steps.next("Checking Docker");
        let (cli, _engine) = self.ready_docker().await?;

        steps.next("Checking the unfinished update");
        let mut journal = match load_journal(dir) {
            Ok(Some(j)) if needs_recovery(j.stage) => j,
            _ => {
                return Err(AppError::new(
                    ErrorCode::InvalidInput,
                    "There is no unfinished update to undo.",
                ));
            }
        };
        let backup_path = match (&journal.backup, &journal.backup_folder) {
            (Some(name), Some(folder)) => PathBuf::from(folder).join(name),
            _ => {
                return Err(AppError::new(
                    ErrorCode::StateDamaged,
                    "The update's record doesn't say which backup was made before it.",
                ));
            }
        };
        if !backup_path.is_file() {
            return Err(AppError::new(
                ErrorCode::BackupInvalid,
                format!(
                    "The backup from before the update ({}) isn't there any more, so the previous \
                     version can't be put back automatically.",
                    backup_path.display()
                ),
            ));
        }
        for name in FILES {
            if !dir.join(prev(name)).is_file() {
                return Err(AppError::new(
                    ErrorCode::StateDamaged,
                    format!("The copy of {name} from before the update is missing."),
                ));
            }
        }
        let previous = read_state(&dir.join(prev(STATE_FILE))).ok_or_else(|| {
            AppError::new(
                ErrorCode::StateDamaged,
                "The installation record from before the update can't be read.",
            )
        })?;
        journal.stage = UpdateStage::RollingBack;
        save_journal(dir, &journal)?;

        steps.next("Stopping the new version");
        let out = compose::stop_services(&cli, dir, &APP_SERVICES, |line| {
            emit(ProgressEvent::Log {
                text: line.to_string(),
            })
        })
        .await
        .map_err(|e| run_failure("Stopping the new version", e))?;
        if !out.success() {
            return Err(command_failure("Stopping the new version", &out.stderr));
        }

        steps.next("Putting the previous version back");
        for name in FILES {
            let contents = std::fs::read(dir.join(prev(name)))
                .map_err(|e| AppError::io(&format!("Couldn't read the copy of {name}"), &e))?;
            fsutil::write_atomic(&dir.join(name), &contents, name == ENV_FILE)
                .map_err(|e| AppError::io(&format!("Couldn't put {name} back"), &e))?;
        }
        let out = compose::up_services(&cli, dir, &[DB_SERVICE], |line| {
            emit(ProgressEvent::Log {
                text: line.to_string(),
            })
        })
        .await
        .map_err(|e| run_failure("Starting the database", e))?;
        if !out.success() {
            return Err(command_failure("Starting the database", &out.stderr));
        }

        // Steps 5 to 8: check the backup, back up the current data, stop, restore (one transaction).
        let folder = backup_path.parent().unwrap_or(dir).to_path_buf();
        let restored = self
            .restore_with_database_up(&cli, &backup_path, &folder, &mut steps, emit)
            .await?;

        steps.next("Starting the previous version");
        self.bring_up(&cli, previous.port, emit).await?;
        wait_until_ready(previous.port, emit).await?;

        steps.next("Finishing");
        delete_journal(dir);
        steps.log(format!(
            "ArboDat+ runs version {} again, with the data from before the update. What was entered \
             since is saved in {}.",
            journal.from_version, restored.safety_backup
        ));
        Ok(())
    }

    /// The new version's files in `runtime/next/`, and its images on this computer.
    async fn stage_next(
        &self,
        cli: &DockerCli,
        version: &str,
        emit: Emit<'_>,
    ) -> Result<(), AppError> {
        let dir = self.runtime_dir.as_path();
        let next = dir.join(NEXT_DIR);
        std::fs::create_dir_all(&next)
            .map_err(|e| AppError::io("Couldn't prepare the new version", &e))?;
        let current_env = std::fs::read_to_string(dir.join(ENV_FILE))
            .or_else(|_| std::fs::read_to_string(dir.join(prev(ENV_FILE))))
            .map_err(|e| AppError::io("Couldn't read the settings file", &e))?;
        let env = env_for_version(&current_env, version).map_err(|e| {
            AppError::new(ErrorCode::StateDamaged, "The settings file is incomplete.")
                .with_detail(e)
        })?;
        fsutil::write_atomic(&next.join(COMPOSE_FILE), COMPOSE_YML.as_bytes(), false)
            .map_err(|e| AppError::io("Couldn't prepare the new version", &e))?;
        fsutil::write_atomic(&next.join(ENV_FILE), env.as_bytes(), true)
            .map_err(|e| AppError::io("Couldn't prepare the new version", &e))?;
        self.pull_missing_images_in(cli, &next, emit).await
    }

    /// The staged files become the installation's, and the record says the new version.
    fn write_next_files(&self, record: &InstallState, version: &str) -> Result<(), AppError> {
        let dir = self.runtime_dir.as_path();
        let next = dir.join(NEXT_DIR);
        for name in [COMPOSE_FILE, ENV_FILE] {
            let contents = std::fs::read(next.join(name))
                .map_err(|e| AppError::io("Couldn't read the new version's files", &e))?;
            fsutil::write_atomic(&dir.join(name), &contents, name == ENV_FILE)
                .map_err(|e| AppError::io("Couldn't switch to the new version", &e))?;
        }
        state::save(dir, &switched_record(record, version))
            .map_err(|e| AppError::io("Couldn't save the installation record", &e))
    }

    /// Starts the installation's current definition and proves it is `version`.
    async fn start_and_check(
        &self,
        cli: &DockerCli,
        port: u16,
        version: &str,
        steps: &mut Steps<'_>,
        emit: Emit<'_>,
    ) -> Result<(), AppError> {
        let dir = self.runtime_dir.as_path();
        steps.next("Starting the new version");
        let out = compose::up_new_version(cli, dir, |line| {
            emit(ProgressEvent::Log {
                text: line.to_string(),
            })
        })
        .await
        .map_err(|e| run_failure("Starting the new version", e))?;
        if !out.success() {
            return Err(command_failure("Starting the new version", &out.stderr));
        }

        steps.next("Checking the new version");
        wait_until_ready(port, emit).await?;
        let running = probe::version_of(port).await.map_err(|e| {
            AppError::new(
                ErrorCode::NotReady,
                "The new version's number can't be read.",
            )
            .with_detail(e)
        })?;
        if running != version {
            return Err(AppError::new(
                ErrorCode::UpdateFailed,
                format!("ArboDat+ answers, but as version {running} instead of {version}."),
            ));
        }
        steps.log(format!("ArboDat+ answers as version {running}."));
        Ok(())
    }
}

fn read_state(path: &Path) -> Option<InstallState> {
    serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()
}

fn update_failed(e: AppError, from: &str) -> AppError {
    AppError::new(
        ErrorCode::UpdateFailed,
        format!(
            "The new version didn't start correctly: {} You can try the update again, or go back to \
             version {from}.",
            e.message
        ),
    )
    .with_detail(e.detail.unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::model::StackPhase;

    fn record(version: &str) -> InstallState {
        InstallState {
            schema: state::SCHEMA,
            installed_version: version.into(),
            port: 8480,
            docker_host: None,
            engine_id: Some("abc".into()),
        }
    }

    fn engine() -> EngineStatus {
        EngineStatus::Running {
            version: "28".into(),
            os: "Docker Desktop".into(),
            id: "abc".into(),
        }
    }

    fn journal(stage: UpdateStage) -> UpdateJournal {
        UpdateJournal {
            schema: JOURNAL_SCHEMA,
            from_version: "5.0.0".into(),
            to_version: "5.1.0".into(),
            started: "2026-10-25T09:00:00+01:00".into(),
            stage,
            backup: Some("arbodat-plus_x_before-update_v5.0.0.dump".into()),
            backup_folder: Some("/b".into()),
        }
    }

    fn stack(phase: StackPhase) -> StackStatus {
        StackStatus {
            phase,
            installed_version: Some("5.1.0".into()),
            port: Some(8480),
            update_available: false,
            operation: None,
            services: Vec::new(),
            detail: None,
            recovery: None,
        }
    }

    #[test]
    fn only_an_older_installation_is_updated() {
        let app = Version::parse("5.1.0").unwrap();
        let ok = plan_update(&Ok(Some(record("5.0.0"))), &engine(), &app, true, &Ok(None));
        assert_eq!(ok.unwrap().installed_version, "5.0.0");
        assert_eq!(
            plan_update(&Ok(Some(record("5.1.0"))), &engine(), &app, true, &Ok(None))
                .unwrap_err()
                .code,
            ErrorCode::UpToDate
        );
        assert_eq!(
            plan_update(&Ok(Some(record("5.2.0"))), &engine(), &app, true, &Ok(None))
                .unwrap_err()
                .code,
            ErrorCode::NewerThanApp
        );
        assert_eq!(
            plan_update(&Ok(None), &engine(), &app, true, &Ok(None))
                .unwrap_err()
                .code,
            ErrorCode::NotInstalled
        );
        assert_eq!(
            plan_update(
                &Ok(Some(record("5.0.0"))),
                &engine(),
                &app,
                false,
                &Ok(None)
            )
            .unwrap_err()
            .code,
            ErrorCode::VolumeMissing,
            "no update onto a database that isn't there"
        );
    }

    #[test]
    fn an_unfinished_update_has_to_be_settled_first() {
        let app = Version::parse("5.1.0").unwrap();
        for stage in [UpdateStage::Switched, UpdateStage::RollingBack] {
            let j = Ok(Some(journal(stage)));
            assert_eq!(
                plan_update(&Ok(Some(record("5.0.0"))), &engine(), &app, true, &j)
                    .unwrap_err()
                    .code,
                ErrorCode::UpdateUnfinished
            );
        }
        // A journal from before the switch changed nothing and doesn't block.
        let early = Ok(Some(journal(UpdateStage::Downloading)));
        assert!(plan_update(&Ok(Some(record("5.0.0"))), &engine(), &app, true, &early).is_ok());
        assert_eq!(
            plan_update(
                &Ok(Some(record("5.0.0"))),
                &engine(),
                &app,
                true,
                &Err("broken".into())
            )
            .unwrap_err()
            .code,
            ErrorCode::StateDamaged
        );
    }

    #[test]
    fn the_status_shows_an_unfinished_update_as_recovery() {
        let mut s = stack(StackPhase::Degraded);
        apply_journal(&mut s, &Ok(Some(journal(UpdateStage::Switched))), false);
        assert_eq!(s.phase, StackPhase::Recovery);
        let r = s.recovery.unwrap();
        assert_eq!(
            (r.from_version.as_str(), r.to_version.as_str()),
            ("5.0.0", "5.1.0")
        );
        assert_eq!(
            r.backup.as_deref(),
            Some("arbodat-plus_x_before-update_v5.0.0.dump")
        );

        let mut busy = stack(StackPhase::Busy);
        apply_journal(&mut busy, &Ok(Some(journal(UpdateStage::Switched))), true);
        assert_eq!(
            busy.phase,
            StackPhase::Busy,
            "while the update runs it is busy, not recovery"
        );

        let mut early = stack(StackPhase::Running);
        apply_journal(
            &mut early,
            &Ok(Some(journal(UpdateStage::BackingUp))),
            false,
        );
        assert_eq!((early.phase, early.recovery), (StackPhase::Running, None));

        let mut damaged = stack(StackPhase::Running);
        apply_journal(&mut damaged, &Err("bad json".into()), false);
        assert_eq!(damaged.phase, StackPhase::Unknown);
        assert!(damaged.detail.unwrap().contains("bad json"));
    }

    #[test]
    fn switching_changes_only_the_version_in_the_record() {
        let r = switched_record(&record("5.0.0"), "5.1.0");
        assert_eq!(r.installed_version, "5.1.0");
        assert_eq!((r.port, r.engine_id.as_deref()), (8480, Some("abc")));
    }

    #[test]
    fn the_journal_round_trips_and_a_damaged_one_is_an_error() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(load_journal(dir.path()), Ok(None));
        save_journal(dir.path(), &journal(UpdateStage::Switched)).unwrap();
        assert_eq!(
            load_journal(dir.path()),
            Ok(Some(journal(UpdateStage::Switched)))
        );
        std::fs::write(dir.path().join(JOURNAL_FILE), "{ cut").unwrap();
        assert!(load_journal(dir.path()).is_err());
    }

    #[test]
    fn at_start_only_a_journal_from_before_the_switch_is_cleaned_up() {
        for (stage, cleaned) in [
            (UpdateStage::BackingUp, true),
            (UpdateStage::Downloading, true),
            (UpdateStage::Switched, false),
            (UpdateStage::RollingBack, false),
        ] {
            let dir = tempfile::tempdir().unwrap();
            let runtime = RuntimeManager::new("5.1.0", dir.path()).unwrap();
            std::fs::create_dir_all(runtime.runtime_dir()).unwrap();
            save_journal(runtime.runtime_dir(), &journal(stage)).unwrap();
            runtime.clean_stale_journal();
            assert_eq!(
                load_journal(runtime.runtime_dir()).unwrap().is_none(),
                cleaned,
                "{stage:?}"
            );
        }
    }

    #[test]
    fn deleting_the_journal_also_removes_the_staged_files() {
        let dir = tempfile::tempdir().unwrap();
        save_journal(dir.path(), &journal(UpdateStage::Downloading)).unwrap();
        std::fs::create_dir(dir.path().join(NEXT_DIR)).unwrap();
        std::fs::write(dir.path().join(NEXT_DIR).join(".env"), "x").unwrap();
        std::fs::write(dir.path().join("compose.yml.prev"), "kept").unwrap();
        delete_journal(dir.path());
        assert!(!dir.path().join(JOURNAL_FILE).exists());
        assert!(!dir.path().join(NEXT_DIR).exists());
        assert!(
            dir.path().join("compose.yml.prev").exists(),
            "the copies of the previous version stay"
        );
    }
}
