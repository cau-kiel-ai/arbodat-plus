//! The app's own settings (`settings.json` in the data directory): what the user chose, as opposed
//! to the installation record (`runtime/state.json`, which says what is installed).

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::runtime::fsutil;

const FILE: &str = "settings.json";
const BACKUP_FOLDER_NAME: &str = "ArboDat+ Backups";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Start ArboDat+ (if it is installed and stopped) when the app opens.
    pub auto_start: bool,
    /// Where backups go; `None` = the default folder.
    pub backup_folder: Option<PathBuf>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            auto_start: true,
            backup_folder: None,
        }
    }
}

/// What the settings screen shows.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SettingsView {
    pub auto_start: bool,
    /// The folder backups go to: the chosen one, or the default.
    pub backup_folder: String,
    pub backup_folder_is_default: bool,
}

/// A missing or unreadable file means defaults: settings are conveniences, never data.
fn load(dir: &Path) -> Settings {
    let path = dir.join(FILE);
    match std::fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_else(|e| {
            log::warn!("{} is damaged ({e}); using the defaults", path.display());
            Settings::default()
        }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Settings::default(),
        Err(e) => {
            log::warn!(
                "could not read {} ({e}); using the defaults",
                path.display()
            );
            Settings::default()
        }
    }
}

fn save(dir: &Path, settings: &Settings) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    let json = serde_json::to_string_pretty(settings).map_err(std::io::Error::other)? + "\n";
    fsutil::write_atomic(&dir.join(FILE), json.as_bytes(), false)
}

pub fn default_backup_folder(documents: &Path) -> PathBuf {
    documents.join(BACKUP_FOLDER_NAME)
}

/// Can files be created in `dir`? (A folder the user picked may be read-only.)
pub fn check_writable(dir: &Path) -> std::io::Result<()> {
    let probe = dir.join(".arbodat-plus-write-test");
    std::fs::write(&probe, b"")?;
    std::fs::remove_file(probe)
}

pub struct SettingsStore {
    dir: PathBuf,
    default_backup_folder: PathBuf,
    current: Mutex<Settings>,
}

impl SettingsStore {
    pub fn new(dir: &Path, default_backup_folder: PathBuf) -> Self {
        Self {
            dir: dir.to_path_buf(),
            default_backup_folder,
            current: Mutex::new(load(dir)),
        }
    }

    pub fn get(&self) -> Settings {
        self.current
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone()
    }

    pub fn view(&self) -> SettingsView {
        view_of(&self.get(), &self.default_backup_folder)
    }

    /// Changes the settings and saves them; if saving fails nothing changes.
    pub fn update(&self, change: impl FnOnce(&mut Settings)) -> std::io::Result<SettingsView> {
        let mut current = self.current.lock().unwrap_or_else(|p| p.into_inner());
        let mut next = current.clone();
        change(&mut next);
        save(&self.dir, &next)?;
        *current = next;
        Ok(view_of(&current, &self.default_backup_folder))
    }

    pub fn backup_folder(&self) -> PathBuf {
        self.get()
            .backup_folder
            .unwrap_or_else(|| self.default_backup_folder.clone())
    }
}

fn view_of(settings: &Settings, default_folder: &Path) -> SettingsView {
    let folder = settings.backup_folder.as_deref().unwrap_or(default_folder);
    SettingsView {
        auto_start: settings.auto_start,
        backup_folder: folder.display().to_string(),
        backup_folder_is_default: settings.backup_folder.is_none(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store(dir: &Path) -> SettingsStore {
        SettingsStore::new(dir, default_backup_folder(Path::new("docs")))
    }

    #[test]
    fn defaults_when_nothing_was_saved() {
        let dir = tempfile::tempdir().unwrap();
        let view = store(dir.path()).view();
        assert!(view.auto_start);
        assert!(view.backup_folder_is_default);
        assert!(view.backup_folder.ends_with("ArboDat+ Backups"));
    }

    #[test]
    fn changes_survive_a_restart() {
        let dir = tempfile::tempdir().unwrap();
        store(dir.path())
            .update(|s| {
                s.auto_start = false;
                s.backup_folder = Some(PathBuf::from("backups"));
            })
            .unwrap();
        let view = store(dir.path()).view();
        assert!(!view.auto_start);
        assert!(!view.backup_folder_is_default);
        assert_eq!(view.backup_folder, "backups");
    }

    #[test]
    fn a_damaged_or_partial_file_means_defaults_for_what_is_missing() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(FILE), "{ nope").unwrap();
        assert_eq!(store(dir.path()).get(), Settings::default());
        std::fs::write(dir.path().join(FILE), r#"{"autoStart":false}"#).unwrap();
        let s = store(dir.path()).get();
        assert!(!s.auto_start);
        assert_eq!(s.backup_folder, None);
    }

    #[test]
    fn a_failed_save_changes_nothing() {
        let dir = tempfile::tempdir().unwrap();
        // The settings directory is a file, so saving must fail.
        let blocked = dir.path().join("blocked");
        std::fs::write(&blocked, "").unwrap();
        let store = store(&blocked);
        assert!(store.update(|s| s.auto_start = false).is_err());
        assert!(store.get().auto_start);
    }

    #[test]
    fn writability_is_checked_without_leaving_anything_behind() {
        let dir = tempfile::tempdir().unwrap();
        check_writable(dir.path()).unwrap();
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0);
        assert!(check_writable(&dir.path().join("missing")).is_err());
    }
}
