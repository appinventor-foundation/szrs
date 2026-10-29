# Used by docker-compose.dokploy.yml only. Dokploy re-clones the repo on every
# deploy, which can empty bind mounts, so the config is baked into the image
# instead. Keep the version in step with docker-compose.yml.
FROM ghcr.io/berriai/litellm:v1.101.0
COPY config.yaml /app/config.yaml
