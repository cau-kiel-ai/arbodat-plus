//! `docker compose` invocations. Every call pins project name, project directory and file, so
//! nothing (cwd, a stray compose file, COMPOSE_* variables) can make it act on another project.

use std::ffi::OsString;
use std::path::Path;
use std::time::Duration;

use super::docker::DockerCli;
use super::parse::{self, ComposeContainer};
use super::template::{COMPOSE_FILE, PROJECT};

const PS_TIMEOUT: Duration = Duration::from_secs(20);

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

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)] // path separators
    #[test]
    fn every_call_pins_project_directory_and_file() {
        let a: Vec<String> = args(Path::new("/data/runtime"), &["ps", "--all"])
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
                "/data/runtime",
                "--file",
                "/data/runtime/compose.yml",
                "ps",
                "--all"
            ]
        );
    }
}
