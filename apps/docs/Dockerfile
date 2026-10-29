# Build context: monorepo root (needed for workspace:* deps and the root lockfile).
# docker build -f apps/docs/Dockerfile .
# For a site served from a sub path: --build-arg BASE_PATH=/szrs

FROM node:24.20.0-slim AS base
RUN corepack enable

FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo@2.10.12
COPY . .
RUN turbo prune @szrs/docs --docker

FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN pnpm install --frozen-lockfile

FROM base AS builder
ARG BASE_PATH=""
ENV BASE_PATH=$BASE_PATH
WORKDIR /app
COPY --from=installer /app .
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=@szrs/docs

# adapter-static writes plain HTML with trailingSlash 'always', so nginx
# serves it as is. nginx.conf only adds relative redirects and asset caching.
FROM nginx:1.29-alpine AS runner
COPY apps/docs/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/docs/build /usr/share/nginx/html
EXPOSE 80
