//! Downloads of the ArboDat+ window (exports, CSV/XLSX/JSON files) go to the Downloads folder
//! under a name that doesn't overwrite anything, and the page shows where they went.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError};

use tauri::webview::DownloadEvent;
use tauri::{AppHandle, Manager, Webview, Wry};

/// `name`, or `stem (1).ext`, `stem (2).ext`... if that already exists in `dir`.
pub fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let (stem, ext) = match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() => (stem, format!(".{ext}")),
        _ => (name, String::new()),
    };
    (1..)
        .map(|n| dir.join(format!("{stem} ({n}){ext}")))
        .find(|p| !p.exists())
        .expect("an unused number exists")
}

fn show_toast(webview: &Webview<Wry>, message: &str) {
    let text = serde_json::to_string(message).expect("a string is serialisable");
    let _ = webview.eval(format!(
        "window.__arbodatToast && window.__arbodatToast({text});"
    ));
}

pub fn handler(
    app: &AppHandle,
) -> impl Fn(Webview<Wry>, DownloadEvent<'_>) -> bool + Send + Sync + 'static {
    // WebKit reports the finished download without its path (macOS), so remember it from the request.
    let pending: Arc<Mutex<HashMap<String, PathBuf>>> = Arc::default();
    let app = app.clone();
    move |webview, event| {
        match event {
            DownloadEvent::Requested { url, destination } => {
                if let Ok(dir) = app.path().download_dir() {
                    // `file_name` also drops any directories a page might have put in the name.
                    let name = destination
                        .file_name()
                        .map(|n| n.to_string_lossy().into_owned())
                        .unwrap_or_else(|| "download".into());
                    *destination = unique_path(&dir, &name);
                }
                pending
                    .lock()
                    .unwrap_or_else(PoisonError::into_inner)
                    .insert(url.to_string(), destination.clone());
            }
            DownloadEvent::Finished { url, success, .. } => {
                let path = pending
                    .lock()
                    .unwrap_or_else(PoisonError::into_inner)
                    .remove(url.as_str());
                let name = path
                    .as_deref()
                    .and_then(Path::file_name)
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_else(|| "the file".into());
                let message = if success {
                    format!("Saved to your Downloads folder: {name}")
                } else {
                    format!("The download of {name} failed.")
                };
                show_toast(&webview, &message);
            }
            _ => {}
        }
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_free_name_is_kept() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(unique_path(dir.path(), "a.csv"), dir.path().join("a.csv"));
    }

    #[test]
    fn existing_files_are_never_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("export.csv"), "").unwrap();
        assert_eq!(
            unique_path(dir.path(), "export.csv"),
            dir.path().join("export (1).csv")
        );
        std::fs::write(dir.path().join("export (1).csv"), "").unwrap();
        assert_eq!(
            unique_path(dir.path(), "export.csv"),
            dir.path().join("export (2).csv")
        );
    }

    #[test]
    fn names_without_extension_or_with_several_dots() {
        let dir = tempfile::tempdir().unwrap();
        for name in ["README", "data.tar.gz", ".hidden"] {
            std::fs::write(dir.path().join(name), "").unwrap();
        }
        assert_eq!(
            unique_path(dir.path(), "README"),
            dir.path().join("README (1)")
        );
        assert_eq!(
            unique_path(dir.path(), "data.tar.gz"),
            dir.path().join("data.tar (1).gz")
        );
        assert_eq!(
            unique_path(dir.path(), ".hidden"),
            dir.path().join(".hidden (1)")
        );
    }
}
