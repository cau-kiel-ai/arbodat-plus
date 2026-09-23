# Stage 1: Build SCSS to CSS using npm and dart-sass, and stamp the app version.
# --platform=$BUILDPLATFORM: always run on the host architecture; this stage's output (CSS,
# text files) is architecture-independent, so the multi-arch build needs no QEMU emulation.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build-stage
WORKDIR /app

ARG APP_VERSION=0.0.0

# Copy the SCSS files into the container
COPY ./sass ./sass
COPY ./bootstrap-scss ./bootstrap-scss

RUN find ./sass -name "*.scss" -exec sh -c 'mv "$1" "${1%.scss}.min.scss"' _ {} \;

# Install dart-sass globally
RUN npm install -g sass@1.62.1

# Compile SCSS to CSS
RUN sass --style=compressed ./sass:./css

# Stamp the release version into pages footer and a machine-readable version.json (read by the
# desktop app and by ops to confirm which version is actually running after an update).
COPY *.html ./
RUN sed -i "s/__APP_VERSION__/${APP_VERSION}/" *.html \
    && printf '{"version":"%s"}\n' "${APP_VERSION}" > version.json

# Stage 2: Serve files with nginx (>= 1.27.3 for "upstream ... resolve")
FROM nginx:1.30-alpine AS production-stage

# nginx config: static files + /api/ -> web-api, /nominatim-reverse -> OpenStreetMap
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY nginx/templates /etc/nginx/templates

WORKDIR /usr/share/nginx/html

# Only the files actually served: HTML pages (version-stamped), JS and the compiled
# CSS/version.json from the build stage, and the 6 images referenced by the pages (frontend/img
# has ~85MB of others, tracked in git but not linked from anywhere -- see info/TODO.md).
COPY js ./js
COPY --from=build-stage /app/css ./css
COPY --from=build-stage /app/*.html /app/version.json ./
COPY img/favicon.png img/banner.png img/logo_arbodat_plus.png \
     img/cau-norm-de-lilagrey-rgb-0720.png img/nfdi4objects_logo_volltitel_digital_USE.png \
     img/Logo_NIhK_Homepage_ausdemNetz_CKN.png \
     ./img/
