//! Finding the docker CLI. Apps launched from Finder (macOS) or the Start menu don't get the
//! user's shell PATH: on macOS it's just /usr/bin:/bin:/usr/sbin:/sbin, so a bare `docker`
//! fails with "No such file or directory" (verified in the Phase 4a spike). So we look in the
//! known install locations as well as the inherited PATH.

use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Discovery {
    NotFound,
    /// Found only in a form we can't use (see `unsupported_reason`).
    Unsupported {
        path: PathBuf,
        reason: String,
    },
    Found(DockerBinary),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DockerBinary {
    pub path: PathBuf,
    /// PATH for child processes: the docker binary's own directory (and its symlink target's)
    /// first, so helpers that live next to it (cli plugins, credential helpers) are found.
    pub child_path: OsString,
}

#[cfg(windows)]
const EXE: &str = "docker.exe";
#[cfg(not(windows))]
const EXE: &str = "docker";

/// Well-known install locations, in order of preference.
pub fn known_locations(home: &Path) -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = Vec::new();
    #[cfg(target_os = "macos")]
    {
        v.push(home.join(".docker/bin/docker")); // Docker Desktop's per-user install option
        v.push("/usr/local/bin/docker".into()); // Docker Desktop's default symlink
        v.push("/opt/homebrew/bin/docker".into());
        v.push("/Applications/Docker.app/Contents/Resources/bin/docker".into());
    }
    #[cfg(target_os = "linux")]
    {
        v.push("/usr/bin/docker".into()); // Docker Engine packages and Docker Desktop for Linux
        v.push("/usr/local/bin/docker".into());
        v.push(home.join(".docker/bin/docker"));
        v.push("/snap/bin/docker".into()); // found only to explain why it's unsupported
    }
    #[cfg(windows)]
    {
        for var in ["ProgramW6432", "ProgramFiles"] {
            if let Some(dir) = std::env::var_os(var) {
                v.push(PathBuf::from(dir).join(r"Docker\Docker\resources\bin\docker.exe"));
            }
        }
        if let Some(dir) = std::env::var_os("LOCALAPPDATA") {
            v.push(PathBuf::from(dir).join(r"Programs\Docker\Docker\resources\bin\docker.exe"));
        }
        let _ = home;
    }
    v
}

/// Why a found binary can't be used, if it can't.
fn unsupported_reason(path: &Path, canonical: Option<&Path>) -> Option<String> {
    let is_snap = |p: &Path| p.starts_with("/snap/");
    if is_snap(path) || canonical.is_some_and(is_snap) {
        return Some(
            "The snap package of Docker can't read the app's data folder. Please install Docker Engine \
             from docker.com (or Docker Desktop) instead."
                .into(),
        );
    }
    None
}

/// Inherited PATH entries first (respects the user's choice when launched from a terminal, and
/// is all there is on most Linux/Windows desktops), then the well-known locations. The first
/// usable binary wins; an unusable one (snap) is only reported if nothing usable exists.
pub fn discover(
    inherited_path: Option<&OsStr>,
    home: &Path,
    exists: impl Fn(&Path) -> bool,
) -> Discovery {
    let mut candidates: Vec<PathBuf> = inherited_path
        .map(|p| std::env::split_paths(p).map(|dir| dir.join(EXE)).collect())
        .unwrap_or_default();
    candidates.extend(known_locations(home));

    let mut unsupported = None;
    for candidate in candidates {
        if !exists(&candidate) {
            continue;
        }
        let canonical = std::fs::canonicalize(&candidate).ok();
        if let Some(reason) = unsupported_reason(&candidate, canonical.as_deref()) {
            unsupported.get_or_insert(Discovery::Unsupported {
                path: candidate,
                reason,
            });
            continue;
        }
        let child_path = child_path(&candidate, canonical.as_deref(), inherited_path);
        return Discovery::Found(DockerBinary {
            path: candidate,
            child_path,
        });
    }
    unsupported.unwrap_or(Discovery::NotFound)
}

fn child_path(binary: &Path, canonical: Option<&Path>, inherited: Option<&OsStr>) -> OsString {
    let mut dirs: Vec<PathBuf> = Vec::new();
    for dir in [binary.parent(), canonical.and_then(Path::parent)]
        .into_iter()
        .flatten()
    {
        if !dirs.iter().any(|d| d == dir) {
            dirs.push(dir.to_path_buf());
        }
    }
    if let Some(inherited) = inherited {
        dirs.extend(std::env::split_paths(inherited).filter(|d| !d.as_os_str().is_empty()));
    }
    std::env::join_paths(dirs)
        .unwrap_or_else(|_| inherited.map(OsStr::to_os_string).unwrap_or_default())
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::collections::HashSet;

    fn fake_fs(paths: &[&str]) -> impl Fn(&Path) -> bool {
        let set: HashSet<PathBuf> = paths.iter().map(PathBuf::from).collect();
        move |p: &Path| set.contains(p)
    }

    #[test]
    fn nothing_installed() {
        let d = discover(
            Some(OsStr::new("/usr/bin:/bin")),
            Path::new("/home/u"),
            fake_fs(&[]),
        );
        assert_eq!(d, Discovery::NotFound);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn finder_launch_finds_docker_desktop_outside_the_minimal_path() {
        let d = discover(
            Some(OsStr::new("/usr/bin:/bin:/usr/sbin:/sbin")),
            Path::new("/Users/u"),
            fake_fs(&["/usr/local/bin/docker"]),
        );
        let Discovery::Found(bin) = d else {
            panic!("expected Found, got {d:?}")
        };
        assert_eq!(bin.path, PathBuf::from("/usr/local/bin/docker"));
        let path = bin.child_path.to_string_lossy().into_owned();
        assert!(
            path.starts_with("/usr/local/bin:"),
            "docker's own dir must come first: {path}"
        );
        assert!(
            path.ends_with("/usr/bin:/bin:/usr/sbin:/sbin"),
            "inherited PATH must be kept: {path}"
        );
    }

    #[test]
    fn inherited_path_wins_over_known_locations() {
        let d = discover(
            Some(OsStr::new("/opt/custom/bin:/usr/bin")),
            Path::new("/home/u"),
            fake_fs(&["/opt/custom/bin/docker", "/usr/local/bin/docker"]),
        );
        let Discovery::Found(bin) = d else {
            panic!("expected Found, got {d:?}")
        };
        assert_eq!(bin.path, PathBuf::from("/opt/custom/bin/docker"));
    }

    #[test]
    fn snap_docker_is_unsupported_but_a_real_one_wins() {
        let only_snap = discover(
            Some(OsStr::new("/snap/bin:/usr/bin")),
            Path::new("/home/u"),
            fake_fs(&["/snap/bin/docker"]),
        );
        assert!(
            matches!(only_snap, Discovery::Unsupported { .. }),
            "{only_snap:?}"
        );

        let both = discover(
            Some(OsStr::new("/snap/bin:/usr/local/bin")),
            Path::new("/home/u"),
            fake_fs(&["/snap/bin/docker", "/usr/local/bin/docker"]),
        );
        assert!(
            matches!(both, Discovery::Found(ref b) if b.path == Path::new("/usr/local/bin/docker")),
            "{both:?}"
        );
    }

    #[test]
    fn child_path_deduplicates_and_keeps_order() {
        let p = child_path(
            Path::new("/usr/local/bin/docker"),
            Some(Path::new("/usr/local/bin/docker")),
            Some(OsStr::new("/usr/bin")),
        );
        assert_eq!(p, OsString::from("/usr/local/bin:/usr/bin"));
    }
}
