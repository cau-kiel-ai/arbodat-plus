# ArboDat+
[![CI](https://github.com/cau-kiel-ai/arbodat-plus/actions/workflows/ci.yml/badge.svg)](https://github.com/cau-kiel-ai/arbodat-plus/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/cau-kiel-ai/arbodat-plus?include_prereleases&label=version)](https://github.com/cau-kiel-ai/arbodat-plus/releases)
[![License](https://img.shields.io/badge/license-BSD--2--Clause-blue)](LICENSE.md)
[![DOI](https://img.shields.io/badge/DOI-10.5281%2Fzenodo.17938311-blue)](https://doi.org/10.5281/zenodo.17938311)
![Docker](https://img.shields.io/badge/Docker-required-2496ED?logo=docker&logoColor=white)

ArboDat+ is the continued development of the archaeobotanical database program ArboDat. It is being carried out as a collaborative project between NFDI for Objects, Kiel University, and the Lower Saxony Institute for Historical Coastal Research, Germany.

**Features**
- ArboDat+ is designed as an operating system-independent web application.

- A newly implemented PostgreSQL database transitions the system to an open and free platform. While the database remains relational, data integrity is ensured by adapting the old schema in accordance with the principles of the third normal form.

- ArboDat+ uses central lists of standardized vocabularies and thesauri, stored at Dante VZG. It also allows the addition of local attribute labels to the central Dante Server. These labels are manually reviewed before being uploaded centrally, updating the thesauri lists for all users automatically. This ensures that the data remains consistent and interoperable with other datasets, while still allowing flexibility for unique requirements.

- New records can be entered using the **‘Data Input’** module.
- Existing data sets from legacy MS Access ArboDat can be imported via the **'Data Migration'** module.
- Data entries can be queried, filtered, modified, and exported into various file formats through the **'Data Explorer'** module.
- An interactive map provides easy location management of sites and reverse geocoding allows address details to be filled in automatically.
- The **'Data Export'** module exports the whole database, or only selected research projects, sites, features or samples, to a JSON file.
- Default values and custom order of Dante attributes in the 'Data Input' forms can be configured in the **'Settings'** module.

Please note that this is an early public release, and further improvements are recommended. For example, the data import functionality is still to be refined, and integration with a data repository would further enhance the system's capabilities.

## Install ArboDat+
- **On your own computer:** download the ArboDat+ desktop app from the
  [releases page](https://github.com/cau-kiel-ai/arbodat-plus/releases). It installs, starts, backs up
  and updates ArboDat+ for you, using Docker. See [docs/INSTALL.md](docs/INSTALL.md) for Docker and the
  first start.
- **On a server for several people:** see [deploy/README.md](deploy/README.md).

## Start ArboDat+
This builds and runs the application from the source code (for development).

Requirements: [Docker Desktop](https://docs.docker.com/desktop/) (or Docker Engine with the Compose plugin ≥ 2.21 on Linux)

`cp .env.example .env`  
`docker compose --profile prod up -d --build`

Next, open a web browser and go to http://localhost:8480

## Project Structure
```
arbodat-plus
├── .github/workflows        # CI and release workflows
├── database
│   └── data                 # postgresql development database (bind mount)
├── deploy                   # production compose.yml
├── desktop                  # ArboDat+ desktop app
│   ├── src                  # - Control Center UI
│   └── src-tauri            # - Rust backend
├── docs
│   ├── API.md
│   ├── DANTE-terminologies.md
│   ├── data-migration-table-mapping.pdf
│   ├── DEVELOPMENT.md
│   ├── ERD.png
│   └── INSTALL.md
├── frontend                 # web pages (HTML/JS/CSS) served by nginx
├── scripts                  # release version helpers
├── web-api                  # Spring Boot REST backend
├── .env.example
└── docker-compose.yml       # development stack
```

## Development
How to set up the repository, run the dev stack, contribute, and make a release:
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## License
See [LICENSE.md](LICENSE.md) and [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) for details.
