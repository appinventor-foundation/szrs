# Build context: monorepo root (needed for workspace:* deps and the root lockfile).
# docker build -f apps/dashboard/Dockerfile .

FROM node:24.20.0-slim AS base
RUN corepack enable

FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo@2.10.12
COPY . .
RUN turbo prune @szrs/dashboard --docker

FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=installer /app .
COPY --from=pruner /app/out/full/ .
# SvelteKit validates its environment variables while building, so DATABASE_URL
# needs a value here. Nothing connects at build time, and an ARG is not part of
# the runtime environment: the real URL comes from the compose file.
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm turbo run build --filter=@szrs/dashboard

# adapter-node leaves the runtime dependencies (postgres, drizzle-orm, zod, ...)
# out of build/, so the runner needs production node_modules.
FROM base AS prod-deps
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN pnpm install --frozen-lockfile --prod

# One-shot image that applies the committed migrations with drizzle-kit:
# docker build --target migrate -f apps/dashboard/Dockerfile .
# Needs DATABASE_URL. It runs before the dashboard starts (see the compose file).
FROM builder AS migrate
WORKDIR /app/apps/dashboard
CMD ["pnpm", "exec", "drizzle-kit", "migrate"]

# adapter-node's build/ is a standalone server (build/index.js). Behind a
# reverse proxy, set PROTOCOL_HEADER and HOST_HEADER (e.g. x-forwarded-proto and
# x-forwarded-host) or SvelteKit rejects form posts.
FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 svelte
# Same layout as the monorepo: the dashboard's node_modules holds symlinks into
# the store at /app/node_modules/.pnpm, and build/ resolves packages through them.
COPY --from=prod-deps --chown=svelte:nodejs /app/node_modules /app/node_modules
WORKDIR /app/apps/dashboard
COPY --from=prod-deps --chown=svelte:nodejs /app/apps/dashboard/node_modules ./node_modules
COPY --from=builder --chown=svelte:nodejs /app/apps/dashboard/build ./build
COPY --from=builder --chown=svelte:nodejs /app/apps/dashboard/package.json ./package.json
USER svelte
EXPOSE 3000
CMD ["node", "build"]
