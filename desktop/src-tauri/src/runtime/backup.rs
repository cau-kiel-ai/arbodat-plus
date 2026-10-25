//! Backups of the local installation's database.
//!
//! A backup is a `pg_dump` custom-format file plus a JSON sidecar with what is needed to trust and
//! later restore it (kind, time, versions, size, sha256, row counts per table). Rules:
//! - the dump is written to `<name>.dump.partial`, flushed, checked by reading it completely
//!   (`pg_restore -f /dev/null`; `--list` alone accepts a dump cut off at the end), and only then
//!   renamed; a failed backup leaves no `.dump` behind;
//! - if the installation is stopped, only the database is started for the backup, and stopped again
//!   afterwards; never a second database on the same volume;
//! - only the daily automatic backups are ever deleted, by the retention policy below, and only
//!   files whose sidecar says the app made them as such. Everything else stays.

use std::collections::BTreeMap;
#[cfg(test)]
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::Duration;

use chrono::{DateTime, Datelike, Local, NaiveDate, NaiveDateTime};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::RuntimeManager;
use super::compose;
use super::error::{AppError, ErrorCode};
use super::fsutil;
use super::lifecycle::{Emit, Steps, command_failure, plan_start, run_failure};
use super::model::{Operation, ProgressEvent};
use super::state;
use super::template::DATA_VOLUME;

pub(super) const DB_SERVICE: &str = "database";
pub(super) const DB_USER: &str = "postgres";
pub(super) const DB_NAME: &str = "postgres";
const PREFIX: &str = "arbodat-plus_";
const DUMP_EXT: &str = "dump";
const PARTIAL_EXT: &str = "partial";
const SIDECAR_EXT: &str = "json";
pub const SIDECAR_SCHEMA: u32 = 1;

const DUMP_TIMEOUT: Duration = Duration::from_secs(30 * 60);
const CHECK_TIMEOUT: Duration = Duration::from_secs(30 * 60);
const QUERY_TIMEOUT: Duration = Duration::from_secs(5 * 60);

/// Why a backup was made. Only `Auto` backups are ever deleted (by the retention policy).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum BackupKind {
    /// Made by the user.
    Manual,
    /// The daily one made while the app is open.
    Auto,
    BeforeUpdate,
    BeforeRestore,
}

impl BackupKind {
    fn slug(self) -> &'static str {
        match self {
            BackupKind::Manual => "manual",
            BackupKind::Auto => "auto",
            BackupKind::BeforeUpdate => "before-update",
            BackupKind::BeforeRestore => "before-restore",
        }
    }
}

/// The sidecar `<name>.json` next to `<name>.dump`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupMeta {
    pub schema: u32,
    pub kind: BackupKind,
    /// RFC 3339 in local time with its offset, e.g. `2026-10-25T09:12:30+01:00`.
    pub created: String,
    /// The ArboDat+ version of the installation that was backed up.
    pub stack_version: String,
    pub app_version: String,
    pub postgres_version: String,
    pub size_bytes: u64,
    pub sha256: String,
    /// Exact row count per table at the time of the backup.
    pub tables: BTreeMap<String, u64>,
    /// The user's short note on a backup made by hand.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// One backup as the Control Center lists it. Dumps that came from elsewhere (no sidecar) are
/// listed too, with what can be known about them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BackupInfo {
    pub file_name: String,
    /// `None`: not made by this app (or its sidecar is missing or damaged).
    pub kind: Option<BackupKind>,
    /// RFC 3339; from the sidecar, else the file's modification time.
    pub created: String,
    pub stack_version: Option<String>,
    pub postgres_version: Option<String>,
    #[ts(type = "number")]
    pub size_bytes: u64,
    #[ts(type = "number | null")]
    pub rows: Option<u64>,
    pub tables: Option<u32>,
    /// The user's short note on a backup made by hand.
    pub description: Option<String>,
    /// For an automatic backup: why the retention policy keeps it (daily, weekly, monthly).
    pub retained: Option<Retained>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BackupList {
    pub folder: String,
    /// Newest first.
    pub backups: Vec<BackupInfo>,
    /// Why the last daily backup failed, if it did (cleared by the next one that works).
    pub last_auto_failure: Option<String>,
}

// ---------------------------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------------------------

/// `arbodat-plus_2026-10-25_09-12-30_manual_v5.0.0`: sorts by time, says what it is.
pub fn file_stem(created: &DateTime<Local>, kind: BackupKind, version: &str) -> String {
    let safe_version: String = version
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();
    format!(
        "{PREFIX}{}_{}_v{safe_version}",
        created.format("%Y-%m-%d_%H-%M-%S"),
        kind.slug()
    )
}

/// A name that isn't taken yet in `folder` (two backups in the same second get `-2`, `-3`...).
fn free_stem(folder: &Path, stem: &str) -> String {
    let taken = |s: &str| {
        folder.join(format!("{s}.{DUMP_EXT}")).exists()
            || folder.join(format!("{s}.{SIDECAR_EXT}")).exists()
            || folder
                .join(format!("{s}.{DUMP_EXT}.{PARTIAL_EXT}"))
                .exists()
    };
    if !taken(stem) {
        return stem.to_string();
    }
    (2..)
        .map(|n| format!("{stem}-{n}"))
        .find(|s| !taken(s))
        .expect("an unused number exists")
}

/// The longest note a backup made by hand may carry.
pub const DESCRIPTION_MAX: usize = 25;

/// The note as it is stored: trimmed, without line breaks or other control characters; `None` if
/// nothing is left. Longer than `DESCRIPTION_MAX` characters is refused, not cut.
pub fn clean_description(input: Option<&str>) -> Result<Option<String>, AppError> {
    let Some(input) = input else {
        return Ok(None);
    };
    let cleaned: String = input
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if cleaned.chars().count() > DESCRIPTION_MAX {
        return Err(AppError::new(
            ErrorCode::InvalidInput,
            format!("The description can have at most {DESCRIPTION_MAX} characters."),
        ));
    }
    Ok((!cleaned.is_empty()).then_some(cleaned))
}

// ---------------------------------------------------------------------------------------------
// Retention (pure)
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, Copy)]
pub struct Keep {
    pub daily: usize,
    pub weekly: usize,
    pub monthly: usize,
}

/// What the user chose: the newest backup of each of the last 7 days, 4 weeks and 12 months that
/// have backups at all (restic's `--keep-daily 7 --keep-weekly 4 --keep-monthly 12`).
pub const RETENTION: Keep = Keep {
    daily: 7,
    weekly: 4,
    monthly: 12,
};

/// Why the retention policy keeps an automatic backup: as one of the last 7 days, 4 weeks or 12
/// months. Shown in the list instead of a plain "automatic".
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum Retained {
    Daily,
    Weekly,
    Monthly,
}

/// For each backup taken at `times` (local times, any order): why it is kept, or `None` if the
/// policy lets it go. A backup kept for several reasons counts as the shortest one (daily before
/// weekly before monthly). The newest one is always kept, whatever the policy says.
pub fn retention(times: &[NaiveDateTime], keep: Keep) -> Vec<Option<Retained>> {
    let mut order: Vec<usize> = (0..times.len()).collect();
    order.sort_by(|a, b| times[*b].cmp(&times[*a]));
    let mut why: Vec<Option<Retained>> = vec![None; times.len()];
    let mut apply = |n: usize, role: Retained, key: &dyn Fn(&NaiveDateTime) -> (i32, u32, u32)| {
        let mut last = None;
        let mut count = 0;
        for &i in &order {
            let k = key(&times[i]);
            if last != Some(k) {
                last = Some(k);
                if count < n {
                    why[i].get_or_insert(role);
                    count += 1;
                }
            }
        }
    };
    apply(keep.daily, Retained::Daily, &|t| {
        (t.year(), t.month(), t.day())
    });
    apply(keep.weekly, Retained::Weekly, &|t| {
        let w = t.iso_week();
        (w.year(), w.week(), 0)
    });
    apply(keep.monthly, Retained::Monthly, &|t| {
        (t.year(), t.month(), 0)
    });
    if let Some(&newest) = order.first() {
        why[newest].get_or_insert(Retained::Daily);
    }
    why
}

/// Which of the backups taken at `times` may go (indices, ascending).
pub fn to_prune(times: &[NaiveDateTime], keep: Keep) -> Vec<usize> {
    retention(times, keep)
        .iter()
        .enumerate()
        .filter(|(_, why)| why.is_none())
        .map(|(i, _)| i)
        .collect()
}

// ---------------------------------------------------------------------------------------------
// The backup folder
// ---------------------------------------------------------------------------------------------

struct Entry {
    dump: PathBuf,
    meta: Option<BackupMeta>,
    info: BackupInfo,
}

fn read_meta(sidecar: &Path) -> Option<BackupMeta> {
    let text = std::fs::read_to_string(sidecar).ok()?;
    serde_json::from_str(&text).ok()
}

fn modified_rfc3339(path: &Path) -> String {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .map(|t| DateTime::<Local>::from(t).to_rfc3339())
        .unwrap_or_default()
}

/// What is known about one dump file: its sidecar (if there is a readable one next to it) and the
/// list entry made from it.
pub(super) fn describe(dump: &Path) -> (Option<BackupMeta>, BackupInfo) {
    let meta = read_meta(&dump.with_extension(SIDECAR_EXT));
    let size = std::fs::metadata(dump).map(|m| m.len()).unwrap_or(0);
    let info = BackupInfo {
        file_name: dump
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
        kind: meta.as_ref().map(|m| m.kind),
        created: meta
            .as_ref()
            .map(|m| m.created.clone())
            .unwrap_or_else(|| modified_rfc3339(dump)),
        stack_version: meta.as_ref().map(|m| m.stack_version.clone()),
        postgres_version: meta.as_ref().map(|m| m.postgres_version.clone()),
        size_bytes: size,
        rows: meta.as_ref().map(|m| m.tables.values().sum()),
        tables: meta.as_ref().map(|m| m.tables.len() as u32),
        description: meta.as_ref().and_then(|m| m.description.clone()),
        retained: None,
    };
    (meta, info)
}

/// Every `*.dump` in the folder, newest first. A folder that doesn't exist yet has none.
fn entries(folder: &Path) -> Vec<Entry> {
    let Ok(dir) = std::fs::read_dir(folder) else {
        return Vec::new();
    };
    let mut list: Vec<Entry> = dir
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| p.is_file() && p.extension().is_some_and(|x| x == DUMP_EXT))
        .map(|dump| {
            let (meta, info) = describe(&dump);
            Entry { dump, meta, info }
        })
        .collect();
    list.sort_by(|a, b| {
        let time = |e: &Entry| DateTime::parse_from_rfc3339(&e.info.created).ok();
        time(b).cmp(&time(a))
    });
    list
}

pub fn list(folder: &Path, last_auto_failure: Option<String>) -> BackupList {
    let mut backups: Vec<BackupInfo> = entries(folder).into_iter().map(|e| e.info).collect();
    // The same selection as `prune_auto_backups`, to say why each automatic one is kept.
    let autos: Vec<(usize, NaiveDateTime)> = backups
        .iter()
        .enumerate()
        .filter(|(_, b)| b.kind == Some(BackupKind::Auto) && b.file_name.starts_with(PREFIX))
        .filter_map(|(i, b)| local_time(&b.created).map(|t| (i, t)))
        .collect();
    let times: Vec<NaiveDateTime> = autos.iter().map(|(_, t)| *t).collect();
    for ((i, _), why) in autos.iter().zip(retention(&times, RETENTION)) {
        // One the policy lets go is deleted after the next daily backup; until then it is "daily".
        backups[*i].retained = Some(why.unwrap_or(Retained::Daily));
    }
    BackupList {
        folder: folder.display().to_string(),
        backups,
        last_auto_failure,
    }
}

fn local_time(created: &str) -> Option<NaiveDateTime> {
    DateTime::parse_from_rfc3339(created)
        .ok()
        .map(|t| t.with_timezone(&Local).naive_local())
}

/// Has a daily automatic backup been made on `day` (local)?
pub fn has_auto_backup_on(folder: &Path, day: NaiveDate) -> bool {
    entries(folder).iter().any(|e| {
        e.meta.as_ref().is_some_and(|m| {
            m.kind == BackupKind::Auto && local_time(&m.created).is_some_and(|t| t.date() == day)
        })
    })
}

/// Applies the retention policy to the daily automatic backups. Returns the names it deleted.
pub fn prune_auto_backups(folder: &Path) -> Vec<String> {
    let autos: Vec<(Entry, NaiveDateTime)> = entries(folder)
        .into_iter()
        .filter_map(|e| {
            let meta = e.meta.as_ref()?;
            if meta.kind != BackupKind::Auto || !e.info.file_name.starts_with(PREFIX) {
                return None;
            }
            let time = local_time(&meta.created)?;
            Some((e, time))
        })
        .collect();
    let times: Vec<NaiveDateTime> = autos.iter().map(|(_, t)| *t).collect();
    let mut deleted = Vec::new();
    for i in to_prune(&times, RETENTION) {
        let entry = &autos[i].0;
        match std::fs::remove_file(&entry.dump) {
            Ok(()) => {
                let _ = std::fs::remove_file(entry.dump.with_extension(SIDECAR_EXT));
                log::info!("retention: deleted {}", entry.info.file_name);
                deleted.push(entry.info.file_name.clone());
            }
            Err(e) => log::warn!("retention: could not delete {}: {e}", entry.info.file_name),
        }
    }
    deleted
}

/// The path of the backup `file_name` in `folder`. Only a plain file name of an existing `.dump`
/// directly in `folder` is accepted, so nothing else can be reached through it.
pub(super) fn in_folder(folder: &Path, file_name: &str) -> Result<PathBuf, AppError> {
    let plain = Path::new(file_name).file_name().and_then(|n| n.to_str()) == Some(file_name);
    if !plain
        || file_name.starts_with('.')
        || file_name.contains(['/', '\\'])
        || !file_name.ends_with(&format!(".{DUMP_EXT}"))
    {
        return Err(AppError::new(
            ErrorCode::InvalidInput,
            "That is not a backup in the backup folder.",
        ));
    }
    let dump = folder.join(file_name);
    if !dump.is_file() {
        return Err(AppError::new(
            ErrorCode::InvalidInput,
            "That backup isn't in the backup folder any more.",
        ));
    }
    Ok(dump)
}

/// Deletes one backup the user picked in the list: the `.dump` and its sidecar. Only a plain file
/// name of a `.dump` directly in `folder` is accepted, so nothing else can be reached through it.
pub fn delete(folder: &Path, file_name: &str) -> Result<(), AppError> {
    let dump = in_folder(folder, file_name)?;
    std::fs::remove_file(&dump).map_err(|e| AppError::io("Couldn't delete the backup", &e))?;
    let sidecar = dump.with_extension(SIDECAR_EXT);
    if sidecar.exists() {
        let _ = std::fs::remove_file(sidecar);
    }
    log::info!("backup deleted by the user: {file_name}");
    Ok(())
}

/// Leftovers of an interrupted backup (`*.dump.partial` of ours): never a valid backup.
fn remove_partials(folder: &Path) {
    let Ok(dir) = std::fs::read_dir(folder) else {
        return;
    };
    for path in dir.filter_map(Result::ok).map(|e| e.path()) {
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        if name.starts_with(PREFIX) && name.ends_with(&format!(".{DUMP_EXT}.{PARTIAL_EXT}")) {
            let _ = std::fs::remove_file(&path);
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Reading the database (pure parsing)
// ---------------------------------------------------------------------------------------------

/// Exact row counts of every table in `public`, in one statement (`query_to_xml` runs a count per
/// table). Output: `table|count` lines.
const COUNT_ROWS: &str = "select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1";

pub fn parse_counts(output: &str) -> Result<BTreeMap<String, u64>, String> {
    output
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(|line| {
            let (table, count) = line
                .rsplit_once('|')
                .ok_or_else(|| format!("unexpected line {line:?}"))?;
            let count = count
                .trim()
                .parse()
                .map_err(|_| format!("unexpected count in {line:?}"))?;
            Ok((table.trim().to_string(), count))
        })
        .collect()
}

/// How many tables' data a dump holds (`pg_restore --list` lines like `1234; 0 16390 TABLE DATA ...`).
pub fn table_data_entries(list: &str) -> usize {
    list.lines()
        .filter(|l| !l.trim_start().starts_with(';') && l.contains(" TABLE DATA "))
        .count()
}

// ---------------------------------------------------------------------------------------------
// The operation
// ---------------------------------------------------------------------------------------------

impl RuntimeManager {
    /// Makes a backup into `folder`. One operation at a time, like install/start/stop.
    pub async fn backup(
        &self,
        kind: BackupKind,
        description: Option<String>,
        folder: &Path,
        emit: Emit<'_>,
    ) -> Result<BackupInfo, AppError> {
        let _guard = self.begin(Operation::Backup)?;
        self.backup_within_operation(kind, description, folder, emit)
            .await
    }

    /// The backup itself, for operations that need one as a step (restore, update) and already
    /// hold the operation slot.
    pub(super) async fn backup_within_operation(
        &self,
        kind: BackupKind,
        description: Option<String>,
        folder: &Path,
        emit: Emit<'_>,
    ) -> Result<BackupInfo, AppError> {
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
        std::fs::create_dir_all(folder)
            .map_err(|e| AppError::io("Couldn't create the backup folder", &e))?;
        crate::settings::check_writable(folder).map_err(|e| {
            AppError::new(
                ErrorCode::Io,
                "ArboDat+ can't write to the backup folder. Choose another one in the settings.",
            )
            .with_detail(format!("{}: {e}", folder.display()))
        })?;

        steps.next("Making sure the database is running");
        let containers = compose::ps(&cli, dir)
            .await
            .map_err(|e| command_failure("Checking the containers", &e))?;
        let database_running = containers
            .iter()
            .any(|c| c.service == DB_SERVICE && c.state == "running");
        let started = if database_running {
            steps.log("The database is running.");
            Ok(())
        } else {
            steps.log("ArboDat+ is stopped: starting only the database for the backup.");
            match compose::up_services(&cli, dir, &[DB_SERVICE], |line| {
                emit(ProgressEvent::Log {
                    text: line.to_string(),
                })
            })
            .await
            {
                Ok(out) if out.success() => Ok(()),
                Ok(out) => Err(command_failure("Starting the database", &out.stderr)),
                Err(e) => Err(run_failure("Starting the database", e)),
            }
        };

        let result = match started {
            Ok(()) => {
                self.dump_and_check(
                    &cli,
                    kind,
                    description,
                    folder,
                    &record.installed_version,
                    &mut steps,
                )
                .await
            }
            Err(e) => Err(e),
        };

        // Whatever happened: if the backup started the database (even only partly), stop it, so
        // a stopped ArboDat+ is stopped again afterwards.
        if !database_running {
            steps.log("Stopping the database again.");
            match compose::stop_services(&cli, dir, &[DB_SERVICE], |line| {
                emit(ProgressEvent::Log {
                    text: line.to_string(),
                })
            })
            .await
            {
                Ok(out) if out.success() => {}
                Ok(out) => log::warn!(
                    "could not stop the database after the backup: {}",
                    out.stderr
                ),
                Err(e) => log::warn!("could not stop the database after the backup: {e}"),
            }
        }
        result
    }

    async fn dump_and_check(
        &self,
        cli: &super::docker::DockerCli,
        kind: BackupKind,
        description: Option<String>,
        folder: &Path,
        stack_version: &str,
        steps: &mut Steps<'_>,
    ) -> Result<BackupInfo, AppError> {
        let dir = self.runtime_dir.as_path();
        let created = Local::now();
        let stem = free_stem(folder, &file_stem(&created, kind, stack_version));
        let dump = folder.join(format!("{stem}.{DUMP_EXT}"));
        let partial = folder.join(format!("{stem}.{DUMP_EXT}.{PARTIAL_EXT}"));
        remove_partials(folder);

        steps.next("Writing the backup");
        let written = async {
            let (out, written) = cli
                .run_into_file(
                    dir,
                    compose::exec_args(
                        dir,
                        DB_SERVICE,
                        &["pg_dump", "-U", DB_USER, "--format=custom", DB_NAME],
                    ),
                    DUMP_TIMEOUT,
                    &partial,
                )
                .await
                .map_err(|e| run_failure("Writing the backup", e))?;
            if !out.success() {
                return Err(command_failure("Writing the backup", &out.stderr));
            }
            if written.bytes == 0 {
                return Err(AppError::new(
                    ErrorCode::DockerFailed,
                    "The backup came out empty.",
                ));
            }
            steps.log(format!("{} bytes written.", written.bytes));

            steps.next("Checking the backup");
            // A complete read: --list alone accepts a dump whose end is missing.
            let full = cli
                .run_with_input(
                    dir,
                    compose::exec_args(dir, DB_SERVICE, &["pg_restore", "-f", "/dev/null"]),
                    CHECK_TIMEOUT,
                    &partial,
                )
                .await
                .map_err(|e| run_failure("Checking the backup", e))?;
            if !full.success() {
                return Err(AppError::new(
                    ErrorCode::BackupInvalid,
                    "The backup that was just written can't be read back, so it was not kept.",
                )
                .with_detail(full.stderr));
            }
            let toc = cli
                .run_with_input(
                    dir,
                    compose::exec_args(dir, DB_SERVICE, &["pg_restore", "--list"]),
                    CHECK_TIMEOUT,
                    &partial,
                )
                .await
                .map_err(|e| run_failure("Checking the backup", e))?;
            if !toc.success() {
                return Err(AppError::new(
                    ErrorCode::BackupInvalid,
                    "The backup that was just written has no readable table of contents.",
                )
                .with_detail(toc.stderr));
            }
            let counts = self.query(cli, COUNT_ROWS).await.and_then(|out| {
                parse_counts(&out).map_err(|e| {
                    AppError::new(ErrorCode::DockerFailed, "The table sizes couldn't be read.")
                        .with_detail(e)
                })
            })?;
            let in_dump = table_data_entries(&toc.stdout);
            if in_dump < counts.len() {
                return Err(AppError::new(
                    ErrorCode::BackupInvalid,
                    format!(
                        "The backup holds the data of {in_dump} tables, the database has {}.",
                        counts.len()
                    ),
                ));
            }
            let postgres_version = self
                .query(cli, "show server_version")
                .await?
                .trim()
                .to_string();
            Ok((written, counts, postgres_version))
        }
        .await;

        let (written, counts, postgres_version) = match written {
            Ok(done) => done,
            Err(e) => {
                let _ = std::fs::remove_file(&partial);
                return Err(e);
            }
        };

        steps.next("Saving the backup");
        let meta = BackupMeta {
            schema: SIDECAR_SCHEMA,
            kind,
            created: created.to_rfc3339(),
            stack_version: stack_version.to_string(),
            app_version: self.app_version.to_string(),
            postgres_version,
            size_bytes: written.bytes,
            sha256: written.sha256,
            tables: counts,
            description,
        };
        if let Err(e) = std::fs::rename(&partial, &dump) {
            let _ = std::fs::remove_file(&partial);
            return Err(AppError::io("Couldn't save the backup", &e));
        }
        let json = serde_json::to_string_pretty(&meta).expect("serializable") + "\n";
        if let Err(e) =
            fsutil::write_atomic(&dump.with_extension(SIDECAR_EXT), json.as_bytes(), false)
        {
            // The dump itself is complete and checked: keep it, it is still a usable backup.
            log::warn!("backup saved without its details file: {e}");
        }
        let rows: u64 = meta.tables.values().sum();
        steps.log(format!(
            "Saved {} ({} tables, {rows} rows).",
            dump.display(),
            meta.tables.len()
        ));
        Ok(BackupInfo {
            file_name: format!("{stem}.{DUMP_EXT}"),
            kind: Some(kind),
            created: meta.created.clone(),
            stack_version: Some(meta.stack_version.clone()),
            postgres_version: Some(meta.postgres_version.clone()),
            size_bytes: meta.size_bytes,
            rows: Some(rows),
            tables: Some(meta.tables.len() as u32),
            description: meta.description.clone(),
            retained: (kind == BackupKind::Auto).then_some(Retained::Daily),
        })
    }

    /// One SQL statement in the database container, unaligned output without headers.
    pub(super) async fn query(
        &self,
        cli: &super::docker::DockerCli,
        sql: &str,
    ) -> Result<String, AppError> {
        let dir = self.runtime_dir.as_path();
        let out = cli
            .run_in(
                dir,
                compose::exec_args(
                    dir,
                    DB_SERVICE,
                    &[
                        "psql",
                        "-U",
                        DB_USER,
                        "-d",
                        DB_NAME,
                        "-At",
                        "-F",
                        "|",
                        "-v",
                        "ON_ERROR_STOP=1",
                        "-c",
                        sql,
                    ],
                ),
                QUERY_TIMEOUT,
            )
            .await
            .map_err(|e| run_failure("Reading the database", e))?;
        if out.success() {
            Ok(out.stdout)
        } else {
            Err(command_failure("Reading the database", &out.stderr))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{NaiveDate, TimeZone};

    fn at(y: i32, m: u32, d: u32, h: u32) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(y, m, d)
            .unwrap()
            .and_hms_opt(h, 0, 0)
            .unwrap()
    }

    #[test]
    fn names_sort_by_time_and_say_what_they_are() {
        let t = Local.with_ymd_and_hms(2026, 10, 25, 9, 12, 30).unwrap();
        assert_eq!(
            file_stem(&t, BackupKind::Manual, "5.0.0"),
            "arbodat-plus_2026-10-25_09-12-30_manual_v5.0.0"
        );
        assert_eq!(
            file_stem(&t, BackupKind::BeforeUpdate, "5.0.0-rc.1+build/7"),
            "arbodat-plus_2026-10-25_09-12-30_before-update_v5.0.0-rc.1_build_7"
        );
    }

    #[test]
    fn a_taken_name_gets_a_number() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(free_stem(dir.path(), "x"), "x");
        std::fs::write(dir.path().join("x.dump"), "").unwrap();
        assert_eq!(free_stem(dir.path(), "x"), "x-2");
        std::fs::write(dir.path().join("x-2.json"), "").unwrap();
        assert_eq!(free_stem(dir.path(), "x"), "x-3");
    }

    #[test]
    fn one_backup_a_day_for_a_year_keeps_7_daily_4_weekly_12_monthly() {
        // 400 daily backups, newest on 2026-10-25.
        let newest = at(2026, 10, 25, 9);
        let times: Vec<NaiveDateTime> = (0..400)
            .map(|d| newest - chrono::Duration::days(d))
            .collect();
        let pruned: HashSet<usize> = to_prune(&times, RETENTION).into_iter().collect();
        let kept: Vec<NaiveDateTime> = (0..times.len())
            .filter(|i| !pruned.contains(i))
            .map(|i| times[i])
            .collect();
        // The 7 newest days are all kept.
        for d in 0..7 {
            assert!(
                kept.contains(&(newest - chrono::Duration::days(d))),
                "day {d}"
            );
        }
        // Daily, weekly and monthly overlap: at most 7 + 4 + 12, at least 12 (the months).
        assert!(kept.len() <= 23 && kept.len() >= 12, "{} kept", kept.len());
        // Nothing older than about a year survives.
        assert!(
            kept.iter()
                .all(|t| *t > newest - chrono::Duration::days(366))
        );
        // One per month for the 12 newest months.
        let months: HashSet<(i32, u32)> = kept.iter().map(|t| (t.year(), t.month())).collect();
        assert_eq!(months.len(), 12);
    }

    #[test]
    fn kept_backups_say_why_daily_before_weekly_before_monthly() {
        let newest = at(2026, 10, 25, 9);
        let times: Vec<NaiveDateTime> = (0..120)
            .map(|d| newest - chrono::Duration::days(d))
            .collect();
        let why = retention(&times, RETENTION);
        // The 7 newest days are daily.
        for (d, reason) in why.iter().enumerate().take(7) {
            assert_eq!(*reason, Some(Retained::Daily), "day {d}");
        }
        let count = |r: Retained| why.iter().filter(|w| **w == Some(r)).count();
        assert_eq!(count(Retained::Daily), 7);
        assert!(count(Retained::Weekly) >= 1 && count(Retained::Weekly) <= 4);
        assert!(count(Retained::Monthly) >= 1);
        // Everything not kept is exactly what would be pruned.
        let pruned: HashSet<usize> = to_prune(&times, RETENTION).into_iter().collect();
        for (i, reason) in why.iter().enumerate() {
            assert_eq!(reason.is_none(), pruned.contains(&i), "{i}");
        }
    }

    #[test]
    fn the_list_says_why_an_automatic_backup_is_kept() {
        let dir = tempfile::tempdir().unwrap();
        write_backup(
            dir.path(),
            "arbodat-plus_a1",
            BackupKind::Auto,
            "2026-10-25T09:00:00+01:00",
        );
        write_backup(
            dir.path(),
            "arbodat-plus_a2",
            BackupKind::Auto,
            "2026-08-03T09:00:00+02:00",
        );
        write_backup(
            dir.path(),
            "arbodat-plus_m",
            BackupKind::Manual,
            "2026-10-24T09:00:00+02:00",
        );
        let list = list(dir.path(), None);
        let by_name = |n: &str| {
            list.backups
                .iter()
                .find(|b| b.file_name == n)
                .unwrap()
                .retained
        };
        assert_eq!(by_name("arbodat-plus_a1.dump"), Some(Retained::Daily));
        assert_eq!(
            by_name("arbodat-plus_a2.dump"),
            Some(Retained::Daily),
            "only two days with backups: both daily"
        );
        assert_eq!(
            by_name("arbodat-plus_m.dump"),
            None,
            "not an automatic backup"
        );
    }

    #[test]
    fn several_backups_on_one_day_keep_only_the_newest_of_that_day() {
        let times = vec![
            at(2026, 10, 25, 8),
            at(2026, 10, 25, 12),
            at(2026, 10, 25, 18),
        ];
        assert_eq!(to_prune(&times, RETENTION), vec![0, 1]);
    }

    #[test]
    fn few_backups_are_all_kept_and_the_newest_always() {
        let times = vec![at(2026, 1, 1, 9), at(2026, 3, 1, 9), at(2026, 10, 25, 9)];
        assert!(to_prune(&times, RETENTION).is_empty());
        let none = Keep {
            daily: 0,
            weekly: 0,
            monthly: 0,
        };
        assert_eq!(
            to_prune(&times, none),
            vec![0, 1],
            "the newest stays even with a zero policy"
        );
        assert!(to_prune(&[], RETENTION).is_empty());
    }

    fn write_backup(dir: &Path, stem: &str, kind: BackupKind, created: &str) {
        std::fs::write(dir.join(format!("{stem}.dump")), b"PGDMP").unwrap();
        let meta = BackupMeta {
            schema: SIDECAR_SCHEMA,
            kind,
            created: created.into(),
            stack_version: "5.0.0".into(),
            app_version: "5.0.0".into(),
            postgres_version: "16.15".into(),
            size_bytes: 5,
            sha256: "00".into(),
            tables: BTreeMap::from([("site".to_string(), 3), ("feature".to_string(), 4)]),
            description: (kind == BackupKind::Manual).then(|| "before the field trip".to_string()),
        };
        std::fs::write(
            dir.join(format!("{stem}.json")),
            serde_json::to_string(&meta).unwrap(),
        )
        .unwrap();
    }

    #[test]
    fn retention_only_ever_deletes_daily_backups_the_app_made() {
        let dir = tempfile::tempdir().unwrap();
        let d = dir.path();
        // Three automatic ones on the same day: the two older ones go.
        write_backup(
            d,
            "arbodat-plus_a1",
            BackupKind::Auto,
            "2026-10-25T08:00:00+01:00",
        );
        write_backup(
            d,
            "arbodat-plus_a2",
            BackupKind::Auto,
            "2026-10-25T12:00:00+01:00",
        );
        write_backup(
            d,
            "arbodat-plus_a3",
            BackupKind::Auto,
            "2026-10-25T18:00:00+01:00",
        );
        // Same day, other kinds: never touched.
        write_backup(
            d,
            "arbodat-plus_m1",
            BackupKind::Manual,
            "2026-10-25T07:00:00+01:00",
        );
        write_backup(
            d,
            "arbodat-plus_u1",
            BackupKind::BeforeUpdate,
            "2026-10-25T07:30:00+01:00",
        );
        write_backup(
            d,
            "arbodat-plus_r1",
            BackupKind::BeforeRestore,
            "2026-10-25T07:40:00+01:00",
        );
        // Not the app's name, or no sidecar: never touched.
        write_backup(
            d,
            "my-own-copy",
            BackupKind::Auto,
            "2026-10-25T06:00:00+01:00",
        );
        std::fs::write(d.join("arbodat-plus_nosidecar.dump"), b"PGDMP").unwrap();

        let mut deleted = prune_auto_backups(d);
        deleted.sort();
        assert_eq!(deleted, ["arbodat-plus_a1.dump", "arbodat-plus_a2.dump"]);
        for gone in ["arbodat-plus_a1", "arbodat-plus_a2"] {
            assert!(!d.join(format!("{gone}.dump")).exists());
            assert!(!d.join(format!("{gone}.json")).exists());
        }
        for kept in [
            "arbodat-plus_a3.dump",
            "arbodat-plus_m1.dump",
            "arbodat-plus_u1.dump",
            "arbodat-plus_r1.dump",
            "my-own-copy.dump",
            "arbodat-plus_nosidecar.dump",
        ] {
            assert!(d.join(kept).exists(), "{kept}");
        }
    }

    #[test]
    fn the_list_is_newest_first_and_shows_foreign_dumps_too() {
        let dir = tempfile::tempdir().unwrap();
        let d = dir.path();
        write_backup(
            d,
            "arbodat-plus_old",
            BackupKind::Manual,
            "2026-01-01T09:00:00+01:00",
        );
        write_backup(
            d,
            "arbodat-plus_new",
            BackupKind::Auto,
            "2026-10-25T09:00:00+01:00",
        );
        std::fs::write(d.join("from-v4.dump"), b"PGDMP-older").unwrap();
        std::fs::write(d.join("notes.txt"), b"not a backup").unwrap();
        let list = list(d, None);
        let names: Vec<&str> = list.backups.iter().map(|b| b.file_name.as_str()).collect();
        assert_eq!(names.len(), 3);
        assert!(names.contains(&"from-v4.dump"));
        let new = names
            .iter()
            .position(|n| *n == "arbodat-plus_new.dump")
            .unwrap();
        let old = names
            .iter()
            .position(|n| *n == "arbodat-plus_old.dump")
            .unwrap();
        assert!(new < old);
        let mine = &list.backups[new];
        assert_eq!(
            (mine.kind, mine.rows, mine.tables),
            (Some(BackupKind::Auto), Some(7), Some(2))
        );
        let foreign = list
            .backups
            .iter()
            .find(|b| b.file_name == "from-v4.dump")
            .unwrap();
        assert_eq!((foreign.kind, foreign.rows), (None, None));
        assert_eq!(foreign.size_bytes, 11);
    }

    #[test]
    fn a_daily_backup_is_recognised_per_local_day() {
        let dir = tempfile::tempdir().unwrap();
        let created = Local.with_ymd_and_hms(2026, 10, 25, 9, 0, 0).unwrap();
        write_backup(
            dir.path(),
            "arbodat-plus_a",
            BackupKind::Auto,
            &created.to_rfc3339(),
        );
        write_backup(
            dir.path(),
            "arbodat-plus_m",
            BackupKind::Manual,
            &Local
                .with_ymd_and_hms(2026, 10, 26, 9, 0, 0)
                .unwrap()
                .to_rfc3339(),
        );
        assert!(has_auto_backup_on(
            dir.path(),
            NaiveDate::from_ymd_opt(2026, 10, 25).unwrap()
        ));
        assert!(
            !has_auto_backup_on(dir.path(), NaiveDate::from_ymd_opt(2026, 10, 26).unwrap()),
            "a manual backup doesn't count as the daily one"
        );
        assert!(!has_auto_backup_on(
            &dir.path().join("missing"),
            NaiveDate::from_ymd_opt(2026, 10, 25).unwrap()
        ));
    }

    #[test]
    fn leftovers_of_an_interrupted_backup_are_removed_and_nothing_else() {
        let dir = tempfile::tempdir().unwrap();
        let d = dir.path();
        std::fs::write(d.join("arbodat-plus_x.dump.partial"), b"half").unwrap();
        std::fs::write(d.join("someone-elses.dump.partial"), b"half").unwrap();
        std::fs::write(d.join("arbodat-plus_y.dump"), b"PGDMP").unwrap();
        remove_partials(d);
        assert!(!d.join("arbodat-plus_x.dump.partial").exists());
        assert!(d.join("someone-elses.dump.partial").exists());
        assert!(d.join("arbodat-plus_y.dump").exists());
    }

    #[test]
    fn descriptions_are_tidied_and_limited() {
        assert_eq!(clean_description(None).unwrap(), None);
        assert_eq!(clean_description(Some("   ")).unwrap(), None);
        assert_eq!(
            clean_description(Some("  before  the\nfield trip ")).unwrap(),
            Some("before the field trip".into())
        );
        assert_eq!(
            clean_description(Some("äöü – 25 characters long!")).unwrap(),
            Some("äöü – 25 characters long!".into()),
            "25 characters, counted as characters, not bytes"
        );
        let too_long = clean_description(Some("this note is longer than 25")).unwrap_err();
        assert_eq!(too_long.code, ErrorCode::InvalidInput);
    }

    #[test]
    fn sidecars_without_a_description_still_load() {
        let old = r#"{"schema":1,"kind":"auto","created":"2026-10-25T09:00:00+01:00","stackVersion":"5.0.0","appVersion":"5.0.0","postgresVersion":"16.15","sizeBytes":5,"sha256":"00","tables":{}}"#;
        let meta: BackupMeta = serde_json::from_str(old).unwrap();
        assert_eq!(meta.description, None);
    }

    #[test]
    fn the_list_carries_the_description() {
        let dir = tempfile::tempdir().unwrap();
        write_backup(
            dir.path(),
            "arbodat-plus_m",
            BackupKind::Manual,
            "2026-10-25T09:00:00+01:00",
        );
        let list = list(dir.path(), None);
        assert_eq!(
            list.backups[0].description.as_deref(),
            Some("before the field trip")
        );
    }

    #[test]
    fn deleting_removes_the_backup_and_its_details_and_nothing_else() {
        let dir = tempfile::tempdir().unwrap();
        let d = dir.path();
        write_backup(
            d,
            "arbodat-plus_a",
            BackupKind::Manual,
            "2026-10-25T09:00:00+01:00",
        );
        write_backup(
            d,
            "arbodat-plus_b",
            BackupKind::Manual,
            "2026-10-25T10:00:00+01:00",
        );
        std::fs::write(d.join("from-v4.dump"), b"PGDMP").unwrap();
        delete(d, "arbodat-plus_a.dump").unwrap();
        assert!(!d.join("arbodat-plus_a.dump").exists());
        assert!(!d.join("arbodat-plus_a.json").exists());
        assert!(d.join("arbodat-plus_b.dump").exists() && d.join("arbodat-plus_b.json").exists());
        delete(d, "from-v4.dump").unwrap();
        assert!(!d.join("from-v4.dump").exists());
        assert_eq!(
            delete(d, "arbodat-plus_a.dump").unwrap_err().code,
            ErrorCode::InvalidInput
        );
    }

    #[test]
    fn deleting_reaches_nothing_outside_the_backup_folder() {
        let outer = tempfile::tempdir().unwrap();
        let folder = outer.path().join("backups");
        std::fs::create_dir(&folder).unwrap();
        std::fs::write(outer.path().join("precious.dump"), b"PGDMP").unwrap();
        std::fs::write(folder.join("notes.txt"), b"keep").unwrap();
        for name in [
            "../precious.dump",
            "..",
            "",
            "sub/x.dump",
            "sub\\x.dump",
            "notes.txt",
            ".hidden.dump",
            "/etc/passwd",
        ] {
            assert_eq!(
                delete(&folder, name).unwrap_err().code,
                ErrorCode::InvalidInput,
                "{name:?}"
            );
        }
        assert!(outer.path().join("precious.dump").exists());
        assert!(folder.join("notes.txt").exists());
    }

    #[test]
    fn row_counts_and_table_of_contents_are_read() {
        let counts = parse_counts("site|3\nfeature|40\n\n").unwrap();
        assert_eq!(
            counts,
            BTreeMap::from([("feature".into(), 40), ("site".into(), 3)])
        );
        assert!(parse_counts("site|x").is_err());
        assert!(parse_counts("garbage").is_err());
        let toc = ";\n; Archive created at 2026-10-25\n3500; 0 16390 TABLE DATA public site postgres\n3501; 0 16400 TABLE DATA public feature postgres\n2200; 2615 2200 SCHEMA - public pg_database_owner\n";
        assert_eq!(table_data_entries(toc), 2);
    }
}
