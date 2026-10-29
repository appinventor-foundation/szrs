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
RUN pnpm turbo run build --filter=@szrs/dashboard

# adapter-node's build/ is a standalone server (build/index.js). Behind a
# reverse proxy, set ORIGIN (e.g. https://dashboard.example.com) or SvelteKit
# rejects form posts.
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 svelte
COPY --from=builder --chown=svelte:nodejs /app/apps/dashboard/build ./build
COPY --from=builder --chown=svelte:nodejs /app/apps/dashboard/package.json ./package.json
USER svelte
EXPOSE 3000
CMD ["node", "build"]
