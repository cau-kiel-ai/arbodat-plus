# ArboDat+

## Overview
ArboDat+ is the continued development of the archaeobotanical database program ArboDat. It is being carried out as a collaborative project between NFDI for Objects, Kiel University, and the Lower Saxony Institute for Historical Coastal Research, Germany.

ArboDat+ is designed as an operating system-independent web application. It features a newly implemented PostgreSQL database that transitions the system to an open and free platform. While the database remains relational, data integrity is ensured by adapting the old schema in accordance with the principles of the third normal form.

ArboDat+ uses central lists of standardized vocabularies and thesauri, stored at Dante VZG. It also allows the addition of local attribute labels to the central Dante Server. These labels are manually reviewed before being uploaded centrally, updating the thesauri lists for all users automatically. This ensures that the data remains consistent and interoperable with other datasets, while still allowing flexibility for unique requirements.

The system also supports data migration through the **'Data Migration'** module. New records can be entered using the **‘Data Input’** module. Additionally, data entries can be queried, filtered, modified, and exported into various file formats through the **'Data Explorer'** module. An interactive map is also provided for easy management of site locations.

Please note that this is an early public release, and further improvements are recommended. For example, the data import functionality is still to be refined, and integration with a data repository would further enhance the system's capabilities.

## Start ArboDat+ Application:  
##### Requirements: *Docker*
`cp .env.example .env` (then set your own `DATABASE_PASSWORD` in `.env`)  
`docker compose --profile prod up -d --build`

Next, open a web browser and go to `http://localhost`

## Directory Structure
```
├── database
│   ├── data                 # postgresql database bind mount
│   └── ERD
│
├── frontend
│   ├── bootstrap-scss
│   ├── css
│   ├── img
│   ├── js
│   ├── sass
│   │   └── scss files       # are compiled to css files
│   ├── html files
│   └── Dockerfile
│
├── web-api
│   ├── build/libs
│   │   └── web-api.jar
│   ├── src/main
│   │   ├── java/arbodat/plus
│   │   │   ├── controller
│   │   │   ├── model
│   │   │   ├── repository
│   │   │   └── service
│   │   │       ├── migration_mapper
│   │   │       └── MigrationService
│   │   └── resources
│   │       └── application.properties
│   ├── build.gradle
│   └── Dockerfile
│
├── node-proxy
│   ├── server.js
│   ├── package.json
│   └── Dockerfile
│
├── info
│   ├── DANTE-terminologies
│   ├── API-URLs
│   └── data-migration-table-mapping
:
├── .env.example             # copy to .env (git-ignored) and set the database password
├── .gitignore
└── docker-compose.yml
```

## Export ArboDat+
- Build Docker Images:  
  `docker compose --profile prod build --no-cache`
- Export and bundle Docker Images:  
  `docker save -o ArboDat+.tar postgres:16 arbodat_plus-frontend:latest arbodat_plus-web-api:latest arbodat_plus-node-proxy:latest`
- Load Docker Images:  
  `docker load -i ArboDat+.tar`
- Start ArboDat+ via Docker:  
  `docker compose up`

## Development
Start ArboDat+ via Docker in dev mode:  
`docker compose --profile dev build --no-cache`  
`docker compose --profile dev up --build`  
- bind mount of frontend folder into nginx container  
(auto update of frontend changes while Application is running)
- node-proxy is available at http://localhost:3000

### Database - PostgreSQL
Database is created using *postgres:16* Docker Image
  - Creation of test database:  
  `docker run --name test-database -p 5432:5432 --env POSTGRES_PASSWORD=password -d postgres:16`

### Web API - Spring Boot
Web API (backend) is built with *Spring Boot 3.3*, using *Gradle 8.8* as the build tool and *JDK 17* as the runtime environment.
- Run Web-API:  
  *Gradle -> Tasks -> application -> bootRun*

- Build `web-api.jar`:
  - Windows:  
    `cd web-api && gradlew build && cd ..`
    
  - Linux/macOS:  
  `cd web-api && chmod u+x gradlew && cd ..` (make ***gradlew*** file executable)  
  `cd web-api && sudo ./gradlew build && cd ..`

### Node Proxy
- Creation of test node-proxy:  
  `docker build --no-cache -t node-proxy ./node-proxy`  
  `docker run --name test-node-proxy -p 3000:3000 node-proxy`

### Frontend
- Compile css files from scss files via *Sass*
  - Recommended settings for [*Live Sass Compiler*](https://marketplace.visualstudio.com/items?itemName=glenn2223.live-sass):  
  copy this to `.vscode/settings.json`: 
    ```
    "liveSassCompile.settings.formats": [
        {
            "format": "compressed",
            "extensionName": ".min.css",
            "savePath": "/frontend/css"
        }
    ],
    "liveSassCompile.settings.forceBaseDirectory": "/frontend/sass"
    ``` 
  - *Live Sass Compiler -> Watch Sass* (to generate css files)

## License
See [LICENSE.md](LICENSE.md) and [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) for details
