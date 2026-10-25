//! The daily automatic backup: while the app is open and ArboDat+ is running, the first time after
//! midnight (looked at every few minutes). Afterwards the retention policy thins out the older
//! automatic backups (see `runtime::backup`). It never starts ArboDat+ for a backup, and it never
//! gets in the way of something the user started: if another operation runs, it waits.

use std::sync::{Mutex, PoisonError};
use std::time::Duration;

use chrono::Local;
use tauri::{AppHandle, Manager};

use crate::runtime::RuntimeManager;
use crate::runtime::backup::{self, BackupKind};
use crate::runtime::error::ErrorCode;
use crate::runtime::model::{ProgressEvent, StackPhase};
use crate::settings::{Mode, SettingsStore};

const FIRST_LOOK: Duration = Duration::from_secs(2 * 60);
const EVERY: Duration = Duration::from_secs(10 * 60);

/// Why the last daily backup failed, for the Control Center; cleared by the next one that works.
#[derive(Default)]
pub struct AutoBackupState(Mutex<Option<String>>);

impl AutoBackupState {
    pub fn failure(&self) -> Option<String> {
        self.0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    fn set(&self, failure: Option<String>) {
        *self.0.lock().unwrap_or_else(PoisonError::into_inner) = failure;
    }
}

/// Runs for the life of the app.
pub async fn run(app: AppHandle) {
    tokio::time::sleep(FIRST_LOOK).await;
    loop {
        once(&app).await;
        tokio::time::sleep(EVERY).await;
    }
}

async fn once(app: &AppHandle) {
    let store = app.state::<SettingsStore>();
    if store.get().mode != Mode::Local {
        return;
    }
    let folder = store.backup_folder();
    if backup::has_auto_backup_on(&folder, Local::now().date_naive()) {
        return;
    }
    let runtime = app.state::<RuntimeManager>();
    if runtime.current_operation().is_some() {
        return;
    }
    // Only a running ArboDat+: a stopped one isn't changing, and isn't started for this.
    if runtime.status().await.stack.phase != StackPhase::Running {
        return;
    }
    let quiet = |event: ProgressEvent| {
        if let ProgressEvent::Log { text } = event {
            log::debug!("daily backup: {text}");
        }
    };
    let state = app.state::<AutoBackupState>();
    match runtime
        .backup(BackupKind::Auto, None, &folder, &quiet)
        .await
    {
        Ok(info) => {
            log::info!("daily backup saved: {}", info.file_name);
            state.set(None);
            let deleted = backup::prune_auto_backups(&folder);
            if !deleted.is_empty() {
                log::info!("retention removed {} older daily backups", deleted.len());
            }
        }
        // Something else started in the meantime: try again next round.
        Err(e) if e.code == ErrorCode::Busy => {}
        Err(e) => {
            log::warn!("daily backup failed: {} {:?}", e.message, e.detail);
            state.set(Some(match e.detail {
                Some(detail) => format!("{} ({})", e.message, detail.lines().last().unwrap_or("")),
                None => e.message,
            }));
        }
    }
}
