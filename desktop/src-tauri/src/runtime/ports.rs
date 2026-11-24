//! "Is this port free?", and if not, who has it. A message that says only "port in use" makes the
//! user hunt; naming the Docker container (or telling them it's some other program) doesn't.

use std::time::Duration;

use tokio::net::TcpStream;

use super::docker::DockerCli;
use super::parse::{self, PsEntry};

const PS_TIMEOUT: Duration = Duration::from_secs(15);
const CONNECT_TIMEOUT: Duration = Duration::from_millis(600);

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PortHolder {
    Container {
        name: String,
        project: Option<String>,
    },
    /// Something that isn't a Docker container accepts connections on the port.
    Program,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PortCheck {
    Free,
    InUse(PortHolder),
}

impl PortHolder {
    pub fn describe(&self, port: u16) -> String {
        match self {
            PortHolder::Container {
                name,
                project: Some(project),
            } => {
                format!(
                    "Port {port} is used by the Docker container \"{name}\" (Compose project \"{project}\")."
                )
            }
            PortHolder::Container {
                name,
                project: None,
            } => format!("Port {port} is used by the Docker container \"{name}\"."),
            PortHolder::Program => {
                format!("Port {port} is used by another program on this computer.")
            }
        }
    }
}

/// Which running container publishes `port`, ignoring those of `ignore_project` (our own stack
/// holding its own port is not a conflict). `None` = no container does.
/// `Some(None)` is returned when the only publisher is our own project.
fn publisher(
    entries: &[PsEntry],
    port: u16,
    ignore_project: Option<&str>,
) -> Option<Option<PortHolder>> {
    let entry = entries.iter().find(|e| e.host_ports.contains(&port))?;
    if ignore_project.is_some() && entry.project.as_deref() == ignore_project {
        return Some(None);
    }
    Some(Some(PortHolder::Container {
        name: entry.name.clone(),
        project: entry.project.clone(),
    }))
}

async fn something_listens(port: u16) -> bool {
    matches!(
        tokio::time::timeout(CONNECT_TIMEOUT, TcpStream::connect(("127.0.0.1", port))).await,
        Ok(Ok(_))
    )
}

/// Docker is asked first (it knows the container's name); a TCP connect then catches programs
/// that aren't containers. (A connect can't see ports merely *reserved* by Windows; Docker's own
/// bind error at start-up covers that, see `AppError::docker`.)
pub async fn check(
    cli: &DockerCli,
    port: u16,
    ignore_project: Option<&str>,
) -> Result<PortCheck, String> {
    let out = cli
        .run(["ps", "--format", "{{json .}}"], PS_TIMEOUT)
        .await
        .map_err(|e| e.to_string())?;
    if !out.success() {
        return Err(if out.stderr.is_empty() {
            "`docker ps` failed".into()
        } else {
            out.stderr
        });
    }
    let entries = parse::parse_docker_ps(&out.stdout)?;
    match publisher(&entries, port, ignore_project) {
        Some(Some(holder)) => Ok(PortCheck::InUse(holder)),
        Some(None) => Ok(PortCheck::Free),
        None if something_listens(port).await => Ok(PortCheck::InUse(PortHolder::Program)),
        None => Ok(PortCheck::Free),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> Vec<PsEntry> {
        parse::parse_docker_ps(include_str!("../../tests/fixtures/docker-ps.ndjson")).unwrap()
    }

    #[test]
    fn another_projects_container_is_named() {
        let holder = publisher(&fixture(), 18999, Some("arbodat-plus"))
            .unwrap()
            .unwrap();
        assert_eq!(
            holder,
            PortHolder::Container {
                name: "arb-sample".into(),
                project: Some("sampleproj".into())
            }
        );
        assert_eq!(
            holder.describe(18999),
            "Port 18999 is used by the Docker container \"arb-sample\" (Compose project \"sampleproj\")."
        );
    }

    #[test]
    fn a_plain_container_without_project() {
        let holder = publisher(&fixture(), 3000, Some("arbodat-plus"))
            .unwrap()
            .unwrap();
        assert_eq!(
            holder,
            PortHolder::Container {
                name: "standalone".into(),
                project: None
            }
        );
        assert_eq!(
            holder.describe(3000),
            "Port 3000 is used by the Docker container \"standalone\"."
        );
    }

    #[test]
    fn our_own_stack_holding_its_own_port_is_not_a_conflict() {
        assert_eq!(
            publisher(&fixture(), 8480, Some("arbodat-plus")),
            Some(None)
        );
        // ...but it is when we aren't ignoring it (e.g. a second install attempt on that port).
        assert!(matches!(
            publisher(&fixture(), 8480, None),
            Some(Some(PortHolder::Container { .. }))
        ));
    }

    #[test]
    fn unpublished_and_unknown_ports_have_no_container_publisher() {
        assert_eq!(
            publisher(&fixture(), 5432, None),
            None,
            "exposed-only ports are not on the host"
        );
        assert_eq!(publisher(&fixture(), 40000, None), None);
    }

    #[test]
    fn program_message() {
        assert_eq!(
            PortHolder::Program.describe(8480),
            "Port 8480 is used by another program on this computer."
        );
    }

    #[tokio::test]
    async fn tcp_probe_sees_a_real_listener_and_its_absence() {
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
            .await
            .unwrap();
        let port = listener.local_addr().unwrap().port();
        assert!(something_listens(port).await);
        drop(listener);
        assert!(!something_listens(port).await);
    }
}
