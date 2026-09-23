# ArboDat+ web-api

The REST backend: Spring Boot 3.3, Java 17, Gradle 8.8, PostgreSQL via Spring Data JPA.

## Running standalone (without Docker)

1. Start a local PostgreSQL:
   ```sh
   docker run --name arbodat-plus-dev-db -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres:16
   ```
   This matches the defaults in `src/main/resources/application.properties`
   (`jdbc:postgresql://localhost:5432/postgres`, user `postgres`, password `password`). Override
   any of them with the usual Spring Boot environment variables, e.g.
   `SPRING_DATASOURCE_PASSWORD`, as `docker-compose.yml` and `deploy/compose.yml` do.
2. ```sh
   ./gradlew bootRun
   ```
   The schema is created/updated automatically on startup (Hibernate `ddl-auto=update` — see
   `../info/TODO.md` for why this should eventually become Flyway migrations). There are no seed
   data and no migrations: a fresh database starts empty. The DANTE vocabulary tables are filled by
   the *frontend*, not here (see `../frontend/js/danteAttributes/`), the first time someone opens
   the Data Input page with internet access.

Build the runnable jar with `./gradlew bootJar` (output: `build/libs/web-api.jar`).
`./gradlew test` exists but is currently disabled (see the commented-out block in `build.gradle`).

## API

All endpoints are plain REST, mounted at the root (no `/api` prefix — that prefix is added by
nginx in front of this service, see `../frontend/nginx/templates/`, not by this app). The full
list with examples is in [`../info/API.txt`](../info/API.txt).

There is no authentication and no per-user authorization (see `../info/TODO.md`); every deployment
must restrict network access itself (VPN/intranet, or a reverse proxy with its own auth).

## Source layout

```
src/main/java/arbodat/plus/
├── controller/         one @RestController per resource (@RequestMapping paths = the API above)
├── model/               JPA entities
├── repository/          Spring Data repositories
├── service/              business logic, incl. service/migration_mapper/
└── dto_migration/       request/response shapes for MigrationController (see below)
```

`MigrationController` imports data from the legacy MS Access-based ArboDat (via
[jackcess](https://jackcess.sourceforge.io/)) — the `.mdb` upload flow used by the frontend's Data
Migration page. This is unrelated to the *desktop app's* "legacy import" feature, which moves data
between different ArboDat**+** installations (Docker volumes), not from the old ArboDat.

## Docker image

`Dockerfile` builds a multi-arch, non-root (`uid 1000`) image on `eclipse-temurin:17-jre`. Build
it directly (`docker build .`) or via `docker-compose.yml` (dev) / `deploy/compose.yml` (prod, from
GHCR). Pass `--build-arg APP_VERSION=x.y.z` to stamp the version into the image's OCI labels.
