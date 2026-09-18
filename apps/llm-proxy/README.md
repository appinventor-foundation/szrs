# @szrs/llm-proxy

A thin Fastify passthrough in front of a self-hosted [LiteLLM](https://docs.litellm.ai/) gateway (which handles provider routing, fallbacks, rate limits, virtual keys, and usage/cost tracking natively — this service doesn't reimplement any of that). It exists purely because `apps/blockly-szrs` (the Blockly plugin) is client-side code with nowhere safe to hold a LiteLLM virtual key — this service holds that one secret server-side and validates/forwards requests.

`apps/dashboard` is **not** a consumer of this service. It has its own backend (or will), so it gets its own LiteLLM virtual key and calls LiteLLM directly for both generation and its own usage/spend reporting — that integration doesn't exist yet in this repo. This asymmetry (one consumer routed through here, the other calling LiteLLM directly) is deliberate — see the plan/PR history for the rationale, not a placeholder to "fix" by adding dashboard routes here.

Local dev infra (LiteLLM, Langfuse, Jaeger, and their backing stores) lives in **`infra/llm-proxy/`**, not in this directory — it's not a workspace package (`pnpm-workspace.yaml` only scopes `apps/*`/`packages/*`), it participates in no `turbo run build/test/lint` task, and it isn't code this app bundles. Keeping it out of `apps/llm-proxy` mirrors how `.github/workflows/` sits outside the workspace-package tree for the same reason.

## Prerequisites

- Node 24.20.0, pnpm 11.22.0 (see repo-root `mise.toml` — run `mise install`)
- Docker, for the local LiteLLM/Langfuse/Jaeger stack

## Running locally (dev)

```bash
cp .env.example .env.local   # then fill in INTERNAL_API_KEY
cd ../../infra/llm-proxy
cp .env.example .env   # then fill in the secrets — see that file's comments
docker compose up -d
```

(`infra/llm-proxy` uses a bare `.env`, not `.env.local` — Docker Compose only auto-loads a file literally named `.env`, so every `docker compose` command here — `up`, `down`, `logs`, etc. — picks it up with no extra flag needed. Naming it `.env.local` would mean typing `--env-file .env.local` on every single invocation or getting "variable is not set" warnings, as happens if you forget it.)

Mint a virtual key for this service (one-time, or whenever you recreate `litellm-db`'s volume):

```bash
set -a && source .env && set +a
curl -s http://localhost:4000/key/generate \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" -H "Content-Type: application/json" \
  -d '{"key_alias": "bszrs"}'
# copy the returned "key" into apps/llm-proxy/.env.local as LITELLM_VIRTUAL_KEY
```

Then, from `apps/llm-proxy`:

```bash
pnpm dev
```

`pnpm dev` runs the TypeScript source directly via `tsx watch` — no build step. It auto-loads `apps/llm-proxy/.env.local` (via Node's `--env-file-if-exists` flag, passed to `tsx`), so no manual exporting needed. Server listens on `PORT` (default `3000`).

Two separate env files, deliberately: `apps/llm-proxy/.env.local` holds what the Node app itself reads (`INTERNAL_API_KEY`, `LITELLM_BASE_URL`, `LITELLM_VIRTUAL_KEY`, ...); `infra/llm-proxy/.env` holds secrets only `docker compose` interpolates into the LiteLLM/Langfuse stack (`LITELLM_MASTER_KEY`, Langfuse's various secrets, ...) — the app never reads the second file, and compose never reads the first.

## Testing the containerized build

A separate, occasional check — not part of the normal dev loop — for when you've touched the `Dockerfile` and want to confirm the image actually builds and runs:

```bash
# from the monorepo root — the build context has to be the root (workspace:* deps)
docker build -f apps/llm-proxy/Dockerfile -t llm-proxy .

docker run --rm -p 3000:3000 --env-file apps/llm-proxy/.env.local \
  -e LITELLM_BASE_URL=http://host.docker.internal:4000 \
  llm-proxy
```

(`host.docker.internal` so the container can reach the LiteLLM you already have running via `infra/llm-proxy`'s compose stack.) Tear it down with `docker stop`/`docker rm`, or `Ctrl-C` since it's `--rm`.

## Verifying it's working

```bash
curl http://localhost:3000/healthz                       # -> 200 always, no auth
curl http://localhost:3000/readyz                         # -> 200 if LiteLLM is reachable, 503 otherwise

curl -X POST http://localhost:3000/v1/chat/completions \
     -H "x-internal-api-key: $INTERNAL_API_KEY" \
     -H "content-type: application/json" \
     -d '{"model":"local-ollama","messages":[{"role":"user","content":"hi"}]}'
```

(`local-ollama`/`local-lmstudio`/`gpt-4o-mini` are the model names configured in `infra/llm-proxy/docker/litellm/config.yaml` — swap for whichever backend you actually have running/keyed.) A successful call shows up as a trace in both Langfuse (`http://localhost:3001`, the LLM call itself — prompt, tokens, cost) and Jaeger (`http://localhost:16686`, the HTTP request as a whole) — see "Viewing traces" below for why it's split across both.

## Tests

```bash
pnpm test:unit
```

One tier — no DB, no network, nothing external to spin up. This service owns no database and no provider logic of its own, so there's nothing left that would need real infrastructure to test; the upstream LiteLLM call is mocked (`vi.stubGlobal('fetch', ...)`) in `test/unit/routes/chat.test.ts`.

## Viewing traces

Two independent destinations, covering different things — this is intentional, not overlap:

- **Langfuse** (`http://localhost:3001`, from `infra/llm-proxy`'s compose stack) — traces the LLM call itself: prompt/response, token counts, cost, which model/provider actually served it. Wired via LiteLLM's own `success_callback`/`failure_callback: ["langfuse"]` (see `infra/llm-proxy/docker/litellm/config.yaml`) — no custom instrumentation code in this app at all.
- **Jaeger** (`http://localhost:16686`) — traces general server behavior: every HTTP request this service handles (all routes, not just `/v1/chat/completions`), plus log/trace correlation in the pino output. This is `@opentelemetry/auto-instrumentations-node`'s stock `instrumentation-http`/`instrumentation-pino`, not something LiteLLM/Langfuse would ever give you, since Langfuse only ever sees LLM calls specifically.

`OTEL_EXPORTER_OTLP_ENDPOINT` unset just skips exporting entirely (spans are created but discarded) — `.env.example`'s default already points at the Jaeger container.

## Architecture notes

- **Everything is a Fastify plugin.** `src/app.ts` decorates `config` on the root instance, then registers `plugins/auth.ts` and `plugins/error-handler.ts` (both wrapped in `fastify-plugin`'s `fp()` — required so their hook/error-handler apply app-wide rather than being scoped to their own plugin encapsulation) and the route plugins in `src/routes/*.ts`, which read `fastify.config` rather than taking it as a function parameter.
- **`src/routes/chat.ts`** validates the incoming request against `ChatCompletionRequestSchema` (from `@szrs/llm-proxy-contracts`), forwards it to LiteLLM as a bearer-authenticated OpenAI-shaped request, and — since `ChatCompletionResponseSchema` is this service's own normalized shape, not raw OpenAI's — maps LiteLLM's raw response into that shape before validating and returning it. A non-2xx from LiteLLM is forwarded with its original status code, not collapsed to a generic 500.
- **`src/routes/health.ts`**'s `/readyz` checks LiteLLM's `/health/liveliness` endpoint — any HTTP response counts as "reachable" (even a 401), only a network-level failure means not-ready, since readiness shouldn't depend on `LITELLM_VIRTUAL_KEY` being valid.
- **No database, no provider abstraction, no usage-reporting endpoints** live in this service — LiteLLM's own spend/usage tracking (`/spend/logs`, per-virtual-key) covers what a `request_logs` table used to, and `apps/dashboard` would query LiteLLM directly for that in the future rather than through here.
