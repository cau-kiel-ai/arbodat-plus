//! Restoring a backup into the local installation.
//!
//! The order protects the data at every step:
//! 1. the backup is checked first (format, checksum against its details file, read completely, its
//!    PostgreSQL and ArboDat+ versions not newer than this installation's);
//! 2. a backup of the current data is made ("before restore"); if that fails, nothing happens;
//! 3. web-api and frontend are stopped, so nothing writes during the restore;
//! 4. the restore is **one transaction**: drop the `public` schema, recreate it, load the backup,
//!    check every table's row count against the details file, and only then commit. A cut-off
//!    or damaged file, an SQL error or a wrong count rolls everything back: the old data stays as
//!    it was. (The commit is only sent after `pg_restore` itself finished without error.)
//! 5. ArboDat+ is put back the way it was: running again (web-api upgrades an older schema on
//!    start), or stopped.

use std::path::{Path, PathBuf};
use std::time::Duration;

use semver::Version;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::RuntimeManager;
use super::backup::{self, BackupInfo, BackupKind, BackupMeta, DB_NAME, DB_SERVICE, DB_USER};
use super::compose;
use super::docker::DockerCli;
use super::error::{AppError, ErrorCode};
use super::lifecycle::{Emit, Steps, command_failure, plan_start, run_failure, wait_until_ready};
use super::model::{Operation, ProgressEvent};
use super::state;
use super::template::DATA_VOLUME;

const CHECK_TIMEOUT: Duration = Duration::from_secs(30 * 60);
const RESTORE_TIMEOUT: Duration = Duration::from_secs(60 * 60);
/// The first bytes of every `pg_dump --format=custom` file.
const CUSTOM_FORMAT_MAGIC: &[u8] = b"PGDMP";
/// The services that read or write the data while ArboDat+ runs.
const APP_SERVICES: [&str; 2] = ["web-api", "frontend"];

/// What to restore: a backup in the backup folder (by its file name), or a file the user chose.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, TS)]
#[serde(
    tag = "from",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum RestoreSource {
    Folder { file_name: String },
    File { path: String },
}

/// A file chosen with "Restore from file", before anything is done with it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RestoreCandidate {
    pub path: String,
    pub backup: BackupInfo,
}

/// How a restore ended well.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RestoreOutcome {
    /// The backup of the data from before the restore.
    pub safety_backup: String,
    /// Rows now in the database (from the details file; `None` for a file from elsewhere).
    #[ts(type = "number | null")]
    pub rows: Option<u64>,
}

// ---------------------------------------------------------------------------------------------
// Decisions (pure)
// ---------------------------------------------------------------------------------------------

/// `16` from `16.15 (Debian 16.15-1.pgdg13+2)` or `16.15`.
pub fn major_version(version: &str) -> Option<u32> {
    version
        .trim()
        .split(|c: char| !c.is_ascii_digit())
        .next()
        .and_then(|m| m.parse().ok())
}

/// The PostgreSQL version a dump was made from, out of `pg_restore --list`
/// (`;     Dumped from database version: 16.15 (Debian ...)`).
pub fn dumped_from(list: &str) -> Option<u32> {
    list.lines()
        .find_map(|l| {
            l.trim_start_matches([';', ' '])
                .strip_prefix("Dumped from database version:")
        })
        .and_then(major_version)
}

/// May this backup be restored here? `meta` is its details file (if any), `dump_pg` the PostgreSQL
/// major version it was made from, `server_pg` the one running now.
pub fn plan_restore(
    meta: Option<&BackupMeta>,
    app_version: &Version,
    dump_pg: Option<u32>,
    server_pg: u32,
) -> Result<(), AppError> {
    if let Some(dump_pg) = dump_pg
        && dump_pg > server_pg
    {
        return Err(AppError::new(
            ErrorCode::BackupInvalid,
            format!(
                "This backup comes from a newer database (PostgreSQL {dump_pg}) than this installation's \
                 (PostgreSQL {server_pg}). Please install the newest app first."
            ),
        ));
    }
    if let Some(meta) = meta
        && let Ok(made_by) = Version::parse(&meta.stack_version)
        && made_by > *app_version
    {
        return Err(AppError::new(
            ErrorCode::NewerThanApp,
            format!(
                "This backup was made with a newer ArboDat+ ({made_by}) than this app ({app_version}). \
                 Please install the newest app first."
            ),
        ));
    }
    Ok(())
}

/// The file behind a source. A folder source must be a plain file name in the backup folder.
pub fn resolve(source: &RestoreSource, folder: &Path) -> Result<PathBuf, AppError> {
    match source {
        RestoreSource::Folder { file_name } => backup::in_folder(folder, file_name),
        RestoreSource::File { path } => {
            let path = PathBuf::from(path);
            if path.is_absolute() && path.is_file() {
                Ok(path)
            } else {
                Err(AppError::new(
                    ErrorCode::InvalidInput,
                    "That file isn't there any more.",
                ))
            }
        }
    }
}

/// Is this a `pg_dump --format=custom` file? (Plain SQL dumps aren't restored by the app.)
pub fn is_custom_format(path: &Path) -> std::io::Result<bool> {
    use std::io::Read;
    let mut head = [0u8; 5];
    let mut file = std::fs::File::open(path)?;
    match file.read_exact(&mut head) {
        Ok(()) => Ok(head == CUSTOM_FORMAT_MAGIC),
        Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => Ok(false),
        Err(e) => Err(e),
    }
}

pub fn sha256_of(path: &Path) -> std::io::Result<String> {
    use sha2::{Digest, Sha256};
    use std::io::Read;
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect())
}

/// What runs before the backup's SQL, in the same transaction.
pub const BEFORE: &str = "SET client_min_messages = warning;\nBEGIN;\nDROP SCHEMA public CASCADE;\nCREATE SCHEMA public;";

/// What runs after it, still in the transaction: a check of every table's row count against the
/// details file (any difference aborts the transaction), then the commit. Table names come from a
/// file on disk, so only plain names are used; the others are logged and not checked.
pub fn after(meta: Option<&BackupMeta>) -> String {
    let mut checks = String::new();
    if let Some(meta) = meta {
        for (table, rows) in &meta.tables {
            if table.is_empty() || !table.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
                log::warn!("restore: not checking the row count of {table:?} (unusual name)");
                continue;
            }
            checks.push_str(&format!(
                "  IF (SELECT count(*) FROM public.\"{table}\") <> {rows} THEN\n    RAISE EXCEPTION 'restore check: table {table} has % rows, the backup has {rows}', (SELECT count(*) FROM public.\"{table}\");\n  END IF;\n"
            ));
        }
    }
    if checks.is_empty() {
        "COMMIT;".to_string()
    } else {
        format!("DO $arbodat_check$\nBEGIN\n{checks}END\n$arbodat_check$;\nCOMMIT;")
    }
}

/// The shell side, inside the database container. stdin is the dump. The `|| exit 1` matters: if
/// `pg_restore` fails half-way, the commit is never sent, and psql ending in an open transaction
/// rolls it back.
pub const SCRIPT: &str = r#"set -o pipefail
{
  printf '%s\n' "$ARBODAT_BEFORE"
  pg_restore --no-owner --no-acl -f - || exit 1
  printf '%s\n' "$ARBODAT_AFTER"
} | psql -X -q -U "$ARBODAT_USER" -d "$ARBODAT_DB" -v ON_ERROR_STOP=1"#;

// ---------------------------------------------------------------------------------------------
// The operation
// ---------------------------------------------------------------------------------------------

/// Turns the nested backup's steps into log lines, so the restore keeps its own step numbers.
fn as_log<'a>(emit: Emit<'a>) -> impl Fn(ProgressEvent) + Send + Sync + 'a {
    move |event| match event {
        ProgressEvent::Step { label, .. } => emit(ProgressEvent::Log {
            text: format!("Backup: {label}"),
        }),
        other => emit(other),
    }
}

impl RuntimeManager {
    /// Checks a file chosen with "Restore from file" (nothing is changed).
    pub fn inspect_restore_file(&self, path: &Path) -> Result<RestoreCandidate, AppError> {
        if !is_custom_format(path).map_err(|e| AppError::io("Couldn't read that file", &e))? {
            return Err(AppError::new(
                ErrorCode::BackupInvalid,
                "That isn't an ArboDat+ backup: ArboDat+ can restore PostgreSQL dumps in the custom \
                 format (made with pg_dump -Fc).",
            ));
        }
        let (meta, info) = backup::describe(path);
        plan_restore(meta.as_ref(), &self.app_version, None, u32::MAX)?;
        Ok(RestoreCandidate {
            path: path.display().to_string(),
            backup: info,
        })
    }

    pub async fn restore(
        &self,
        dump: &Path,
        folder: &Path,
        emit: Emit<'_>,
    ) -> Result<RestoreOutcome, AppError> {
        let _guard = self.begin(Operation::Restore)?;
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
        let record = plan_start(&loaded, &engine, &self.app_version, volume_exists)?;
        let containers = compose::ps(&cli, dir)
            .await
            .map_err(|e| command_failure("Checking the containers", &e))?;
        let running = |service: &str| {
            containers
                .iter()
                .any(|c| c.service == service && c.state == "running")
        };
        let database_was_running = running(DB_SERVICE);
        let app_was_running = APP_SERVICES.iter().any(|s| running(s));

        steps.next("Making sure the database is running");
        if database_was_running {
            steps.log("The database is running.");
        } else {
            steps.log("ArboDat+ is stopped: starting only the database for the restore.");
            let started = compose::up_services(&cli, dir, &[DB_SERVICE], |line| {
                emit(ProgressEvent::Log {
                    text: line.to_string(),
                })
            })
            .await;
            let started = match started {
                Ok(out) if out.success() => Ok(()),
                Ok(out) => Err(command_failure("Starting the database", &out.stderr)),
                Err(e) => Err(run_failure("Starting the database", e)),
            };
            if let Err(e) = started {
                // It may have started half-way: stop it again, the restore is off.
                if let Err(stop) = self.put_back(&cli, false, false, record.port, emit).await {
                    log::warn!("could not stop the database again: {}", stop.message);
                }
                return Err(e);
            }
        }

        let result = self
            .restore_with_database_up(&cli, dump, folder, &mut steps, emit)
            .await;

        // Whatever happened, ArboDat+ ends up the way it was: running, or stopped.
        steps.last(if app_was_running {
            "Starting ArboDat+ again"
        } else if !database_was_running {
            "Stopping the database again"
        } else {
            "Finishing"
        });
        let put_back = self
            .put_back(
                &cli,
                database_was_running,
                app_was_running,
                record.port,
                emit,
            )
            .await;
        match (result, put_back) {
            (Ok(outcome), Ok(())) => Ok(outcome),
            (Ok(outcome), Err(e)) => Err(AppError::new(
                e.code,
                format!(
                    "The backup was restored, but ArboDat+ didn't start again: {} The data from \
                     before the restore is in the backup {}.",
                    e.message, outcome.safety_backup
                ),
            )
            .with_detail(e.detail.unwrap_or_default())),
            (Err(e), _) => Err(e),
        }
    }

    /// Steps 4 to 7, with the database container running.
    async fn restore_with_database_up(
        &self,
        cli: &DockerCli,
        dump: &Path,
        folder: &Path,
        steps: &mut Steps<'_>,
        emit: Emit<'_>,
    ) -> Result<RestoreOutcome, AppError> {
        let dir = self.runtime_dir.as_path();

        steps.next("Checking the backup");
        if !is_custom_format(dump).map_err(|e| AppError::io("Couldn't read the backup", &e))? {
            return Err(AppError::new(
                ErrorCode::BackupInvalid,
                "That file isn't a PostgreSQL backup in the custom format (pg_dump -Fc). Nothing was changed.",
            ));
        }
        let (meta, _) = backup::describe(dump);
        if let Some(meta) = &meta {
            let actual =
                sha256_of(dump).map_err(|e| AppError::io("Couldn't read the backup", &e))?;
            if actual != meta.sha256 {
                return Err(AppError::new(
                    ErrorCode::BackupInvalid,
                    "The backup file has changed since it was made (its checksum doesn't match). Nothing was changed.",
                ));
            }
            steps.log("The checksum matches.");
        } else {
            steps.log("This file wasn't made by this app: there is no checksum and no row counts to compare.");
        }
        let full = cli
            .run_with_input(
                dir,
                compose::exec_args(dir, DB_SERVICE, &["pg_restore", "-f", "/dev/null"]),
                CHECK_TIMEOUT,
                dump,
            )
            .await
            .map_err(|e| run_failure("Checking the backup", e))?;
        if !full.success() {
            return Err(AppError::new(
                ErrorCode::BackupInvalid,
                "The backup can't be read completely (it may be cut off or damaged). Nothing was changed.",
            )
            .with_detail(full.stderr));
        }
        let list = cli
            .run_with_input(
                dir,
                compose::exec_args(dir, DB_SERVICE, &["pg_restore", "--list"]),
                CHECK_TIMEOUT,
                dump,
            )
            .await
            .map_err(|e| run_failure("Checking the backup", e))?;
        if !list.success() {
            return Err(AppError::new(
                ErrorCode::BackupInvalid,
                "The backup's table of contents can't be read. Nothing was changed.",
            )
            .with_detail(list.stderr));
        }
        let server_pg = self
            .query(cli, "show server_version_num")
            .await?
            .trim()
            .parse::<u32>()
            .map(|n| n / 10_000)
            .map_err(|_| {
                AppError::new(
                    ErrorCode::DockerFailed,
                    "The database version couldn't be read.",
                )
            })?;
        plan_restore(
            meta.as_ref(),
            &self.app_version,
            dumped_from(&list.stdout),
            server_pg,
        )?;

        steps.next("Backing up the current data");
        let nested = as_log(emit);
        let safety = self
            .backup_within_operation(BackupKind::BeforeRestore, None, folder, &nested)
            .await
            .map_err(|e| {
                AppError::new(
                    e.code,
                    format!(
                        "The current data couldn't be backed up, so nothing was restored. {}",
                        e.message
                    ),
                )
                .with_detail(e.detail.unwrap_or_default())
            })?;
        steps.log(format!(
            "The current data is saved in {}.",
            safety.file_name
        ));

        steps.next("Stopping ArboDat+ for the restore");
        let out = compose::stop_services(cli, dir, &APP_SERVICES, |line| {
            emit(ProgressEvent::Log {
                text: line.to_string(),
            })
        })
        .await
        .map_err(|e| run_failure("Stopping ArboDat+", e))?;
        if !out.success() {
            return Err(command_failure("Stopping ArboDat+", &out.stderr));
        }

        steps.next("Restoring the data");
        let after = after(meta.as_ref());
        let env = |key: &str, value: &str| format!("{key}={value}");
        let (before_env, after_env) = (env("ARBODAT_BEFORE", BEFORE), env("ARBODAT_AFTER", &after));
        let (user_env, db_env) = (env("ARBODAT_USER", DB_USER), env("ARBODAT_DB", DB_NAME));
        let args = compose::args(
            dir,
            &[
                "exec",
                "-T",
                "-e",
                &before_env,
                "-e",
                &after_env,
                "-e",
                &user_env,
                "-e",
                &db_env,
                DB_SERVICE,
                "bash",
                "-c",
                SCRIPT,
            ],
        );
        let out = cli
            .run_with_input(dir, args, RESTORE_TIMEOUT, dump)
            .await
            .map_err(|e| run_failure("Restoring the data", e))?;
        if !out.success() {
            return Err(AppError::new(
                ErrorCode::RestoreFailed,
                "The backup couldn't be restored. The transaction was rolled back: your data is unchanged.",
            )
            .with_detail(super::error::tail_lines(&out.stderr, 12)));
        }
        let rows = meta.as_ref().map(|m| m.tables.values().sum());
        steps.log(match rows {
            Some(rows) => format!("Restored and checked: {rows} rows."),
            None => "Restored.".to_string(),
        });
        Ok(RestoreOutcome {
            safety_backup: safety.file_name,
            rows,
        })
    }

    /// ArboDat+ as it was before: everything running again (and answering), or the database stopped
    /// again if only the restore started it.
    async fn put_back(
        &self,
        cli: &DockerCli,
        database_was_running: bool,
        app_was_running: bool,
        port: u16,
        emit: Emit<'_>,
    ) -> Result<(), AppError> {
        let dir = self.runtime_dir.as_path();
        if app_was_running {
            self.bring_up(cli, port, emit).await?;
            return wait_until_ready(port, emit).await;
        }
        if !database_was_running {
            let out = compose::stop_services(cli, dir, &[DB_SERVICE], |line| {
                emit(ProgressEvent::Log {
                    text: line.to_string(),
                })
            })
            .await
            .map_err(|e| run_failure("Stopping the database", e))?;
            if !out.success() {
                return Err(command_failure("Stopping the database", &out.stderr));
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    fn meta(version: &str, tables: &[(&str, u64)]) -> BackupMeta {
        BackupMeta {
            schema: backup::SIDECAR_SCHEMA,
            kind: BackupKind::Manual,
            created: "2026-10-25T09:00:00+01:00".into(),
            stack_version: version.into(),
            app_version: version.into(),
            postgres_version: "16.15".into(),
            size_bytes: 1,
            sha256: "00".into(),
            tables: tables
                .iter()
                .map(|(t, n)| (t.to_string(), *n))
                .collect::<BTreeMap<_, _>>(),
            description: None,
        }
    }

    #[test]
    fn postgres_versions_are_read_from_the_dump_header() {
        let list = ";\n; Archive created at 2026-10-25 16:35:01 UTC\n;     dbname: postgres\n;     Dumped from database version: 16.15 (Debian 16.15-1.pgdg13+2)\n;     Dumped by pg_dump version: 17.2\n";
        assert_eq!(dumped_from(list), Some(16));
        assert_eq!(dumped_from("; nothing here"), None);
        assert_eq!(major_version("16.15 (Debian)"), Some(16));
        assert_eq!(major_version("9.6.24"), Some(9));
        assert_eq!(major_version(""), None);
    }

    #[test]
    fn a_backup_from_a_newer_database_or_app_is_refused() {
        let app = Version::parse("5.0.0").unwrap();
        assert!(plan_restore(Some(&meta("5.0.0", &[])), &app, Some(16), 16).is_ok());
        assert!(
            plan_restore(Some(&meta("4.9.0", &[])), &app, Some(15), 16).is_ok(),
            "older is fine"
        );
        assert!(
            plan_restore(None, &app, None, 16).is_ok(),
            "unknown origin is allowed"
        );
        assert_eq!(
            plan_restore(None, &app, Some(17), 16).unwrap_err().code,
            ErrorCode::BackupInvalid
        );
        assert_eq!(
            plan_restore(Some(&meta("5.1.0", &[])), &app, Some(16), 16)
                .unwrap_err()
                .code,
            ErrorCode::NewerThanApp
        );
    }

    #[test]
    fn the_transaction_checks_every_table_and_commits_last() {
        let script = after(Some(&meta(
            "5.0.0",
            &[("site", 3), ("c14_laboratory", 301)],
        )));
        assert!(script.contains("FROM public.\"site\") <> 3"));
        assert!(script.contains("FROM public.\"c14_laboratory\") <> 301"));
        assert!(script.trim_end().ends_with("COMMIT;"));
        assert_eq!(script.matches("COMMIT").count(), 1);
        assert!(BEFORE.contains("BEGIN;") && BEFORE.contains("DROP SCHEMA public CASCADE;"));
        assert!(!BEFORE.contains("COMMIT"));
        // Without details there is nothing to compare; still exactly one commit at the end.
        assert_eq!(after(None), "COMMIT;");
    }

    #[test]
    fn table_names_from_the_details_file_cannot_inject_sql() {
        let script = after(Some(&meta(
            "5.0.0",
            &[
                ("site", 3),
                ("x\"); DROP TABLE site; --", 1),
                ("a$arbodat_check$b", 1),
                ("", 1),
            ],
        )));
        assert!(script.contains("\"site\""));
        assert!(!script.contains("DROP TABLE"));
        assert_eq!(
            script.matches("$arbodat_check$").count(),
            2,
            "only the block's own delimiters"
        );
    }

    #[test]
    fn the_commit_is_only_sent_after_pg_restore_succeeded() {
        let restore = SCRIPT.find("pg_restore").unwrap();
        assert!(SCRIPT[restore..].starts_with("pg_restore --no-owner --no-acl -f - || exit 1"));
        assert!(
            SCRIPT.find("ARBODAT_AFTER").unwrap() > restore,
            "the commit comes after the restore"
        );
        assert!(SCRIPT.contains("set -o pipefail"));
        assert!(SCRIPT.contains("ON_ERROR_STOP=1"));
        assert!(
            !SCRIPT.contains("--single-transaction"),
            "our own transaction, with the schema drop inside"
        );
    }

    #[test]
    fn folder_sources_stay_in_the_backup_folder() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("arbodat-plus_a.dump"), b"PGDMP").unwrap();
        let ok = resolve(
            &RestoreSource::Folder {
                file_name: "arbodat-plus_a.dump".into(),
            },
            dir.path(),
        )
        .unwrap();
        assert_eq!(ok, dir.path().join("arbodat-plus_a.dump"));
        for name in ["../x.dump", "/etc/passwd", "a/b.dump", "notes.txt"] {
            assert!(
                resolve(
                    &RestoreSource::Folder {
                        file_name: name.into()
                    },
                    dir.path()
                )
                .is_err(),
                "{name}"
            );
        }
        assert!(
            resolve(
                &RestoreSource::File {
                    path: "relative.dump".into()
                },
                dir.path()
            )
            .is_err()
        );
        assert!(
            resolve(
                &RestoreSource::File {
                    path: dir.path().join("missing.dump").display().to_string()
                },
                dir.path()
            )
            .is_err()
        );
    }

    #[test]
    fn only_custom_format_dumps_are_accepted_and_hashed_correctly() {
        let dir = tempfile::tempdir().unwrap();
        let good = dir.path().join("a.dump");
        std::fs::write(&good, b"PGDMP\x01\x0f").unwrap();
        let sql = dir.path().join("b.sql");
        std::fs::write(&sql, b"-- PostgreSQL database dump\n").unwrap();
        let tiny = dir.path().join("c.dump");
        std::fs::write(&tiny, b"PG").unwrap();
        assert!(is_custom_format(&good).unwrap());
        assert!(!is_custom_format(&sql).unwrap());
        assert!(!is_custom_format(&tiny).unwrap());
        // printf PGDMP | shasum -a 256
        std::fs::write(&good, b"PGDMP").unwrap();
        assert_eq!(
            sha256_of(&good).unwrap(),
            "b5a26a21290c39819235a235b8ed66b3bd98ed90c8316c8949bfbb7419cac878"
        );
    }

    #[test]
    fn sources_are_read_from_the_control_center() {
        let folder: RestoreSource =
            serde_json::from_str(r#"{"from":"folder","fileName":"arbodat-plus_a.dump"}"#).unwrap();
        assert_eq!(
            folder,
            RestoreSource::Folder {
                file_name: "arbodat-plus_a.dump".into()
            }
        );
        let file: RestoreSource =
            serde_json::from_str(r#"{"from":"file","path":"/x/y.dump"}"#).unwrap();
        assert_eq!(
            file,
            RestoreSource::File {
                path: "/x/y.dump".into()
            }
        );
    }
}
