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

/// Compose reads this file from the project directory automatically.
pub const ENV_FILE: &str = ".env";
/// Where ArboDat+ is reachable on this computer unless the user picks another port.
pub const DEFAULT_PORT: u16 = 8480;
/// Lowest port the app uses: no privileged ports, and the launcher's browser link allows four or
/// five digits (see capabilities/launcher.json).
pub const MIN_PORT: u16 = 1024;
/// Only this computer can reach a local installation.
pub const BIND: &str = "127.0.0.1";
pub const PASSWORD_LEN: usize = 32;

/// The `.env` of a local installation. The version is the stack (image) version.
pub fn render_env(version: &str, password: &str, port: u16) -> String {
    format!(
        "# Written by the ArboDat+ desktop app. Don't change DATABASE_PASSWORD: PostgreSQL only applies it\n\
         # when the database volume is first created, so a different value locks the app out of its data.\n\
         ARBODAT_VERSION={version}\n\
         DATABASE_PASSWORD={password}\n\
         ARBODAT_PORT={port}\n\
         ARBODAT_BIND={BIND}\n"
    )
}

/// `KEY=VALUE` lines; comments, blank lines and anything else are ignored. Values are taken
/// literally (no quotes or interpolation: we only ever write plain values ourselves).
pub fn parse_env(text: &str) -> std::collections::HashMap<String, String> {
    text.lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.starts_with('#') {
                return None;
            }
            let (key, value) = line.split_once('=')?;
            Some((key.trim().to_string(), value.trim().to_string()))
        })
        .collect()
}

/// The `.env` of an existing local installation with another port: password and version stay.
pub fn env_with_port(existing: &str, port: u16) -> Result<String, String> {
    let env = parse_env(existing);
    let value = |key: &str| {
        env.get(key)
            .filter(|v| !v.is_empty())
            .ok_or_else(|| format!("the .env file has no {key}"))
    };
    Ok(render_env(
        value("ARBODAT_VERSION")?,
        value("DATABASE_PASSWORD")?,
        port,
    ))
}

/// The port a `.env` asks for, if it is a usable one.
pub fn port_of(env: &std::collections::HashMap<String, String>) -> Option<u16> {
    env.get("ARBODAT_PORT")
        .and_then(|p| p.parse().ok())
        .filter(|p| *p >= MIN_PORT)
}

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

    #[test]
    fn env_round_trips() {
        let env = parse_env(&render_env("5.0.0", "s3cretPASS", 8480));
        assert_eq!(env["ARBODAT_VERSION"], "5.0.0");
        assert_eq!(env["DATABASE_PASSWORD"], "s3cretPASS");
        assert_eq!(env["ARBODAT_PORT"], "8480");
        assert_eq!(env["ARBODAT_BIND"], "127.0.0.1");
        assert_eq!(env.len(), 4, "comments must not become entries");
    }

    #[test]
    fn changing_the_port_keeps_password_and_version() {
        let old = render_env("5.0.0", "s3cretPASS", 8480);
        let new = parse_env(&env_with_port(&old, 9000).unwrap());
        assert_eq!(new["ARBODAT_PORT"], "9000");
        assert_eq!(new["DATABASE_PASSWORD"], "s3cretPASS");
        assert_eq!(new["ARBODAT_VERSION"], "5.0.0");
        assert_eq!(new["ARBODAT_BIND"], "127.0.0.1");
    }

    #[test]
    fn changing_the_port_refuses_an_env_without_password_or_version() {
        assert!(env_with_port("ARBODAT_VERSION=5.0.0\n", 9000).is_err());
        assert!(env_with_port("DATABASE_PASSWORD=x\n", 9000).is_err());
        assert!(env_with_port("DATABASE_PASSWORD=\nARBODAT_VERSION=5.0.0\n", 9000).is_err());
    }

    #[test]
    fn port_of_accepts_only_usable_ports() {
        let env = |p: &str| parse_env(&format!("ARBODAT_PORT={p}\n"));
        assert_eq!(port_of(&env("9000")), Some(9000));
        assert_eq!(port_of(&env("80")), None);
        assert_eq!(port_of(&env("1023")), None);
        assert_eq!(port_of(&env("70000")), None);
        assert_eq!(port_of(&env("abc")), None);
        assert_eq!(port_of(&parse_env("")), None);
    }

    #[test]
    fn parse_env_ignores_comments_blank_and_malformed_lines() {
        let env = parse_env("# c\n\nA=1\n  B = two \nnot a pair\n#C=3\nD=\n");
        assert_eq!(env.len(), 3);
        assert_eq!(
            (env["A"].as_str(), env["B"].as_str(), env["D"].as_str()),
            ("1", "two", "")
        );
    }

    #[test]
    fn rendered_env_satisfies_every_required_variable_in_compose_yml() {
        // `${NAME:?message}` means compose refuses to start without NAME.
        let env = parse_env(&render_env("5.0.0", "pw", DEFAULT_PORT));
        let mut required = Vec::new();
        let mut rest = COMPOSE_YML;
        while let Some(start) = rest.find("${") {
            let inner = &rest[start + 2..];
            let end = inner.find('}').expect("unterminated ${");
            let expr = &inner[..end];
            if let Some((name, _)) = expr.split_once(":?") {
                required.push(name.to_string());
            }
            rest = &inner[end..];
        }
        assert!(
            required.contains(&"DATABASE_PASSWORD".to_string()),
            "{required:?}"
        );
        assert!(
            required.contains(&"ARBODAT_VERSION".to_string()),
            "{required:?}"
        );
        for name in required {
            assert!(
                env.contains_key(&name),
                "the app's .env doesn't define {name}, which compose.yml requires"
            );
        }
    }

    #[test]
    fn default_port_and_bind_match_the_compose_defaults() {
        assert!(COMPOSE_YML.contains(&format!("${{ARBODAT_BIND:-{BIND}}}")));
        assert!(COMPOSE_YML.contains(&format!("${{ARBODAT_PORT:-{DEFAULT_PORT}}}")));
    }
}
