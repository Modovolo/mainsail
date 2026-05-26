# Mainsail Dockerfile for Fleet Deployment
# Multi-stage build for optimized container size
#
# Build targets:
#   - unprivileged (default): Non-root nginx on port 8080
#   - runner: Standard nginx on port 80

ARG BUILDPLATFORM=linux/amd64

#
# Builder stage - builds the Vue.js application
#
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder

LABEL org.opencontainers.image.source="https://github.com/mainsail-crew/mainsail"
LABEL org.opencontainers.image.description="Mainsail - A modern web interface for Klipper"
LABEL org.opencontainers.image.licenses="GPL-3.0"

RUN apk add --no-cache zip

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json /app/

# Install dependencies
RUN npm config set fetch-retries 6 \
        && npm config set fetch-retry-factor 2 \
        && npm config set fetch-retry-mintimeout 20000 \
        && npm config set fetch-retry-maxtimeout 120000 \
        && npm config set maxsockets 1 \
        && install_ok=0 \
        && for attempt in 1 2 3; do \
                if npm ci --prefer-offline --no-audit; then \
                    install_ok=1; \
                    break; \
                fi; \
                if [ "$attempt" -eq 3 ]; then \
                    echo "npm ci failed after ${attempt} attempts"; \
                    exit 1; \
                fi; \
                echo "npm ci failed (attempt ${attempt}/3), retrying in $((attempt * 15))s"; \
                sleep $((attempt * 15)); \
            done \
        && [ "$install_ok" -eq 1 ]

# Copy source code
COPY ./ /app/

# Build the application
RUN npm run build && rm -f /app/dist/mainsail.zip

# Generate unprivileged nginx config (port 8080)
RUN sed 's/80/8080/g' .docker/nginx.conf > .docker/nginx.conf.unprivileged

#
# Unprivileged runner stage - non-root nginx on port 8080 (recommended for K8s)
#
FROM nginxinc/nginx-unprivileged:stable-alpine AS unprivileged

LABEL org.opencontainers.image.source="https://github.com/mainsail-crew/mainsail"
LABEL org.opencontainers.image.description="Mainsail - A modern web interface for Klipper"
LABEL org.opencontainers.image.licenses="GPL-3.0"

USER root

# Clean default nginx html
RUN rm -rf /usr/share/nginx/html/*

# Copy nginx config and built assets
COPY --link --from=builder /app/.docker/nginx.conf.unprivileged /etc/nginx/conf.d/default.conf
COPY --link --from=builder /app/dist/ /usr/share/nginx/html/

# Create config.json placeholder (can be overridden via ConfigMap)
RUN chown -R nginx:nginx /usr/share/nginx/html

USER nginx

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost:8080/ || exit 1

#
# Standard runner stage - root nginx on port 80
#
FROM nginx:stable-alpine AS runner

LABEL org.opencontainers.image.source="https://github.com/mainsail-crew/mainsail"
LABEL org.opencontainers.image.description="Mainsail - A modern web interface for Klipper"
LABEL org.opencontainers.image.licenses="GPL-3.0"

# Clean default nginx html
RUN rm -rf /usr/share/nginx/html/*

# Copy nginx config and built assets
COPY --from=builder /app/.docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist/ /usr/share/nginx/html/

EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost:80/ || exit 1
