# ArboDat+ web-api

The REST backend: Spring Boot 3.3, Java 17, Gradle 8.8, PostgreSQL via Spring Data JPA.

```
web-api
├── build/libs
│   └── web-api.jar      # build output (git-ignored)
├── src/main
│   ├── java/arbodat/plus
│   │   ├── controller
│   │   ├── dto_migration
│   │   ├── model
│   │   ├── repository
│   │   └── service
│   │       ├── migration_mapper
│   │       └── MigrationService
│   └── resources
│       └── application.properties
├── build.gradle
└── Dockerfile
```

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
   The schema is created/updated automatically on startup (Hibernate `ddl-auto=update`). There are no seed
   data and no migrations: a fresh database starts empty. The DANTE vocabulary tables are filled by
   the *frontend*, not here (see `../frontend/js/danteAttributes/`), the first time someone opens
   the Data Input page with internet access.

Build the runnable jar with `./gradlew bootJar` (output: `build/libs/web-api.jar`).
`./gradlew test` runs the tests against a real Postgres 16 (Testcontainers), so Docker has to be running.

## API

All endpoints are plain REST, mounted at the root (no `/api` prefix — that prefix is added by
nginx in front of this service, see `../frontend/nginx/templates/`, not by this app). The full
list with examples is in [`../docs/API.md`](../docs/API.md).

## Source layout

```
src/main/java/arbodat/plus/
├── controller/         one @RestController per resource (@RequestMapping paths = the API above)
├── model/              JPA entities
├── repository/         Spring Data repositories
├── service/            business logic, incl. service/migration_mapper/
└── dto_migration/      request/response shapes for MigrationController (see below)
```

`MigrationController` imports data from the legacy MS Access-based ArboDat (via
[jackcess](https://jackcess.sourceforge.io/)) — the `.mdb` upload flow used by the frontend's Data
Migration page.

## Docker image

`Dockerfile` builds a multi-arch, non-root (`uid 1000`) image on `eclipse-temurin:17-jre`. Build
it directly (`docker build .`) or via `docker-compose.yml` (dev) / `deploy/compose.yml` (prod, from
GHCR). Pass `--build-arg APP_VERSION=x.y.z` to stamp the version into the image's OCI labels.
