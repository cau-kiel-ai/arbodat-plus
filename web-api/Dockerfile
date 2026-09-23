# Stage 1: Build.
# --platform=$BUILDPLATFORM: always run the JVM build on the *host* architecture, even when
# building the final image for a different one (e.g. amd64 host -> arm64 image). The runtime
# stage below has no RUN, so cross-building needs no QEMU emulation at all.
FROM --platform=$BUILDPLATFORM gradle:8.8-jdk17 AS build
WORKDIR /app
COPY . .
RUN --mount=type=cache,target=/home/gradle/.gradle \
    gradle bootJar --no-daemon

# Stage 2: Run.
# eclipse-temurin:17-jre is multi-arch (amd64+arm64).
FROM eclipse-temurin:17-jre AS production-stage

ARG APP_VERSION=0.0.0
LABEL org.opencontainers.image.title="ArboDat+ web-api" \
      org.opencontainers.image.source="https://github.com/cau-kiel-ai/arbodat_plus" \
      org.opencontainers.image.version="${APP_VERSION}"

# The base image ships a non-root "ubuntu" user (uid/gid 1000) and a world-writable /tmp
# (needed: MigrationController writes uploaded .mdb files to java.io.tmpdir).
USER 1000:1000
WORKDIR /app
COPY --from=build --chown=1000:1000 /app/build/libs/web-api.jar web-api.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/web-api.jar"]
