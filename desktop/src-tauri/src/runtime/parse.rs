//! Pure parsers for docker / compose CLI output. No I/O, so every branch is unit-tested
//! against real captured output.

use semver::Version;
use serde::Deserialize;

/// One line of `docker compose ps --all --format json`.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct ComposeContainer {
    #[serde(rename = "Service")]
    pub service: String,
    #[serde(rename = "State")]
    pub state: String,
    /// "" when the service has no healthcheck.
    #[serde(rename = "Health", default)]
    pub health: String,
    #[serde(rename = "ExitCode", default)]
    pub exit_code: Option<i32>,
}

/// Compose >= 2.21 prints one JSON object per line; older versions print a single JSON array.
pub fn parse_compose_ps(stdout: &str) -> Result<Vec<ComposeContainer>, String> {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    if trimmed.starts_with('[') {
        return serde_json::from_str(trimmed)
            .map_err(|e| format!("unexpected `docker compose ps` output: {e}"));
    }
    trimmed
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| {
            serde_json::from_str(line)
                .map_err(|e| format!("unexpected `docker compose ps` line ({e}): {line}"))
        })
        .collect()
}

/// The relevant fields of `docker info --format '{{json .}}'`.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct EngineInfo {
    #[serde(rename = "ID", default)]
    pub id: String,
    #[serde(rename = "ServerVersion", default)]
    pub server_version: String,
    #[serde(rename = "OperatingSystem", default)]
    pub operating_system: String,
}

pub fn parse_engine_info(stdout: &str) -> Result<EngineInfo, String> {
    serde_json::from_str(stdout.trim()).map_err(|e| format!("unexpected `docker info` output: {e}"))
}

/// The first `X.Y.Z` in a version string, ignoring prefixes and suffixes:
/// "Docker version 28.3.0, build 38b7060", "v2.21.0", "2.38.1-desktop.1", "24.0.7-0ubuntu4".
/// Pre-release/build suffixes are dropped on purpose: for minimum-version checks,
/// "2.38.1-desktop.1" must count as 2.38.1, not as something older than it.
pub fn parse_version(s: &str) -> Option<Version> {
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let starts_number = bytes[i].is_ascii_digit() && (i == 0 || !bytes[i - 1].is_ascii_digit());
        if starts_number && let Some(v) = triplet_at(&s[i..]) {
            return Some(v);
        }
        i += 1;
    }
    None
}

fn triplet_at(s: &str) -> Option<Version> {
    let mut parts = [0u64; 3];
    let mut rest = s;
    for (n, part) in parts.iter_mut().enumerate() {
        let digits = rest.bytes().take_while(u8::is_ascii_digit).count();
        if digits == 0 {
            return None;
        }
        *part = rest[..digits].parse().ok()?;
        rest = &rest[digits..];
        if n < 2 {
            rest = rest.strip_prefix('.')?;
        }
    }
    Some(Version::new(parts[0], parts[1], parts[2]))
}

/// "Docker version 28.3.0, build 38b7060" -> "28.3.0"
pub fn docker_cli_version(stdout: &str) -> Option<String> {
    let rest = stdout.trim().strip_prefix("Docker version ")?;
    let version = rest.split(',').next()?.trim();
    (!version.is_empty()).then(|| version.to_string())
}

/// What went wrong, judged from a docker/compose command's stderr.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DockerErrorKind {
    EngineNotRunning,
    /// Linux: not allowed to use the docker socket (user not in the `docker` group).
    PermissionDenied,
    ComposeMissing,
    PortInUse,
    DiskFull,
    /// The credential helper couldn't be run. Note: when it isn't on PATH at all, docker
    /// silently pulls anonymously, so this then shows up as `RegistryUnauthorized` instead.
    CredentialHelper,
    RegistryUnauthorized,
    Offline,
    Other,
}

pub fn classify(stderr: &str) -> DockerErrorKind {
    let s = stderr.to_ascii_lowercase();
    let has = |needle: &str| s.contains(needle);
    // Order matters: e.g. "permission denied" and "connection refused" also appear in
    // unrelated errors, so the specific daemon-connection phrasings are checked first.
    if has("permission denied while trying to connect to the docker daemon") {
        DockerErrorKind::PermissionDenied
    } else if has("cannot connect to the docker daemon")
        || has("is the docker daemon running")
        || (has("error during connect") && has("pipe"))
        || has("dockerdesktoplinuxengine")
    {
        DockerErrorKind::EngineNotRunning
    } else if has("is not a docker command") || has("unknown command: docker compose") {
        DockerErrorKind::ComposeMissing
    } else if has("port is already allocated")
        || has("address already in use")
        || has("ports are not available")
        || has("only one usage of each socket address")
    {
        DockerErrorKind::PortInUse
    } else if has("no space left on device") {
        DockerErrorKind::DiskFull
    } else if has("docker-credential-") || has("error getting credentials") {
        DockerErrorKind::CredentialHelper
    } else if has("unauthorized") || has("denied: ") || has("authentication required") {
        DockerErrorKind::RegistryUnauthorized
    } else if has("no such host")
        || has("i/o timeout")
        || has("tls handshake timeout")
        || has("network is unreachable")
        || has("temporary failure in name resolution")
    {
        DockerErrorKind::Offline
    } else {
        DockerErrorKind::Other
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compose_ps_empty_output_means_no_containers() {
        assert_eq!(parse_compose_ps("").unwrap(), vec![]);
        assert_eq!(parse_compose_ps("\n  \n").unwrap(), vec![]);
    }

    #[test]
    fn compose_ps_ndjson_real_output() {
        let out = include_str!("../../tests/fixtures/compose-ps-running.ndjson");
        let containers = parse_compose_ps(out).unwrap();
        let services: Vec<_> = containers.iter().map(|c| c.service.as_str()).collect();
        assert_eq!(services, ["database", "frontend", "web-api"]);
        assert!(containers.iter().all(|c| c.state == "running"));
        assert!(containers.iter().all(|c| c.health == "healthy"));
        assert!(containers.iter().all(|c| c.exit_code == Some(0)));
    }

    #[test]
    fn compose_ps_legacy_json_array() {
        let out = r#"[{"Service":"database","State":"running","Health":"healthy","ExitCode":0},
                      {"Service":"web-api","State":"exited","Health":"","ExitCode":137}]"#;
        let containers = parse_compose_ps(out).unwrap();
        assert_eq!(containers.len(), 2);
        assert_eq!(containers[1].exit_code, Some(137));
        assert_eq!(containers[1].health, "");
    }

    #[test]
    fn compose_ps_missing_optional_fields() {
        let containers = parse_compose_ps(r#"{"Service":"frontend","State":"created"}"#).unwrap();
        assert_eq!(containers[0].health, "");
        assert_eq!(containers[0].exit_code, None);
    }

    #[test]
    fn compose_ps_garbage_is_an_error_not_silently_dropped() {
        // Dropping a line would misreport a crashed service as "missing" or the stack as healthy.
        let out = "{\"Service\":\"database\",\"State\":\"running\"}\nWARN something odd\n";
        assert!(parse_compose_ps(out).is_err());
    }

    #[test]
    fn engine_info_real_output() {
        let info =
            parse_engine_info(include_str!("../../tests/fixtures/docker-info.json")).unwrap();
        assert_eq!(info.server_version, "28.3.0");
        assert_eq!(info.operating_system, "Docker Desktop");
        assert!(!info.id.is_empty());
    }

    #[test]
    fn engine_info_when_engine_down_is_an_error() {
        // `docker info --format '{{json .}}'` prints `""` (and exits 1) when the engine is down.
        assert!(parse_engine_info("\"\"").is_err());
    }

    #[test]
    fn versions() {
        let v = |s| parse_version(s).map(|v| v.to_string());
        assert_eq!(
            v("Docker version 28.3.0, build 38b7060").as_deref(),
            Some("28.3.0")
        );
        assert_eq!(v("2.38.1-desktop.1").as_deref(), Some("2.38.1"));
        assert_eq!(v("v2.21.0").as_deref(), Some("2.21.0"));
        assert_eq!(v("5.5.1").as_deref(), Some("5.5.1"));
        assert_eq!(v("24.0.7-0ubuntu4").as_deref(), Some("24.0.7"));
        assert_eq!(v("26.1.3+dfsg1").as_deref(), Some("26.1.3"));
        assert_eq!(v("build 38b7060"), None);
        assert_eq!(v("1.2"), None);
    }

    #[test]
    fn desktop_suffixed_compose_meets_minimum() {
        let min = Version::new(2, 21, 0);
        assert!(parse_version("2.38.1-desktop.1").unwrap() >= min);
        assert!(parse_version("v2.20.3").unwrap() < min);
        assert!(parse_version("5.0.0").unwrap() >= min);
    }

    #[test]
    fn docker_cli_version_string() {
        assert_eq!(
            docker_cli_version("Docker version 28.3.0, build 38b7060\n").as_deref(),
            Some("28.3.0")
        );
        assert_eq!(
            docker_cli_version("Docker version 24.0.7-0ubuntu4, build 24.0.7").as_deref(),
            Some("24.0.7-0ubuntu4")
        );
        assert_eq!(docker_cli_version("something else"), None);
    }

    #[test]
    fn classify_real_messages() {
        use DockerErrorKind::*;
        // Captured from Docker 28.3.0 (macOS); Windows/Linux phrasings from the Docker CLI source.
        let cases = [
            (
                "Cannot connect to the Docker daemon at unix:///Users/x/.docker/run/docker.sock. Is the docker daemon running?",
                EngineNotRunning,
            ),
            (
                r#"error during connect: Get "http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.51/info": open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified."#,
                EngineNotRunning,
            ),
            (
                r#"permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock: Get "http://%2Fvar%2Frun%2Fdocker.sock/v1.51/info": dial unix /var/run/docker.sock: connect: permission denied"#,
                PermissionDenied,
            ),
            (
                "docker: 'compose' is not a docker command.\nSee 'docker --help'",
                ComposeMissing,
            ),
            (
                "docker: unknown command: docker compose\n\nRun 'docker --help' for more information",
                ComposeMissing,
            ),
            (
                "Error response from daemon: Ports are not available: exposing port TCP 127.0.0.1:8480 -> 127.0.0.1:0: listen tcp 127.0.0.1:8480: bind: address already in use",
                PortInUse,
            ),
            (
                "Bind for 127.0.0.1:8480 failed: port is already allocated",
                PortInUse,
            ),
            (
                "write /var/lib/docker/tmp/GetImageBlob123: no space left on device",
                DiskFull,
            ),
            (
                r#"error getting credentials - err: exec: "docker-credential-desktop": executable file not found in $PATH, out: ``"#,
                CredentialHelper,
            ),
            (
                r#"Error response from daemon: Head "https://ghcr.io/v2/cau-kiel-ai/arbodat-plus-web-api/manifests/v4.0.0": unauthorized"#,
                RegistryUnauthorized,
            ),
            (
                r#"Error response from daemon: Head "https://ghcr.io/v2/cau-kiel-ai/arbodat-plus-web-api/manifests/v4.0.0": denied: denied"#,
                RegistryUnauthorized,
            ),
            (
                r#"Error response from daemon: Get "https://ghcr.io/v2/": dial tcp: lookup ghcr.io: no such host"#,
                Offline,
            ),
            (
                "Error response from daemon: Get \"https://registry-1.docker.io/v2/\": net/http: TLS handshake timeout",
                Offline,
            ),
            ("something entirely different", Other),
        ];
        for (stderr, expected) in cases {
            assert_eq!(classify(stderr), expected, "{stderr}");
        }
    }
}
