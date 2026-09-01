# @szrs/llm-proxy

A Fastify service that proxies chat-completion calls to LLM providers (hosted or self-hosted, anything speaking an OpenAI-compatible `/chat/completions` API) and logs usage to Postgres. It exists as its own deployable service — not a `packages/*` library — because `apps/bszrs` (the Blockly plugin) is meant to be embeddable independently of any one dashboard deployment, so it needs a stable HTTP API rather than depending on the dashboard's own backend.

Consumers: `apps/dashboard` (reads `/v1/usage*` for reporting) and `apps/bszrs` (calls `/v1/chat/completions` to generate code/blocks). Both share request/response types via `@szrs/llm-proxy-contracts`.

## Prerequisites

- Node 24.20.0, pnpm 11.22.0 (see repo-root `mise.toml` — run `mise install`)
- Docker, for local Postgres and Jaeger

## Running locally (dev)

The `docker-compose.yml` here defines Postgres and Jaeger (for viewing traces — see below) — the day-to-day loop is those two in Docker, the service itself running natively via `pnpm dev` for fast reload. From this directory (`apps/llm-proxy`):

```bash
cp .env.example .env.local   # then fill in INTERNAL_API_KEY, OPENAI_API_KEY, etc.
docker compose up -d
DATABASE_URL=postgresql://llm_proxy:llm_proxy@localhost:5432/llm_proxy pnpm db:migrate
pnpm dev
```

`pnpm dev` runs the TypeScript source directly via `tsx watch` — no build step. It auto-loads `.env.local` from this directory (via Node's `--env-file-if-exists` flag, passed to `tsx`), so no manual exporting needed. Server listens on `PORT` (default `3000`).

`db:generate`/`db:migrate` (both wrap `drizzle-kit`, via `drizzle.config.ts`) deliberately do **not** auto-load `.env.local` — a config file should just read `process.env` however it's populated, not go looking for local dotenv files itself, since that same config also has to work unmodified in CI and any future deploy pipeline where no `.env.local` exists. Pass `DATABASE_URL` inline (as above) or export it in your shell first.

## Testing the containerized build

This is a separate, occasional check — not part of the normal dev loop — for when you've touched the `Dockerfile` and want to confirm the image actually builds and runs. No compose file for this on purpose, so it can't get started by accident alongside your native `pnpm dev`:

```bash
# from the monorepo root — the build context has to be the root (workspace:* deps)
docker build -f apps/llm-proxy/Dockerfile -t llm-proxy .

docker run --rm -p 3000:3000 --env-file apps/llm-proxy/.env.local \
  -e DATABASE_URL=postgresql://llm_proxy:llm_proxy@host.docker.internal:5432/llm_proxy \
  llm-proxy
```

(`host.docker.internal` so the container can reach the Postgres you already have running via `docker compose up -d` in `apps/llm-proxy`.) Tear it down with `docker stop` / `docker rm`, or just `Ctrl-C` since it's `--rm`.

## Verifying it's working

```bash
curl http://localhost:3000/healthz                      # -> 200 always, no auth
curl http://localhost:3000/readyz                        # -> 200 if DB is reachable, 503 otherwise
curl -H "x-internal-api-key: $INTERNAL_API_KEY" \
     http://localhost:3000/v1/usage                       # -> 200, [] if nothing logged yet

curl -X POST http://localhost:3000/v1/chat/completions \
     -H "x-internal-api-key: $INTERNAL_API_KEY" \
     -H "content-type: application/json" \
     -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hi"}]}'
```

A successful chat completion writes a row to `request_logs`, which `/v1/usage` and `/v1/usage/summary` then reflect.

## Tests

Two genuinely different tiers, kept as separate scripts rather than one: a test that needs a real database is an integration test, not a unit test, and folding them together would mean either giving `test:unit` a hidden DB dependency or lying about what `test:integration` needs.

```bash
pnpm test:unit           # no DB, no network — mocked provider fetch, config parsing. Runs in the repo's normal CI job.
docker compose up -d
DATABASE_URL=postgresql://llm_proxy:llm_proxy@localhost:5432/llm_proxy pnpm db:migrate
DATABASE_URL=postgresql://llm_proxy:llm_proxy@localhost:5432/llm_proxy INTERNAL_API_KEY=test-secret pnpm test:integration
```

(CI sets `DATABASE_URL`/`INTERNAL_API_KEY` as job env directly rather than inline like this — see `.github/workflows/test.yml`.)

`test:unit` must pass with `DATABASE_URL` unset entirely — that's how you'd notice if a "unit" test accidentally started depending on a real database.

## Inspecting the database

```bash
docker exec -it llm-proxy-postgres-1 psql -U llm_proxy -d llm_proxy
```
`\dt` lists tables, `\d request_logs` shows the schema, `select * from request_logs;` shows rows. Any Postgres GUI client (TablePlus, Postico, DBeaver, ...) also works — `localhost:5432`, user/password/db all `llm_proxy`.

## Viewing traces

`docker-compose.yml` runs a local Jaeger alongside Postgres, with `.env.example`'s default `OTEL_EXPORTER_OTLP_ENDPOINT` already pointed at it. UI: **http://localhost:16686** — pick service `llm-proxy`. Every request gets an HTTP-level span; `POST /v1/chat/completions` additionally has a nested `llm.chat` span (tagged `llm.provider`/`llm.model`) around the actual provider call, so you can see upstream latency separate from the rest of the request.

## Architecture notes

- **Everything is a Fastify plugin.** `src/app.ts` decorates `config`/`db`/`registry` on the root instance, then registers `plugins/auth.ts` and `plugins/error-handler.ts` (both wrapped in `fastify-plugin`'s `fp()` — required so their hook/error-handler apply app-wide rather than being scoped to their own plugin encapsulation) and the route plugins in `src/routes/*.ts`, which read `fastify.db` / `fastify.registry` / `fastify.config` rather than taking them as function parameters.
- **Providers** (`src/providers/`): a single `Provider` interface with one `OpenAiCompatibleProvider` implementation, instantiated once per configured backend (hosted OpenAI, and/or one self-hosted OpenAI-compatible endpoint via `SELF_HOSTED_BASE_URL`/`SELF_HOSTED_MODEL`). `providers/registry.ts` maps a model id to a provider instance from env config.
- **Database**: Postgres via Drizzle, this service's own database — not shared with `apps/dashboard`'s (eventual) database, even if they run on the same Postgres instance locally. Migrations are file-based (`drizzle-kit generate` → commit the SQL → `drizzle-kit migrate` to apply), not `drizzle-kit push`.
- **OpenTelemetry**: `src/otel.ts` is preloaded via `node --import` (see `start` script) so instrumentation patches modules before app code runs. Traces only; no metrics/log export. `OTEL_EXPORTER_OTLP_ENDPOINT` unset just skips exporting entirely (spans are created but discarded) — locally it's set by default to the Jaeger container from `docker-compose.yml`.
