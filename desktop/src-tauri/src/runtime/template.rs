//! The stack definition. `deploy/compose.yml` is the single source of truth (server admins use
//! it directly); the app embeds it at build time, so app version and stack definition always
//! ship together.

/// Compose project name: every compose call passes it explicitly.
pub const PROJECT: &str = "arbodat-plus";
/// The data volume. Declared `external` in compose.yml, so compose never creates or deletes it;
/// the app creates it once at install time.
pub const DATA_VOLUME: &str = "arbodat-plus-database";
/// The services, in the order the UI lists them.
pub const SERVICES: [&str; 3] = ["database", "web-api", "frontend"];
/// File name inside the runtime directory.
pub const COMPOSE_FILE: &str = "compose.yml";

pub const COMPOSE_YML: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../deploy/compose.yml"
));

#[cfg(test)]
mod tests {
    //! These guard the data-safety invariants of the stack definition: a careless edit to
    //! deploy/compose.yml (renaming the volume, making it non-external, publishing the database)
    //! must fail the build rather than silently orphan or expose users' data.
    use super::*;
    use yaml_rust2::{Yaml, YamlLoader};

    fn doc() -> Yaml {
        YamlLoader::load_from_str(COMPOSE_YML)
            .expect("deploy/compose.yml is valid YAML")
            .remove(0)
    }

    #[test]
    fn project_name_is_pinned() {
        assert_eq!(doc()["name"].as_str(), Some(PROJECT));
    }

    #[test]
    fn services_match() {
        let d = doc();
        let mut names: Vec<&str> = d["services"]
            .as_hash()
            .unwrap()
            .keys()
            .filter_map(Yaml::as_str)
            .collect();
        names.sort_unstable();
        let mut expected = SERVICES.to_vec();
        expected.sort_unstable();
        assert_eq!(names, expected);
    }

    #[test]
    fn data_volume_is_external_and_never_renamed() {
        let d = doc();
        let volumes = d["volumes"].as_hash().unwrap();
        assert_eq!(volumes.len(), 1, "exactly one named volume");
        let database = &d["volumes"]["database"];
        assert_eq!(database["name"].as_str(), Some(DATA_VOLUME));
        assert_eq!(
            database["external"].as_bool(),
            Some(true),
            "compose must never create or remove the data volume"
        );
        let mounts = d["services"]["database"]["volumes"].as_vec().unwrap();
        assert!(
            mounts
                .iter()
                .any(|m| m.as_str() == Some("database:/var/lib/postgresql/data"))
        );
    }

    #[test]
    fn only_the_frontend_is_published_and_only_on_loopback_by_default() {
        let d = doc();
        for (name, service) in d["services"].as_hash().unwrap() {
            let has_ports = !service["ports"].is_badvalue();
            assert_eq!(
                has_ports,
                name.as_str() == Some("frontend"),
                "{name:?} ports"
            );
        }
        let ports = d["services"]["frontend"]["ports"].as_vec().unwrap();
        assert_eq!(ports.len(), 1);
        let mapping = ports[0].as_str().unwrap();
        assert!(
            mapping.starts_with("${ARBODAT_BIND:-127.0.0.1}:${ARBODAT_PORT:-"),
            "{mapping}"
        );
    }

    #[test]
    fn postgres_is_glibc_based_and_versioned_images_need_arbodat_version() {
        let d = doc();
        let db_image = d["services"]["database"]["image"].as_str().unwrap();
        assert!(db_image.starts_with("postgres:16"), "{db_image}");
        assert!(
            !db_image.contains("alpine"),
            "switching libc corrupts existing text indexes: {db_image}"
        );
        for service in ["web-api", "frontend"] {
            let image = d["services"][service]["image"].as_str().unwrap();
            assert!(image.contains("${ARBODAT_VERSION"), "{service}: {image}");
        }
    }
}
