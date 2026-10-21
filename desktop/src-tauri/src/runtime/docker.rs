//! Running the docker CLI.
//!
//! Every command runs with an **app-owned `DOCKER_CONFIG`** that has no credential helper, and
//! with `DOCKER_HOST` pinned to the endpoint of the user's current Docker context. Reason: with
//! the user's own config, `docker pull` calls Docker Desktop's credential helper, which reaches
//! into Docker Desktop's protected app container, and macOS then asks the user whether
//! *ArboDat+* may "access data from other apps" (Phase 4a spike). Our images are public, so no
//! registry login is needed.

use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use serde_json::{Value, json};
use tokio::process::Command;

use super::discovery::DockerBinary;

#[derive(Debug, Clone)]
pub struct DockerCli {
    pub bin: PathBuf,
    child_path: OsString,
    config_dir: PathBuf,
    /// `None` if the user's context couldn't be resolved: docker then uses its built-in default.
    pub host: Option<String>,
}

#[derive(Debug, Clone)]
pub struct Output {
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

impl Output {
    pub fn success(&self) -> bool {
        self.code == Some(0)
    }
}

#[derive(Debug, thiserror::Error)]
pub enum RunError {
    #[error("could not run {program}: {source}")]
    Spawn {
        program: String,
        source: std::io::Error,
    },
    #[error("`docker {args}` did not finish within {secs} s")]
    Timeout { args: String, secs: u64 },
}

const CONTEXT_TIMEOUT: Duration = Duration::from_secs(10);
/// First installs download about 400 MB; slow connections need a long leash.
const PULL_TIMEOUT: Duration = Duration::from_secs(45 * 60);

impl DockerCli {
    /// Resolves the user's Docker endpoint and writes the app-owned docker config.
    pub async fn prepare(binary: DockerBinary, config_dir: &Path) -> std::io::Result<Self> {
        let user_config_dir = user_config_dir();
        let host = resolve_host(&binary).await;
        write_app_config(config_dir, &app_config(&user_config_dir))?;
        Ok(Self {
            bin: binary.path,
            child_path: binary.child_path,
            config_dir: config_dir.to_path_buf(),
            host,
        })
    }

    /// False once the docker binary or the app-owned config has been deleted from disk.
    pub fn is_usable(&self) -> bool {
        self.bin.is_file() && self.config_dir.join("config.json").is_file()
    }

    pub fn command<I, S>(&self, args: I) -> Command
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let mut cmd = base_command(&self.bin, &self.child_path);
        // Inherited settings must not redirect our commands to another engine, project or
        // version: the app's own files are the only source of truth.
        for (key, _) in std::env::vars_os() {
            let k = key.to_string_lossy().to_ascii_uppercase();
            if k.starts_with("DOCKER_")
                || k.starts_with("COMPOSE_")
                || k.starts_with("ARBODAT_")
                || k == "DATABASE_PASSWORD"
            {
                cmd.env_remove(&key);
            }
        }
        cmd.env("DOCKER_CLI_HINTS", "false")
            .env("DOCKER_CONFIG", &self.config_dir);
        if let Some(host) = &self.host {
            cmd.env("DOCKER_HOST", host);
        }
        cmd.args(args);
        cmd
    }

    pub async fn run<I, S>(&self, args: I, timeout: Duration) -> Result<Output, RunError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let args: Vec<OsString> = args
            .into_iter()
            .map(|a| a.as_ref().to_os_string())
            .collect();
        let mut cmd = self.command(&args);
        let label = args
            .iter()
            .map(|a| a.to_string_lossy())
            .collect::<Vec<_>>()
            .join(" ");
        execute(&mut cmd, &self.bin, &label, timeout).await
    }

    /// Like `run`, with `dir` as the working directory (compose resolves relative paths in its
    /// `.env` against it).
    pub async fn run_in<I, S>(
        &self,
        dir: &Path,
        args: I,
        timeout: Duration,
    ) -> Result<Output, RunError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let args: Vec<OsString> = args
            .into_iter()
            .map(|a| a.as_ref().to_os_string())
            .collect();
        let mut cmd = self.command(&args);
        cmd.current_dir(dir);
        let label = args
            .iter()
            .map(|a| a.to_string_lossy())
            .collect::<Vec<_>>()
            .join(" ");
        execute(&mut cmd, &self.bin, &label, timeout).await
    }

    /// Like `run_in`, but hands every line of output to `on_line` as it arrives (Docker prints its
    /// progress there). The returned `Output` still has the full stdout and the tail of stderr, so
    /// failures can be classified afterwards.
    pub async fn run_streaming_in<I, S, F>(
        &self,
        dir: &Path,
        args: I,
        timeout: Duration,
        mut on_line: F,
    ) -> Result<Output, RunError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
        F: FnMut(&str),
    {
        use tokio::io::{AsyncBufReadExt, BufReader};

        let args: Vec<OsString> = args
            .into_iter()
            .map(|a| a.as_ref().to_os_string())
            .collect();
        let label = args
            .iter()
            .map(|a| a.to_string_lossy())
            .collect::<Vec<_>>()
            .join(" ");
        let mut cmd = self.command(&args);
        cmd.current_dir(dir);
        let mut child = cmd.spawn().map_err(|source| RunError::Spawn {
            program: self.bin.display().to_string(),
            source,
        })?;

        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<(bool, String)>();
        if let Some(out) = child.stdout.take() {
            let tx = tx.clone();
            tokio::spawn(async move {
                let mut lines = BufReader::new(out).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    let _ = tx.send((false, line));
                }
            });
        }
        if let Some(err) = child.stderr.take() {
            let tx = tx.clone();
            tokio::spawn(async move {
                let mut lines = BufReader::new(err).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    let _ = tx.send((true, line));
                }
            });
        }
        drop(tx); // the channel closes when both readers have hit end-of-file

        let deadline = tokio::time::Instant::now() + timeout;
        let timed_out = || RunError::Timeout {
            args: label.clone(),
            secs: timeout.as_secs(),
        };
        let (mut stdout, mut stderr) = (String::new(), String::new());
        loop {
            match tokio::time::timeout_at(deadline, rx.recv()).await {
                Err(_) => {
                    let _ = child.kill().await;
                    return Err(timed_out());
                }
                Ok(None) => break,
                Ok(Some((is_stderr, line))) => {
                    on_line(&line);
                    let sink = if is_stderr { &mut stderr } else { &mut stdout };
                    sink.push_str(&line);
                    sink.push('\n');
                    keep_tail(sink, 64 * 1024);
                }
            }
        }
        let status = match tokio::time::timeout_at(deadline, child.wait()).await {
            Ok(status) => status.map_err(|source| RunError::Spawn {
                program: self.bin.display().to_string(),
                source,
            })?,
            Err(_) => {
                let _ = child.kill().await;
                return Err(timed_out());
            }
        };
        Ok(Output {
            code: status.code(),
            stdout,
            stderr: stderr.trim().to_string(),
        })
    }

    /// Downloads exactly one image (`docker pull`), streaming Docker's progress to `on_line`.
    /// Deliberately not `docker compose pull`: that fetches *every* service's image, including
    /// ones we already have (and, for development builds, ones that exist only locally).
    pub async fn pull_image(
        &self,
        dir: &Path,
        image: &str,
        on_line: impl FnMut(&str),
    ) -> Result<Output, RunError> {
        self.run_streaming_in(dir, ["pull", image], PULL_TIMEOUT, on_line)
            .await
    }

    /// Does the named volume exist? (`docker volume inspect`: exit 0, or "no such volume".)
    pub async fn volume_exists(&self, name: &str) -> Result<bool, String> {
        let out = self
            .run(
                ["volume", "inspect", "--format", "{{.Name}}", name],
                CONTEXT_TIMEOUT,
            )
            .await
            .map_err(|e| e.to_string())?;
        if out.success() {
            Ok(true)
        } else if out.stderr.to_ascii_lowercase().contains("no such volume") {
            Ok(false)
        } else {
            Err(out.stderr)
        }
    }

    /// Creates a volume (a no-op if it already exists with the same name).
    pub async fn volume_create(&self, name: &str, label: &str) -> Result<(), String> {
        let out = self
            .run(
                ["volume", "create", "--label", label, name],
                CONTEXT_TIMEOUT,
            )
            .await
            .map_err(|e| e.to_string())?;
        if out.success() {
            Ok(())
        } else {
            Err(out.stderr)
        }
    }

    /// Is this image already present locally? (Then there's nothing to download.)
    pub async fn image_exists(&self, image: &str) -> Result<bool, String> {
        let out = self
            .run(
                ["image", "inspect", "--format", "{{.Id}}", image],
                CONTEXT_TIMEOUT,
            )
            .await
            .map_err(|e| e.to_string())?;
        if out.success() {
            Ok(true)
        } else if out.stderr.to_ascii_lowercase().contains("no such image") {
            Ok(false)
        } else {
            Err(out.stderr)
        }
    }
}

/// Keeps only the last `max` bytes of `s` (cut at a character boundary), so a very chatty command
/// can't grow our buffer without limit while its end, where errors are, stays available.
fn keep_tail(s: &mut String, max: usize) {
    if s.len() <= max {
        return;
    }
    let mut cut = s.len() - max * 3 / 4;
    while !s.is_char_boundary(cut) {
        cut += 1;
    }
    s.drain(..cut);
}

fn base_command(bin: &Path, child_path: &OsStr) -> Command {
    let mut cmd = Command::new(bin);
    cmd.env("PATH", child_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true); // a timed-out command is killed, not left running
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: no console window flashing up
    cmd
}

async fn execute(
    cmd: &mut Command,
    bin: &Path,
    label: &str,
    timeout: Duration,
) -> Result<Output, RunError> {
    match tokio::time::timeout(timeout, cmd.output()).await {
        Err(_) => Err(RunError::Timeout {
            args: label.to_string(),
            secs: timeout.as_secs(),
        }),
        Ok(Err(source)) => Err(RunError::Spawn {
            program: bin.display().to_string(),
            source,
        }),
        Ok(Ok(out)) => Ok(Output {
            code: out.status.code(),
            stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&out.stderr).trim().to_string(),
        }),
    }
}

/// The user's docker config directory (where their contexts and plugins live).
fn user_config_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("DOCKER_CONFIG").filter(|d| !d.is_empty()) {
        return PathBuf::from(dir);
    }
    home_dir().join(".docker")
}

pub fn home_dir() -> PathBuf {
    #[cfg(windows)]
    let home = std::env::var_os("USERPROFILE");
    #[cfg(not(windows))]
    let home = std::env::var_os("HOME");
    home.map(PathBuf::from).unwrap_or_default()
}

/// The endpoint of the user's current Docker context, e.g.
/// `unix:///Users/x/.docker/run/docker.sock` or `npipe:////./pipe/dockerDesktopLinuxEngine`.
/// Uses the user's *own* config (that's where contexts live); `context inspect` never calls the
/// credential helper, so this doesn't trigger the macOS prompt.
async fn resolve_host(binary: &DockerBinary) -> Option<String> {
    if let Some(host) = std::env::var("DOCKER_HOST")
        .ok()
        .filter(|h| !h.trim().is_empty())
    {
        return Some(host);
    }
    let mut cmd = base_command(&binary.path, &binary.child_path);
    cmd.env("DOCKER_CLI_HINTS", "false").args([
        "context",
        "inspect",
        "--format",
        "{{.Endpoints.docker.Host}}",
    ]);
    let out = execute(&mut cmd, &binary.path, "context inspect", CONTEXT_TIMEOUT)
        .await
        .ok()?;
    let host = out.stdout.trim();
    (out.success() && !host.is_empty()).then(|| host.to_string())
}

/// No credential store, plus everything needed to keep working like the user's own setup:
/// their cli-plugin directories (so `docker compose` is found) and their proxy settings.
fn app_config(user_config_dir: &Path) -> Value {
    let user: Value = std::fs::read_to_string(user_config_dir.join("config.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(Value::Null);

    let mut dirs: Vec<PathBuf> = vec![user_config_dir.join("cli-plugins")];
    if let Some(extra) = user.get("cliPluginsExtraDirs").and_then(Value::as_array) {
        dirs.extend(extra.iter().filter_map(Value::as_str).map(PathBuf::from));
    }
    #[cfg(target_os = "macos")]
    dirs.push("/Applications/Docker.app/Contents/Resources/cli-plugins".into());
    #[cfg(windows)]
    for var in ["ProgramW6432", "ProgramFiles"] {
        if let Some(dir) = std::env::var_os(var) {
            dirs.push(PathBuf::from(dir).join(r"Docker\cli-plugins"));
        }
    }
    let mut plugin_dirs: Vec<String> = Vec::new();
    for dir in dirs.into_iter().filter(|d| d.is_dir()) {
        let s = dir.to_string_lossy().into_owned();
        if !plugin_dirs.contains(&s) {
            plugin_dirs.push(s);
        }
    }

    let mut config = json!({ "auths": {}, "cliPluginsExtraDirs": plugin_dirs });
    if let Some(proxies) = user.get("proxies") {
        config["proxies"] = proxies.clone();
    }
    config
}

fn write_app_config(dir: &Path, config: &Value) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    let path = dir.join("config.json");
    let content = serde_json::to_string_pretty(config).expect("serializable") + "\n";
    if std::fs::read_to_string(&path).ok().as_deref() == Some(content.as_str()) {
        return Ok(());
    }
    let tmp = dir.join("config.json.tmp");
    std::fs::write(&tmp, content)?;
    std::fs::rename(tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_cli_is_unusable_once_the_app_owned_config_is_deleted() {
        let dir = tempfile::tempdir().unwrap();
        let bin = dir.path().join("docker");
        std::fs::write(&bin, "").unwrap();
        let config_dir = dir.path().join("docker-config");
        write_app_config(&config_dir, &json!({ "auths": {} })).unwrap();
        let cli = DockerCli {
            bin,
            child_path: OsString::new(),
            config_dir: config_dir.clone(),
            host: None,
        };
        assert!(cli.is_usable());
        // Without it `docker compose` has no plugin directories and reports "unknown flag".
        std::fs::remove_dir_all(&config_dir).unwrap();
        assert!(!cli.is_usable());
    }

    #[test]
    fn app_config_has_no_credential_store_but_keeps_plugins_and_proxies() {
        let user = tempfile::tempdir().unwrap();
        std::fs::create_dir(user.path().join("cli-plugins")).unwrap();
        std::fs::write(
            user.path().join("config.json"),
            r#"{"credsStore":"desktop","auths":{"ghcr.io":{}},"currentContext":"desktop-linux",
                "proxies":{"default":{"httpProxy":"http://proxy.uni-kiel.de:3128"}}}"#,
        )
        .unwrap();

        let config = app_config(user.path());
        assert!(config.get("credsStore").is_none());
        assert!(config.get("credHelpers").is_none());
        assert!(
            config.get("currentContext").is_none(),
            "the context is pinned via DOCKER_HOST instead"
        );
        assert_eq!(config["auths"], json!({}));
        assert_eq!(
            config["proxies"]["default"]["httpProxy"],
            "http://proxy.uni-kiel.de:3128"
        );
        let dirs = config["cliPluginsExtraDirs"].as_array().unwrap();
        assert_eq!(
            dirs[0],
            user.path().join("cli-plugins").to_string_lossy().as_ref()
        );
    }

    #[test]
    fn app_config_without_any_user_config() {
        let user = tempfile::tempdir().unwrap();
        let config = app_config(user.path());
        assert_eq!(config["auths"], json!({}));
        assert!(config.get("proxies").is_none());
    }

    #[test]
    fn writing_the_config_is_idempotent() {
        let dir = tempfile::tempdir().unwrap();
        let config = json!({"auths": {}});
        write_app_config(dir.path(), &config).unwrap();
        let first = std::fs::metadata(dir.path().join("config.json"))
            .unwrap()
            .modified()
            .unwrap();
        write_app_config(dir.path(), &config).unwrap();
        let second = std::fs::metadata(dir.path().join("config.json"))
            .unwrap()
            .modified()
            .unwrap();
        assert_eq!(first, second, "unchanged config must not be rewritten");
        assert!(!dir.path().join("config.json.tmp").exists());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn sanitized_environment() {
        let cli = DockerCli {
            bin: "/usr/bin/env".into(), // prints its environment
            child_path: "/usr/bin:/bin".into(),
            config_dir: "/app/docker-config".into(),
            host: Some("unix:///tmp/docker.sock".into()),
        };
        // SAFETY: test-only; no other test reads these variables.
        unsafe {
            std::env::set_var("COMPOSE_PROJECT_NAME", "someone-elses-project");
            std::env::set_var("DOCKER_CONTEXT", "remote");
            std::env::set_var("DATABASE_PASSWORD", "leaked");
        }
        let out = cli
            .run(std::iter::empty::<&str>(), Duration::from_secs(5))
            .await
            .unwrap();
        let env: Vec<&str> = out.stdout.lines().collect();
        assert!(env.contains(&"DOCKER_CONFIG=/app/docker-config"));
        assert!(env.contains(&"DOCKER_HOST=unix:///tmp/docker.sock"));
        assert!(env.contains(&"DOCKER_CLI_HINTS=false"));
        assert!(env.contains(&"PATH=/usr/bin:/bin"));
        assert!(!env.iter().any(|l| l.starts_with("COMPOSE_PROJECT_NAME=")));
        assert!(!env.iter().any(|l| l.starts_with("DOCKER_CONTEXT=")));
        assert!(!env.iter().any(|l| l.starts_with("DATABASE_PASSWORD=")));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn timeout_kills_the_command() {
        let cli = DockerCli {
            bin: "/bin/sleep".into(),
            child_path: "/bin".into(),
            config_dir: "/tmp".into(),
            host: None,
        };
        let err = cli
            .run(["30"], Duration::from_millis(200))
            .await
            .unwrap_err();
        assert!(matches!(err, RunError::Timeout { .. }), "{err}");
    }

    #[test]
    fn keep_tail_trims_from_the_front_on_a_char_boundary() {
        let mut s = "aé".repeat(100); // multi-byte characters
        keep_tail(&mut s, 50);
        assert!(s.len() <= 50 && !s.is_empty());
        assert!(s.is_char_boundary(0));
        let mut short = String::from("keep me");
        keep_tail(&mut short, 50);
        assert_eq!(short, "keep me");
    }

    #[cfg(unix)]
    fn sh() -> DockerCli {
        DockerCli {
            bin: "/bin/sh".into(),
            child_path: "/usr/bin:/bin".into(),
            config_dir: "/tmp".into(),
            host: None,
        }
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn streaming_delivers_lines_from_both_streams_in_order_and_keeps_the_output() {
        let mut seen = Vec::new();
        let out = sh()
            .run_streaming_in(
                Path::new("/tmp"),
                [
                    "-c",
                    "echo one; echo two 1>&2; sleep 0.1; echo three; exit 3",
                ],
                Duration::from_secs(10),
                |l| seen.push(l.to_string()),
            )
            .await
            .unwrap();
        assert_eq!(out.code, Some(3));
        assert_eq!(out.stdout, "one\nthree\n");
        assert_eq!(out.stderr, "two");
        assert_eq!(seen.len(), 3);
        assert_eq!(seen.last().unwrap(), "three");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn streaming_times_out_and_kills_the_command() {
        let started = std::time::Instant::now();
        let err = sh()
            .run_streaming_in(
                Path::new("/tmp"),
                ["-c", "echo started; sleep 30"],
                Duration::from_millis(500),
                |_| {},
            )
            .await
            .unwrap_err();
        assert!(matches!(err, RunError::Timeout { .. }), "{err}");
        assert!(
            started.elapsed() < Duration::from_secs(5),
            "must not wait for the sleep"
        );
    }
}
