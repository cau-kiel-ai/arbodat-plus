//! Small file helpers with the guarantees the installation needs: files appear complete or not at
//! all, and the secret file is never overwritten by accident.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

/// Characters of the generated database password: letters and digits only, so it can sit in a
/// `.env` file, a JDBC URL's environment variable and shell commands without any quoting.
const PASSWORD_CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/// A random password from the operating system's secure random source (62 symbols, so 32 of
/// them carry about 190 bits). Bytes are rejected, not wrapped, to avoid modulo bias.
pub fn random_password(len: usize) -> std::io::Result<String> {
    let limit = 256 - (256 % PASSWORD_CHARS.len()); // 248: bytes at or above are rejected
    let mut out = String::with_capacity(len);
    let mut buf = [0u8; 64];
    while out.len() < len {
        getrandom::fill(&mut buf)
            .map_err(|e| std::io::Error::other(format!("no secure random source: {e}")))?;
        for &b in &buf {
            if (b as usize) < limit && out.len() < len {
                out.push(PASSWORD_CHARS[b as usize % PASSWORD_CHARS.len()] as char);
            }
        }
    }
    Ok(out)
}

fn temp_sibling(path: &Path) -> PathBuf {
    let mut name = path
        .file_name()
        .map(|n| n.to_os_string())
        .unwrap_or_default();
    name.push(".tmp");
    path.with_file_name(name)
}

#[cfg(unix)]
fn open_private(opts: &mut OpenOptions) -> &mut OpenOptions {
    use std::os::unix::fs::OpenOptionsExt;
    opts.mode(0o600)
}
#[cfg(not(unix))]
fn open_private(opts: &mut OpenOptions) -> &mut OpenOptions {
    opts // the per-user data directory is already private on Windows
}

fn write_synced(file: &mut File, contents: &[u8]) -> std::io::Result<()> {
    file.write_all(contents)?;
    file.sync_all()
}

/// Writes `contents` so that `path` either keeps its old content or has the complete new content,
/// never a half-written file: temp file, fsync, rename. `private` makes the file readable by the
/// current user only (unix), from the moment it exists.
pub fn write_atomic(path: &Path, contents: &[u8], private: bool) -> std::io::Result<()> {
    let tmp = temp_sibling(path);
    let _ = fs::remove_file(&tmp); // a leftover from an interrupted earlier write
    let mut opts = OpenOptions::new();
    opts.write(true).create_new(true);
    if private {
        open_private(&mut opts);
    }
    let result = (|| {
        let mut file = opts.open(&tmp)?;
        write_synced(&mut file, contents)?;
        drop(file);
        fs::rename(&tmp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

/// Creates a *new* private file; fails with `AlreadyExists` if there is one. For secrets we must
/// never replace by accident.
pub fn create_new_private(path: &Path, contents: &[u8]) -> std::io::Result<()> {
    let mut opts = OpenOptions::new();
    opts.write(true).create_new(true);
    open_private(&mut opts);
    let mut file = opts.open(path)?;
    let written = write_synced(&mut file, contents);
    if written.is_err() {
        let _ = fs::remove_file(path); // don't leave a half-written secret behind
    }
    written
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn password_has_requested_length_and_only_safe_characters() {
        for len in [1, 32, 100] {
            let p = random_password(len).unwrap();
            assert_eq!(p.len(), len);
            assert!(p.bytes().all(|b| PASSWORD_CHARS.contains(&b)), "{p}");
        }
    }

    #[test]
    fn passwords_differ_and_use_the_whole_alphabet() {
        let a = random_password(32).unwrap();
        let b = random_password(32).unwrap();
        assert_ne!(a, b);
        let seen: HashSet<u8> = random_password(4000).unwrap().bytes().collect();
        assert_eq!(
            seen.len(),
            PASSWORD_CHARS.len(),
            "every symbol should appear in 4000 draws"
        );
    }

    #[test]
    fn atomic_write_creates_and_replaces_without_leftovers() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("compose.yml");
        write_atomic(&path, b"one", false).unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"one");
        write_atomic(&path, b"two", false).unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"two");
        let names: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name())
            .collect();
        assert_eq!(names, ["compose.yml"], "no .tmp file may remain");
    }

    #[test]
    fn atomic_write_survives_a_stale_temp_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("state.json");
        fs::write(temp_sibling(&path), b"half").unwrap();
        write_atomic(&path, b"whole", false).unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"whole");
    }

    #[test]
    fn create_new_private_never_overwrites() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(".env");
        create_new_private(&path, b"DATABASE_PASSWORD=first\n").unwrap();
        let err = create_new_private(&path, b"DATABASE_PASSWORD=second\n").unwrap_err();
        assert_eq!(err.kind(), std::io::ErrorKind::AlreadyExists);
        assert_eq!(fs::read(&path).unwrap(), b"DATABASE_PASSWORD=first\n");
    }

    #[cfg(unix)]
    #[test]
    fn secrets_are_readable_by_the_owner_only() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let (a, b) = (dir.path().join("a"), dir.path().join("b"));
        create_new_private(&a, b"x").unwrap();
        write_atomic(&b, b"x", true).unwrap();
        for p in [a, b] {
            assert_eq!(fs::metadata(p).unwrap().permissions().mode() & 0o777, 0o600);
        }
    }
}
