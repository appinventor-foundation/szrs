# Used by docker-compose.dokploy.yml only. Dokploy re-clones the repo on every
# deploy, which can empty bind mounts, so the config is baked into the image
# instead. Keep the version in step with docker-compose.yml.
FROM clickhouse/clickhouse-server:25.12
COPY listen-ipv4.xml memory-limit.xml /etc/clickhouse-server/config.d/
