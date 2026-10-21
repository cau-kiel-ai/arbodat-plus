//! `docker compose` invocations. Every call pins project name, project directory and file, so
//! nothing (cwd, a stray compose file, COMPOSE_* variables) can make it act on another project.

use std::ffi::OsString;
use std::path::Path;
use std::time::Duration;

use super::docker::{DockerCli, Output, RunError};
use super::parse::{self, ComposeContainer};
use super::template::{COMPOSE_FILE, PROJECT};

const PS_TIMEOUT: Duration = Duration::from_secs(20);
const CONFIG_TIMEOUT: Duration = Duration::from_secs(30);
/// `up` may also have to pull missing images (it does so by itself), then waits up to `UP_WAIT_SECS` for health checks.
const UP_TIMEOUT: Duration = Duration::from_secs(55 * 60);
const UP_WAIT_SECS: &str = "600";
/// Postgres gets 60 s and the web-api 30 s to shut down cleanly (see compose.yml).
const STOP_TIMEOUT: Duration = Duration::from_secs(5 * 60);

pub fn args(runtime_dir: &Path, subcommand: &[&str]) -> Vec<OsString> {
    let mut args: Vec<OsString> = [
        "compose",
        "--ansi",
        "never",
        "--project-name",
        PROJECT,
        "--project-directory",
    ]
    .map(OsString::from)
    .into();
    args.push(runtime_dir.into());
    args.push("--file".into());
    args.push(runtime_dir.join(COMPOSE_FILE).into());
    args.extend(subcommand.iter().map(OsString::from));
    args
}

/// All containers of the project, including stopped ones.
pub async fn ps(cli: &DockerCli, runtime_dir: &Path) -> Result<Vec<ComposeContainer>, String> {
    let out = cli
        .run_in(
            runtime_dir,
            args(runtime_dir, &["ps", "--all", "--format", "json"]),
            PS_TIMEOUT,
        )
        .await
        .map_err(|e| e.to_string())?;
    if !out.success() {
        return Err(if out.stderr.is_empty() {
            format!("`docker compose ps` failed (exit code {:?})", out.code)
        } else {
            out.stderr
        });
    }
    parse::parse_compose_ps(&out.stdout)
}

/// The images the stack uses, as compose resolves them with the installed `.env`
/// (e.g. `ghcr.io/cau-kiel-ai/arbodat-plus-web-api:5.0.0`, `postgres:16-trixie`).
pub async fn config_images(cli: &DockerCli, runtime_dir: &Path) -> Result<Vec<String>, String> {
    let out = cli
        .run_in(
            runtime_dir,
            args(runtime_dir, &["config", "--images"]),
            CONFIG_TIMEOUT,
        )
        .await
        .map_err(|e| e.to_string())?;
    if !out.success() {
        return Err(if out.stderr.is_empty() {
            "`docker compose config` failed".into()
        } else {
            out.stderr
        });
    }
    let mut images: Vec<String> = out
        .stdout
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(str::to_string)
        .collect();
    images.sort();
    images.dedup();
    Ok(images)
}

/// `docker compose up -d --wait`: creates and starts what is needed and returns once every
/// service with a health check is healthy (compose fails if one doesn't get there in time).
/// Never recreates or removes the data volume: it is `external`.
pub async fn up(
    cli: &DockerCli,
    runtime_dir: &Path,
    on_line: impl FnMut(&str),
) -> Result<Output, RunError> {
    let sub = ["up", "-d", "--wait", "--wait-timeout", UP_WAIT_SECS];
    cli.run_streaming_in(runtime_dir, args(runtime_dir, &sub), UP_TIMEOUT, on_line)
        .await
}

/// `docker compose stop`: a graceful stop that keeps containers, network and data. Never `down`.
pub async fn stop(
    cli: &DockerCli,
    runtime_dir: &Path,
    on_line: impl FnMut(&str),
) -> Result<Output, RunError> {
    cli.run_streaming_in(
        runtime_dir,
        args(runtime_dir, &["stop"]),
        STOP_TIMEOUT,
        on_line,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_call_pins_project_directory_and_file() {
        // Expected paths are built with Path, so the test holds on every OS (separators differ).
        let dir = Path::new("data").join("runtime");
        let file = dir.join("compose.yml");
        let a: Vec<String> = args(&dir, &["ps", "--all"])
            .iter()
            .map(|s| s.to_string_lossy().into_owned())
            .collect();
        assert_eq!(
            a,
            [
                "compose",
                "--ansi",
                "never",
                "--project-name",
                "arbodat-plus",
                "--project-directory",
                dir.to_str().unwrap(),
                "--file",
                file.to_str().unwrap(),
                "ps",
                "--all"
            ]
        );
    }

    #[test]
    fn this_module_never_builds_a_destructive_command() {
        // The source of the non-test code must not contain `down`, `rm`, `--volumes` or `-v`
        // (data safety invariant: the app never removes containers' data).
        let src = include_str!("compose.rs");
        let code = src.split("#[cfg(test)]").next().unwrap();
        for forbidden in [
            "\"down\"",
            "\"rm\"",
            "\"--volumes\"",
            "\"-v\"",
            "\"-y\"",
            "\"--yes\"",
        ] {
            assert!(
                !code.contains(forbidden),
                "compose.rs must not use {forbidden}"
            );
        }
    }
}
