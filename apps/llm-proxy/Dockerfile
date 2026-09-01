# Build context: monorepo root (needed for workspace:* deps and the root lockfile).
# docker build -f apps/llm-proxy/Dockerfile .

FROM node:24.20.0-slim AS base
RUN corepack enable

FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo@2.10.12
COPY . .
RUN turbo prune @szrs/llm-proxy --docker

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
RUN pnpm turbo run build --filter=@szrs/llm-proxy

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 fastify
COPY --from=builder --chown=fastify:nodejs /app/apps/llm-proxy/dist ./apps/llm-proxy/dist
COPY --from=builder --chown=fastify:nodejs /app/apps/llm-proxy/package.json ./apps/llm-proxy/package.json
COPY --from=builder --chown=fastify:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=fastify:nodejs /app/apps/llm-proxy/node_modules ./apps/llm-proxy/node_modules
# apps/llm-proxy's node_modules/@szrs/llm-proxy-contracts is a symlink into
# packages/llm-proxy-contracts (pnpm workspace linking) — the target must exist
# in this image too, with its own build output, not just the symlink.
COPY --from=builder --chown=fastify:nodejs /app/packages/llm-proxy-contracts/dist ./packages/llm-proxy-contracts/dist
COPY --from=builder --chown=fastify:nodejs /app/packages/llm-proxy-contracts/package.json ./packages/llm-proxy-contracts/package.json
COPY --from=builder --chown=fastify:nodejs /app/packages/llm-proxy-contracts/node_modules ./packages/llm-proxy-contracts/node_modules
USER fastify
WORKDIR /app/apps/llm-proxy
EXPOSE 3000
CMD ["node", "--import", "./dist/otel.js", "dist/index.js"]
