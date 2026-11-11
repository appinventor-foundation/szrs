# Build context: monorepo root (needed for workspace:* deps and the root lockfile).
# docker build -f apps/dashboard/Dockerfile .

FROM node:24.20.0-slim AS base
RUN corepack enable

FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo@2.10.12
COPY . .
RUN turbo prune @szrs/dashboard --docker
# The evaluation reports are built from apps/evals, which the dashboard does not
# depend on, so it is pruned on its own.
RUN turbo prune @szrs/evals --docker --out-dir out-evals

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
# SvelteKit validates its environment variables while building, so these need
# values here. They are placeholders: nothing connects or signs anything at build
# time, and an ARG is not part of the runtime environment. The real values come
# from the compose file.
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build
ARG BETTER_AUTH_SECRET=build-only-placeholder-not-a-secret-0000
ARG DASHBOARD_URL=http://localhost:3000
ARG PROXY_URL=http://localhost:3000
RUN pnpm turbo run build --filter=@szrs/dashboard

# The evaluation reports the dashboard serves at /evals. The results' JSON,
# write-ups and pictures are committed; the HTML reports and their index are
# generated (and gitignored), so they are built here with `pnpm report`. Only the
# files the dashboard serves (HTML, Markdown, PNG) go on to the runner: the raw
# results JSON stays behind.
FROM base AS reports
WORKDIR /app
COPY --from=pruner /app/out-evals/json/ .
COPY --from=pruner /app/out-evals/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out-evals/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out-evals/full/ .
# The proxy reads the contracts package from its build output.
RUN pnpm turbo run build --filter=@szrs/llm-proxy-contracts
RUN pnpm --filter @szrs/evals report
RUN mkdir /evals-out \
	&& cd apps/evals/results \
	&& find . -type f \( -name '*.html' -o -name '*.md' -o -name '*.png' \) -exec cp --parents {} /evals-out \;

# adapter-node leaves the runtime dependencies (postgres, drizzle-orm, zod, ...)
# out of build/, so the runner needs production node_modules.
FROM base AS prod-deps
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN pnpm install --frozen-lockfile --prod

# One-shot image that applies the committed migrations with drizzle-kit, then
# creates the first admin if there is none (scripts/ensure-admin.ts):
# docker build --target migrate -f apps/dashboard/Dockerfile .
# Needs DATABASE_URL, BETTER_AUTH_SECRET, DASHBOARD_URL and, until an admin
# exists, INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD. It runs before the
# dashboard starts (see the compose file); a failure here blocks the dashboard.
FROM builder AS migrate
WORKDIR /app/apps/dashboard
CMD ["sh", "-c", "pnpm exec drizzle-kit migrate && pnpm exec tsx scripts/ensure-admin.ts"]

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
# Served, behind sign-in, at /evals (see EVALS_DIR in src/env.ts).
COPY --from=reports --chown=svelte:nodejs /evals-out /app/apps/evals/results
ENV EVALS_DIR=/app/apps/evals/results
USER svelte
EXPOSE 3000
CMD ["node", "build"]
