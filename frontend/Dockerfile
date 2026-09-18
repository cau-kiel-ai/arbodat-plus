# Stage 1: Build SCSS to CSS using npm and dart-sass
FROM node:16 AS build-stage

# Set the working directory
WORKDIR /app

# Copy the SCSS files into the container
COPY ./sass ./sass
COPY ./bootstrap-scss ./bootstrap-scss

RUN find ./sass -name "*.scss" -exec sh -c 'mv "$1" "${1%.scss}.min.scss"' _ {} \;

# Install dart-sass globally
RUN npm install -g sass@1.62.1

# Compile SCSS to CSS
RUN sass --style=compressed ./sass:./css 

# Stage 2: Serve files with nginx (>= 1.27.3 for "upstream ... resolve")
FROM nginx:1.30-alpine AS production-stage

# nginx config: static files + /api/ -> web-api, /nominatim-reverse -> OpenStreetMap
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY nginx/templates /etc/nginx/templates

# Copy compiled CSS files and other necessary files into nginx's web root
COPY . /usr/share/nginx/html
COPY --from=build-stage /app/css /usr/share/nginx/html/css