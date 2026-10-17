//! Turning raw facts (install state, engine, containers) into what the UI shows. Pure, so every
//! combination is unit-tested.

use semver::Version;

use super::model::{
    EngineStatus, ServiceHealth, ServiceState, ServiceStatus, StackPhase, StackStatus,
};
use super::parse::ComposeContainer;
use super::state::InstallState;
use super::template::SERVICES;

/// One entry per expected service, in `SERVICES` order; services without a container are `Missing`.
pub fn service_statuses(containers: &[ComposeContainer]) -> Vec<ServiceStatus> {
    SERVICES
        .iter()
        .map(
            |&name| match containers.iter().find(|c| c.service == name) {
                None => ServiceStatus {
                    name: name.into(),
                    state: ServiceState::Missing,
                    health: None,
                    exit_code: None,
                },
                Some(c) => {
                    let state = match c.state.as_str() {
                        "created" => ServiceState::Created,
                        "running" => ServiceState::Running,
                        "restarting" => ServiceState::Restarting,
                        "paused" => ServiceState::Paused,
                        "exited" => ServiceState::Exited,
                        "dead" => ServiceState::Dead,
                        "removing" => ServiceState::Removing,
                        _ => ServiceState::Unknown,
                    };
                    let health = match c.health.as_str() {
                        "starting" => Some(ServiceHealth::Starting),
                        "healthy" => Some(ServiceHealth::Healthy),
                        "unhealthy" => Some(ServiceHealth::Unhealthy),
                        _ => None,
                    };
                    let exit_code = matches!(state, ServiceState::Exited | ServiceState::Dead)
                        .then_some(c.exit_code)
                        .flatten();
                    ServiceStatus {
                        name: name.into(),
                        state,
                        health,
                        exit_code,
                    }
                }
            },
        )
        .collect()
}

/// The phase of an installed stack on a reachable engine.
pub fn phase_of(services: &[ServiceStatus]) -> StackPhase {
    use ServiceState as S;
    let up = |s: &ServiceStatus| {
        s.state == S::Running && matches!(s.health, None | Some(ServiceHealth::Healthy))
    };
    let coming_up = |s: &ServiceStatus| {
        (s.state == S::Running && s.health == Some(ServiceHealth::Starting))
            || s.state == S::Created
    };
    let alive = |s: &ServiceStatus| matches!(s.state, S::Running | S::Restarting | S::Paused);
    let failing = |s: &ServiceStatus| {
        matches!(s.state, S::Restarting | S::Paused | S::Dead | S::Unknown)
            || (s.state == S::Running && s.health == Some(ServiceHealth::Unhealthy))
    };

    if services.iter().all(up) {
        StackPhase::Running
    } else if !services.iter().any(alive) {
        StackPhase::Stopped
    } else if services.iter().any(failing) {
        StackPhase::Degraded
    } else if services.iter().all(|s| up(s) || coming_up(s)) {
        StackPhase::Starting
    } else {
        // Some running, some exited or missing.
        StackPhase::Degraded
    }
}

/// `containers` is `None` when they weren't (or couldn't be) queried.
pub fn stack_status(
    state: &Result<Option<InstallState>, String>,
    engine: &EngineStatus,
    containers: Option<&Result<Vec<ComposeContainer>, String>>,
    app_version: &Version,
) -> StackStatus {
    let state = match state {
        Err(e) => return unknown(None, e.clone()),
        Ok(None) => {
            return StackStatus {
                phase: StackPhase::NotInstalled,
                installed_version: None,
                update_available: false,
                services: Vec::new(),
                detail: None,
            };
        }
        Ok(Some(state)) => state,
    };
    let installed_version = Some(state.installed_version.clone());
    let Ok(installed) = Version::parse(&state.installed_version) else {
        return unknown(
            installed_version,
            format!(
                "state.json has an invalid version: {:?}",
                state.installed_version
            ),
        );
    };
    let newer_than_app = installed > *app_version;
    let update_available = installed < *app_version;
    let simple = |phase| StackStatus {
        phase,
        installed_version: installed_version.clone(),
        update_available,
        services: Vec::new(),
        detail: None,
    };

    let Some(current_engine) = engine.running_id() else {
        return simple(StackPhase::EngineUnavailable);
    };
    if state
        .engine_id
        .as_deref()
        .is_some_and(|id| id != current_engine)
    {
        return simple(StackPhase::WrongEngine);
    }
    let containers = match containers {
        None => {
            return unknown(
                installed_version,
                "the stack's containers were not checked".into(),
            );
        }
        Some(Err(e)) => return unknown(installed_version, e.clone()),
        Some(Ok(containers)) => containers,
    };
    let services = service_statuses(containers);
    let phase = if newer_than_app {
        StackPhase::NewerThanApp
    } else {
        phase_of(&services)
    };
    StackStatus {
        phase,
        installed_version,
        update_available,
        services,
        detail: None,
    }
}

fn unknown(installed_version: Option<String>, detail: String) -> StackStatus {
    StackStatus {
        phase: StackPhase::Unknown,
        installed_version,
        update_available: false,
        services: Vec::new(),
        detail: Some(detail),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use StackPhase as P;

    fn c(service: &str, state: &str, health: &str) -> ComposeContainer {
        ComposeContainer {
            service: service.into(),
            state: state.into(),
            health: health.into(),
            exit_code: Some(0),
        }
    }
    fn phase(containers: &[ComposeContainer]) -> StackPhase {
        phase_of(&service_statuses(containers))
    }
    fn installed(version: &str, engine_id: Option<&str>) -> Result<Option<InstallState>, String> {
        Ok(Some(InstallState {
            schema: 1,
            installed_version: version.into(),
            port: 8480,
            docker_host: None,
            engine_id: engine_id.map(Into::into),
        }))
    }
    fn running_engine(id: &str) -> EngineStatus {
        EngineStatus::Running {
            version: "28.3.0".into(),
            os: "Docker Desktop".into(),
            id: id.into(),
        }
    }
    const V5: Version = Version::new(5, 0, 0);

    // The four states from the original tutorial (A–D) ---------------------------------------

    #[test]
    fn a_nothing_installed() {
        let s = stack_status(&Ok(None), &running_engine("e1"), None, &V5);
        assert_eq!(s.phase, P::NotInstalled);
        assert!(s.services.is_empty());
    }

    #[test]
    fn b_installed_but_no_containers() {
        assert_eq!(phase(&[]), P::Stopped);
        let s = stack_status(
            &installed("5.0.0", Some("e1")),
            &running_engine("e1"),
            Some(&Ok(vec![])),
            &V5,
        );
        assert_eq!(s.phase, P::Stopped);
        assert!(s.services.iter().all(|s| s.state == ServiceState::Missing));
    }

    #[test]
    fn c_partially_running() {
        let containers = [
            c("database", "running", "healthy"),
            c("web-api", "running", "healthy"),
            c("frontend", "exited", ""),
        ];
        assert_eq!(phase(&containers), P::Degraded);
    }

    #[test]
    fn d_everything_running_and_healthy() {
        let containers = [
            c("database", "running", "healthy"),
            c("web-api", "running", "healthy"),
            c("frontend", "running", "healthy"),
        ];
        assert_eq!(phase(&containers), P::Running);
    }

    // More phases ------------------------------------------------------------------------------

    #[test]
    fn all_exited_is_stopped_not_degraded() {
        let containers = [
            c("database", "exited", ""),
            c("web-api", "exited", ""),
            c("frontend", "exited", ""),
        ];
        assert_eq!(phase(&containers), P::Stopped);
    }

    #[test]
    fn during_up_wait_is_starting() {
        let creating = [
            c("database", "running", "starting"),
            c("web-api", "created", ""),
            c("frontend", "created", ""),
        ];
        assert_eq!(phase(&creating), P::Starting);
        let schema_creation = [
            c("database", "running", "healthy"),
            c("web-api", "running", "starting"),
            c("frontend", "running", "healthy"),
        ];
        assert_eq!(phase(&schema_creation), P::Starting);
    }

    #[test]
    fn unhealthy_restarting_or_missing_is_degraded() {
        let unhealthy = [
            c("database", "running", "healthy"),
            c("web-api", "running", "unhealthy"),
            c("frontend", "running", "healthy"),
        ];
        assert_eq!(phase(&unhealthy), P::Degraded);
        let crash_loop = [
            c("database", "restarting", ""),
            c("web-api", "exited", ""),
            c("frontend", "exited", ""),
        ];
        assert_eq!(phase(&crash_loop), P::Degraded);
        let one_missing = [
            c("database", "running", "healthy"),
            c("web-api", "running", "healthy"),
        ];
        assert_eq!(phase(&one_missing), P::Degraded);
    }

    #[test]
    fn unknown_container_states_never_count_as_running() {
        let odd = [
            c("database", "running", "healthy"),
            c("web-api", "something-new", ""),
            c("frontend", "running", "healthy"),
        ];
        assert_eq!(phase(&odd), P::Degraded);
    }

    #[test]
    fn exit_code_only_reported_for_stopped_containers() {
        let mut crashed = c("web-api", "exited", "");
        crashed.exit_code = Some(137);
        let services = service_statuses(&[c("database", "running", "healthy"), crashed]);
        assert_eq!(services[0].exit_code, None);
        assert_eq!(services[1].exit_code, Some(137));
        assert_eq!(services[2].state, ServiceState::Missing);
    }

    #[test]
    fn engine_not_running_with_installation() {
        let s = stack_status(
            &installed("5.0.0", Some("e1")),
            &EngineStatus::NotRunning { detail: "x".into() },
            None,
            &V5,
        );
        assert_eq!(s.phase, P::EngineUnavailable);
        assert_eq!(s.installed_version.as_deref(), Some("5.0.0"));
    }

    #[test]
    fn different_engine_than_at_install_time() {
        let s = stack_status(
            &installed("5.0.0", Some("e1")),
            &running_engine("e2"),
            Some(&Ok(vec![])),
            &V5,
        );
        assert_eq!(s.phase, P::WrongEngine);
    }

    #[test]
    fn engine_id_unknown_at_install_time_is_not_wrong_engine() {
        let s = stack_status(
            &installed("5.0.0", None),
            &running_engine("e2"),
            Some(&Ok(vec![])),
            &V5,
        );
        assert_eq!(s.phase, P::Stopped);
    }

    #[test]
    fn versions_newer_and_older_than_the_app() {
        let all_up = Ok(vec![
            c("database", "running", "healthy"),
            c("web-api", "running", "healthy"),
            c("frontend", "running", "healthy"),
        ]);
        let older = stack_status(
            &installed("4.9.0", None),
            &running_engine("e1"),
            Some(&all_up),
            &V5,
        );
        assert_eq!((older.phase, older.update_available), (P::Running, true));
        let newer = stack_status(
            &installed("5.1.0", None),
            &running_engine("e1"),
            Some(&all_up),
            &V5,
        );
        assert_eq!(
            (newer.phase, newer.update_available),
            (P::NewerThanApp, false)
        );
        assert_eq!(newer.services.len(), 3, "services still shown");
        let same = stack_status(
            &installed("5.0.0-dev", None),
            &running_engine("e1"),
            Some(&all_up),
            &Version::parse("5.0.0-dev").unwrap(),
        );
        assert_eq!((same.phase, same.update_available), (P::Running, false));
        let rc_before_release = stack_status(
            &installed("5.0.0-rc.1", None),
            &running_engine("e1"),
            Some(&all_up),
            &V5,
        );
        assert!(rc_before_release.update_available);
    }

    #[test]
    fn damaged_state_or_compose_error_is_unknown_with_detail() {
        let damaged = stack_status(
            &Err("state.json is damaged".into()),
            &running_engine("e1"),
            None,
            &V5,
        );
        assert_eq!(damaged.phase, P::Unknown);
        assert_eq!(damaged.detail.as_deref(), Some("state.json is damaged"));

        let compose_failed = stack_status(
            &installed("5.0.0", None),
            &running_engine("e1"),
            Some(&Err("required variable DATABASE_PASSWORD is missing".into())),
            &V5,
        );
        assert_eq!(compose_failed.phase, P::Unknown);
        assert!(compose_failed.detail.unwrap().contains("DATABASE_PASSWORD"));

        let bad_version = stack_status(
            &installed("five", None),
            &running_engine("e1"),
            Some(&Ok(vec![])),
            &V5,
        );
        assert_eq!(bad_version.phase, P::Unknown);
    }
}
