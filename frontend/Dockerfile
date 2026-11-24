# Stage 1: Build SCSS to CSS using npm and dart-sass, and stamp the app version.
# --platform=$BUILDPLATFORM: always run on the host architecture; this stage's output (CSS,
# text files) is architecture-independent, so the multi-arch build needs no QEMU emulation.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build-stage
WORKDIR /app

ARG APP_VERSION=0.0.0

# Install dart-sass (pinned in package-lock.json); node_modules is not part of the image.
COPY package.json package-lock.json .npmrc ./
RUN npm ci

# Copy the SCSS files and the vendored libraries into the container
COPY ./scss ./scss
COPY ./vendor ./vendor

RUN find ./scss -name "*.scss" ! -name "_*" -exec sh -c 'mv "$1" "${1%.scss}.min.scss"' _ {} \;

# Compile SCSS to CSS. Bootstrap's SCSS still uses Sass's deprecated if(); our own files use @import.
RUN npx sass --style=compressed --quiet-deps --silence-deprecation=import,if-function ./scss:./css

# Bootstrap's SCSS was build input only; the browser never needs it.
RUN rm -rf vendor/*/scss

# Stamp the release version into the shared footer component and a machine-readable version.json
# (read by the desktop app and by ops to confirm which version is actually running after an update).
COPY components ./components
COPY *.html ./
RUN sed -i "s/__APP_VERSION__/${APP_VERSION}/" components/app-footer.js \
    && printf '{"version":"%s"}\n' "${APP_VERSION}" > version.json

# Stage 2: Serve files with nginx (>= 1.27.3 for "upstream ... resolve")
FROM nginx:1.30-alpine AS production-stage

# nginx config: static files + /api/ -> web-api, /nominatim-reverse -> OpenStreetMap
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY nginx/templates /etc/nginx/templates

WORKDIR /usr/share/nginx/html

# Only the files actually served: HTML pages, JS, components, the vendored third-party libraries
# (without Bootstrap's SCSS) and the compiled CSS/version.json from the build stage, and the
# images referenced by the pages
COPY js ./js
COPY --from=build-stage /app/vendor ./vendor
COPY --from=build-stage /app/components ./components
COPY --from=build-stage /app/css ./css
COPY --from=build-stage /app/*.html /app/version.json ./
COPY img/favicon.png img/logo_arbodat_plus.png img/logo_cau.png \
     img/logo_nfdi4objects.png img/logo_nihk.png \
     ./img/
