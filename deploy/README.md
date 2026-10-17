# ArboDat+ server installation

This folder is everything a server needs to run ArboDat+ with Docker Compose. It is the same
`compose.yml` that the ArboDat+ desktop app uses for local installs, so an install here behaves
the same way and can be migrated to/from a desktop install with the same backup/restore commands.

## ⚠️ No built-in authentication

The ArboDat+ web API has no login and no per-user access control (see
[../info/TODO.md](../info/TODO.md)). Anyone who can reach the published port can read and change
all data. **Only run this behind a VPN, an intranet, or a reverse proxy that adds authentication.**
Never publish it directly to the public internet.

## Requirements

[Docker](https://docs.docker.com/desktop/), including the `docker compose` plugin. Install it for
[Windows](https://docs.docker.com/desktop/setup/install/windows-install/),
[Mac](https://docs.docker.com/desktop/setup/install/mac-install/) or
[Linux](https://docs.docker.com/engine/install/) (a server typically wants Docker Engine, not
Docker Desktop).

## Setup

1. Create the database volume once. `compose.yml` declares it `external`, so Compose will refuse
   to start until it exists — this is deliberate: it stops a typo or a wrong working directory
   from silently creating a second, empty database (see `compose.yml` for details).
   ```sh
   docker volume create arbodat-plus-database
   ```
2. Copy `.env.example` to `.env` and fill in `ARBODAT_VERSION` and a strong `DATABASE_PASSWORD`.
   Find the version to use on the [releases page](https://github.com/cau-kiel-ai/arbodat-plus/releases)
   — the release itself is tagged e.g. `v1.0.0`, but `ARBODAT_VERSION` must be **without the "v"**
   (`1.0.0`).
   ```sh
   cp .env.example .env
   ```
3. Start ArboDat+:
   ```sh
   docker compose pull
   docker compose up -d --wait
   ```
4. Open `http://<this-server>:8480` (or whatever `ARBODAT_PORT` you set) — through your reverse
   proxy / VPN, not directly from the internet.

## Putting a reverse proxy in front (recommended)

`compose.yml` binds only to `127.0.0.1` by default (`ARBODAT_BIND`), so the app itself is not
reachable from the network — a reverse proxy on the same host is expected to terminate TLS and
forward to it. Data Migration uploads two files up to 250 MB each and Data Export streams a gzip
response, so the proxy needs matching body-size and timeout settings, e.g. for nginx:

```nginx
server {
    listen 443 ssl;
    server_name arbodat-plus.example.org;
    # ssl_certificate ...; ssl_certificate_key ...;

    client_max_body_size 260m;
    proxy_request_buffering off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;

    location / {
        proxy_pass http://127.0.0.1:8480;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Add your own authentication in front of this (e.g. `auth_basic`, an OIDC proxy, or restrict access
at the VPN/firewall level) — see the warning above.

## Backup

```sh
docker compose exec -T database pg_dump -U postgres -Fc postgres > "arbodat-plus-$(date +%Y-%m-%d).dump"
```
Do this before every upgrade, and on whatever schedule fits your data (there is no automatic
backup on a server install). Keep the `.dump` files somewhere separate from the Docker host.

## Restore

**This replaces all current data — take a fresh backup first if you're unsure.**

```sh
docker compose stop web-api frontend
docker compose exec -T database psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
docker compose exec -T database pg_restore -U postgres -d postgres --no-owner < arbodat-plus-2026-01-01.dump
docker compose up -d --wait
```

## Upgrading to a new version

1. [Backup](#backup) first.
2. Edit `ARBODAT_VERSION` in `.env`.
3. ```sh
   docker compose pull
   docker compose up -d --wait
   ```
   The database schema is migrated automatically on startup. If something goes wrong, set
   `ARBODAT_VERSION` back to the previous value, `docker compose up -d --wait` again, and
   [restore](#restore) the pre-upgrade backup.

## Migrating data from an installation older than v5.0.0
TODO: maybe delete if not needed
Releases before v5.0.0 shipped as Docker image tarballs with no fixed Compose project name, so
their data volume can be named almost anything (`database`, `arbodat_plus-database`,
`arbodat-plus-database`, …) — check `docker volume ls` on the old machine. The safest way to move
that data into a v5.0.0+ install is a dump/restore, which works regardless of the old volume's
name and doesn't depend on both installs running at once:

1. On the **old** machine, find the volume (`docker volume ls`) and make sure **no other
   container is currently using it** (`docker ps --filter volume=<old-volume-name>`) — if one is,
   stop it first; never run two PostgreSQL servers on the same volume at once. If the old stack's
   `docker-compose.yml`/`.env` still exist, the simplest option is to start it normally and run the
   [Backup](#backup) command against it. Otherwise, dump it directly:
   ```sh
   docker run -d --name legacy-reader --network none \
     -v <old-volume-name>:/var/lib/postgresql/data postgres:16
   docker exec legacy-reader pg_dump -U postgres postgres -Fc > legacy.dump
   docker stop -t 60 legacy-reader && docker rm legacy-reader
   ```
   (No password needed: PostgreSQL trusts local connections from inside its own container by
   default. `--network none` keeps this temporary container off the network entirely.)
2. Copy `legacy.dump` to the new server.
3. Follow [Setup](#setup) above up to and including `docker compose up -d --wait` once, so the new
   database is initialised, then follow [Restore](#restore) using `legacy.dump`.

## Uninstalling

```sh
docker compose down
```
This stops and removes the containers but **never** the data volume — `compose.yml` declares it
`external`, so Compose does not manage its lifecycle. To actually delete the data:
```sh
docker volume rm arbodat-plus-database
```
