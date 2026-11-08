# @szrs/llm-proxy

A thin Fastify passthrough in front of a self-hosted [LiteLLM](https://docs.litellm.ai/) gateway (which handles provider routing, fallbacks, rate limits, virtual keys, and usage/cost tracking natively — this service doesn't reimplement any of that). It exists purely because `apps/blockly-szrs` (the Blockly plugin) is client-side code with nowhere safe to hold a LiteLLM virtual key — this service holds that one secret server-side and validates/forwards requests.

`apps/dashboard` is **not** a consumer of this service. It has its own backend (or will), so it gets its own LiteLLM virtual key and calls LiteLLM directly for both generation and its own usage/spend reporting — that integration doesn't exist yet in this repo. This asymmetry (one consumer routed through here, the other calling LiteLLM directly) is deliberate — see the plan/PR history for the rationale, not a placeholder to "fix" by adding dashboard routes here.

Local dev infra (LiteLLM, Langfuse, Jaeger, and their backing stores) lives in **`infra/llm-proxy/`**, not in this directory — it's not a workspace package (`pnpm-workspace.yaml` only scopes `apps/*`/`packages/*`), it participates in no `turbo run build/test/lint` task, and it isn't code this app bundles. Keeping it out of `apps/llm-proxy` mirrors how `.github/workflows/` sits outside the workspace-package tree for the same reason.

## Prerequisites

- Node 24.20.0, pnpm 12.4.2 (see repo-root `mise.toml` — run `mise install`)
- Docker, for the local LiteLLM/Langfuse/Jaeger stack

## Running locally (dev)

```bash
cp .env.example .env.local   # INTERNAL_API_KEY is optional; see the file's comments
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

## Deploying alongside the plugin

The Blockly plugin and this proxy ship as a pair. Every site that uses the plugin runs its own proxy, with its own LiteLLM gateway and keys. There's no shared hosted proxy. The site's operator configures the proxy for their site with these settings (see `.env.example`):

| Setting                                | Default           | Purpose                                                                                                                                       |
| -------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `CORS_ORIGINS`                         | empty             | Comma-separated origins of the site(s) that load the plugin. Empty blocks all cross-origin browser calls.                                     |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW` | `60` / `1 minute` | Requests per client IP. A whole classroom can share one IP, so don't set this too low. `/healthz` and `/readyz` are never limited.            |
| `TRUST_PROXY`                          | `false`           | Set to `true` behind a reverse proxy or load balancer. Otherwise every user appears to have the proxy's IP and they all share one rate limit. |
| `INTERNAL_API_KEY`                     | unset             | When set, every request except health checks must send it as `x-internal-api-key`.                                                            |
| `CACHE_URL`                            | unset             | Redis or Valkey address, to reuse finished zooms across users (see "Sharing zooms between users"). Unset means no cache.                      |
| `CACHE_TTL_SECONDS`                    | `1209600` (14 d)  | How long a stored zoom is reused.                                                                                                             |
| `CACHE_TIMEOUT_MS`                     | `500`             | A cache that answers slower than this counts as a miss, so it can't delay a zoom.                                                             |

**A key sent from the browser is not a secret.** If the plugin sends `INTERNAL_API_KEY`, anyone using the site can read it in devtools. It only identifies the caller; it doesn't authenticate anyone. That's why it's optional. It's useful for server-to-server callers, and a site with user logins can put its own auth in front of the proxy instead.

**The dashboard's demo runner is the one client that needs no CORS:** it forwards the plugin's `/v1/models` and `/v1/zoom/stream` calls server-side over the internal network (`PROXY_URL`), setting `x-forwarded-for` to the visitor's address. With `TRUST_PROXY=true` the per-IP rate limit then sees each visitor, not the dashboard.

**The real spending cap is the LiteLLM virtual key.** CORS stops other websites from calling the proxy through their visitors' browsers, but not scripts or curl, and per-IP limits can be spread across many IPs. Mint the proxy's virtual key with a budget, a rate limit and a model list, so a leaked or abused proxy can only spend so much:

```bash
curl -s http://localhost:4000/key/generate \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" -H "Content-Type: application/json" \
  -d '{"key_alias": "bszrs", "max_budget": 20, "budget_duration": "30d", "rpm_limit": 60, "models": ["local-ollama", "gpt-4o-mini"]}'
```

## Verifying it's working

```bash
curl http://localhost:3000/healthz                       # -> 200 always, no auth
curl http://localhost:3000/readyz                         # -> 200 if LiteLLM is reachable, 503 otherwise

curl -X POST http://localhost:3000/v1/chat/completions \
     -H "x-internal-api-key: $INTERNAL_API_KEY" \
     -H "content-type: application/json" \
     -d '{"model":"local-ollama","messages":[{"role":"user","content":"hi"}]}'

# the model aliases the virtual key may use, as {"models": [...]}
curl http://localhost:3000/v1/models -H "x-internal-api-key: $INTERNAL_API_KEY"
```

(The `x-internal-api-key` header is only needed if `INTERNAL_API_KEY` is set.) (`local-ollama`/`local-lmstudio`/`openrouter`/`gpt-4o-mini` are the model names configured in `infra/llm-proxy/docker/litellm/config.yaml` — swap for whichever backend you actually have running/keyed.) A successful call shows up as a trace in both Langfuse (`http://localhost:3001`, the LLM call itself — prompt, tokens, cost) and Jaeger (`http://localhost:16686`, the HTTP request as a whole) — see "Viewing traces" below for why it's split across both.

## Semantic zoom

`POST /v1/zoom` takes a Blockly workspace (the Detail level) and returns two higher-level representations of it: `semantic` (one block per logical operation) and `concept` (one block per feature or responsibility of the program, and a single block for a small one). Each level contains block definitions (`blockDefs`), a workspace that uses them, and `bindings` that link editable fields on the zoomed blocks to fields in the Detail workspace. The model never writes code: programs always run from the Detail blocks. Generated block types use the `zoom_` prefix, and block definitions are limited to plain fields and inputs (no extensions, mutators, help URLs or images). Bindings are checked against the Detail workspace in the request, and any problems are sent back to the model as part of the retry.

```bash
curl -X POST http://localhost:3000/v1/zoom \
     -H "x-internal-api-key: $INTERNAL_API_KEY" \
     -H "content-type: application/json" \
     -d '{"model":"local-ollama","slug":"fizz-buzz-n","workspaceJson":{ ...a Blockly workspace export... }}'
```

The request and response shapes are `ZoomRequestSchema` and `ZoomResponseSchema` in `@szrs/llm-proxy-contracts`. If the model returns output that doesn't parse or validate, the proxy retries up to 3 times, sending the error back to the model each time. If all attempts fail it returns `502` with `code: "invalid_model_output"`.

### Prompts

The zoom prompt is versioned. Each prompt id is a frozen file in `src/zoom/prompts/` (`v0.ts`, `v1.ts`, `v2.ts`) holding the system text, how the user message is built and the sampling parameters; `index.ts` registers them and names the default (`DEFAULT_PROMPT_ID`, now `v2`). A prompt is never edited once it has produced recorded results or been deployed: a change is a new id, so results, traces and cache entries stay attributable.

- **`v0`** is the original prompt, kept word for word (a test pins its hash). The Concept level is "usually one block". It is still registered, so results can be compared with it.
- **`v1`** adds an outline of the program to the user message (`src/zoom/outline.ts`: block count and top-level stacks, which have no order), compact JSON, a `plan` the model writes first (which stacks belong to which concept; the proxy reads it with `src/zoom/plan.ts`, logs it and does not return it), one Concept block per feature or responsibility, and no colour or position for the model to set. **Frozen on 2026-11-06**, when it became the default: tests pin the hash of its text and of the messages it builds, so a change to its wording is a new id (`v2`), never an edit. Because the model no longer places blocks, `v1` needs the plugin that lays them out (`ZoomLevelLoader`): deploy the two together, or an older plugin stacks the zoomed blocks on top of each other. Zooms stored under `v0` are not reused, since the cache key has the prompt id.

- **`v2`** (the default since 2026-11-08) keeps `v1`'s outline, compact JSON, `plan` and Concept rule, and changes what the model writes for editable values and for blocks. It writes a value as a reference in the label (`{b12.NUM}`, `{b3.NUM|b9.NUM}`) and `src/zoom/placeholders.ts` turns each reference into a field and a binding (numbers and text only; a block type with references is used by one block). It writes each level's blocks as `stacks`, flat lists, and `src/zoom/stacks.ts` builds the nested `next` chains and inputs. Both happen before the schema and the checks, in `prepareOutput` (`src/zoom/zoom.ts`), so the response has the same shape as any prompt's and the plugin and the contract are unchanged. Why, and how it measured against `v0` and `v1`: `planning_documents/prompt_evaluation_and_improvements_v3.md` and `apps/evals/results/2026-11-08-v2-baseline-2.md`.

Every call sends the prompt's `params` (`temperature` 0.2 and `maxTokens` 32768, shared by all prompts in `src/zoom/prompts/params.ts`) and LiteLLM request metadata with the prompt id, so Langfuse traces can be filtered by prompt version. If a model stops because it reached its output limit (`finish_reason: length`), the zoom fails at once with `invalid_model_output` and a message saying so, with no retry, since a retry would be cut off in the same place. Each attempt is logged as one `zoom attempt` record: prompt id, model, outcome (`ok`, `parse`, `schema`, `validation`, `truncated`), finish reason, token usage, repairs, program size and, for valid results, the plan.

The cap is that high because the models we run reason before they answer and the reasoning counts against it: the spike measured a 14-block program using about 72% of an 8192 cap. It overrides the alias's `max_tokens` in the LiteLLM config, and it was tested only on the two OpenRouter aliases, so a provider that allows less output than 32768 will reject zoom requests until that model gets a lower cap (LiteLLM's model info lists 16384 for `gpt-4o-mini`, so that alias would). A fixed `temperature` was accepted by both models, but reasoning models may ignore it.

Measured model limits, parameter support and a `v0` / `v1` comparison on a sample program are in [`apps/evals`](../evals/README.md) (latest: [2026-11-06 cap and temperature spike](../evals/results/2026-11-06-cap-and-temperature-spike.md)).

### Streaming

`POST /v1/zoom/stream` takes the same request body and does the same retries, but streams progress as Server-Sent Events. It's a POST because the workspace is too large for a query string, so clients read it with `fetch` and `response.body.getReader()` rather than `EventSource`.

```bash
curl -N -X POST http://localhost:3000/v1/zoom/stream \
     -H "x-internal-api-key: $INTERNAL_API_KEY" \
     -H "content-type: application/json" \
     -d '{"model":"local-ollama","slug":"fizz-buzz-n","workspaceJson":{ ...a Blockly workspace export... }}'
```

Each event is a `data: {json}` line; parse them with `ZoomStreamEventSchema` from `@szrs/llm-proxy-contracts`:

| Event                                                       | When                                                                                     |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `{ type: 'attempt', attempt, maxAttempts, previousError? }` | Before each attempt; `previousError` explains why the last one failed                    |
| `{ type: 'token', text }`                                   | Each chunk of model output as it arrives                                                 |
| `{ type: 'done', result: { semantic, concept }, cached? }`  | Final, validated output. `cached: true` when the proxy had it stored and called no model |
| `{ type: 'error', code, message, status? }`                 | `upstream_error` (with LiteLLM's `status`), `invalid_model_output`, or `internal_error`  |

An invalid request body still gets a plain `400`. Once streaming has started the HTTP status is already `200`, so every later failure — including a LiteLLM `429` — arrives as an `error` event instead.

### Sharing zooms between users

A zoom costs a model call, which is slow and, with provider models, costs money. The proxy avoids repeating one in two ways.

**A stored result is reused.** Set `CACHE_URL` to a Redis or Valkey instance, and the proxy keeps each validated zoom for `CACHE_TTL_SECONDS`. A request for the same program from anyone is then answered from the store: the stream sends a single `done` event with `cached: true`, and no model is called. "The same program" means the same model alias, slug and blocks. Blockly gives every block a random id and saves its position, so the proxy first rewrites the workspace into a canonical form (blocks numbered `b1`, `b2`, …, positions dropped) and asks the model about that. The ids in the bindings are translated back to each caller's own before the reply. Field values are part of the key, so a program that differs in one number is a separate entry.

**Simultaneous requests share one call.** On `/v1/zoom/stream`, requests for the same program that arrive while a zoom is running join it and get the same events. A class zooming one template at the same moment costs one model call. This needs no cache. If everyone listening disconnects, the zoom stops and the upstream request is cancelled. (`/v1/zoom` uses the cache, but doesn't join running zooms.)

To run the cache locally, use the `zoom-cache` service in `infra/llm-proxy`. It is in a Compose profile, so the default stack is unchanged:

```bash
cd ../../infra/llm-proxy
# set ZOOM_CACHE_AUTH in .env (see .env.example), then either
docker compose --profile cache up -d zoom-cache
# or put COMPOSE_PROFILES=cache in .env so a plain `docker compose up -d` includes it.

# then, in apps/llm-proxy/.env.local:
# CACHE_URL=redis://:<ZOOM_CACHE_AUTH>@localhost:6380
```

The cache is only an optimisation. If Redis is down, slow or holds a bad entry, the proxy zooms as if it had no entry and logs a warning. Things to know:

- **It holds user data.** Entries contain the model's output, which includes text taken from users' programs (for example a message in a print block). Give the cache a password and don't expose it publicly. The compose service publishes port `6380` on all interfaces, so keep it behind a firewall, or bind it to loopback, anywhere other than a dev machine.
- **Old results outlive a change of model.** The key has the model alias, not the model behind it. If you point an alias at a different model, old results are reused until they expire. To clear them, flush the cache (the instance is dedicated to it, so this is safe):

  ```bash
  set -a && source .env && set +a
  docker compose exec zoom-cache redis-cli -a "$ZOOM_CACHE_AUTH" --no-auth-warning flushdb
  ```

- **A new prompt starts a fresh set** automatically, since the key includes the prompt id and a fingerprint: a hash of the system text, of the user message the prompt builds for a fixed probe request (with and without a retry error) and of its parameters. Editing either the wording or how the message is built changes it. A change to the repair or validation rules doesn't: bump `KEY_VERSION` in `src/zoom/cache-key.ts`.
- **Joining running zooms works within one proxy process.** Several proxy instances behind a load balancer each make their own call for the first request.

## Tests

```bash
pnpm test:unit
```

One tier — no DB, no network, nothing external to spin up. This service owns no database and no provider logic of its own, so there's nothing left that would need real infrastructure to test; the upstream LiteLLM call is mocked (`vi.stubGlobal('fetch', ...)`) in `test/unit/routes/chat.test.ts`, `test/unit/routes/zoom.test.ts` and `test/unit/lib/litellm.test.ts`. Caching and joining running zooms are tested with an in-memory cache and hand-driven generators (`test/unit/routes/zoom-cache.test.ts`, `test/unit/routes/zoom-flights.test.ts`, `test/unit/zoom/flights.test.ts`); the Redis client itself is tested against a fake, so no Redis is needed. `test/unit/app.test.ts` covers the deployment settings (auth, CORS, rate limiting), building the app with its own env for each case. The prompt registry has its own tests (`test/unit/zoom/prompts.test.ts`), which pin the hash of `v0` and `v1`, so an edit to a frozen prompt fails CI; the outline, the plan reader and the attempt log are tested beside them (`outline.test.ts`, `plan.test.ts`, `attempt-log.test.ts`). None of this calls a model. The measurements against real models, and their tests, are in `apps/evals`.

## Viewing traces

Two independent destinations, covering different things — this is intentional, not overlap:

- **Langfuse** (`http://localhost:3001`, from `infra/llm-proxy`'s compose stack) — traces the LLM call itself: prompt/response, token counts, cost, which model/provider actually served it. Wired via LiteLLM's own `success_callback`/`failure_callback: ["langfuse"]` (see `infra/llm-proxy/docker/litellm/config.yaml`) — no custom instrumentation code in this app at all.
- **Jaeger** (`http://localhost:16686`) — traces general server behavior: every HTTP request this service handles (all routes, not just `/v1/chat/completions`), plus log/trace correlation in the pino output. This is `@opentelemetry/auto-instrumentations-node`'s stock `instrumentation-http`/`instrumentation-pino`, not something LiteLLM/Langfuse would ever give you, since Langfuse only ever sees LLM calls specifically.

`OTEL_EXPORTER_OTLP_ENDPOINT` unset just skips exporting entirely (spans are created but discarded) — `.env.example`'s default already points at the Jaeger container.

Every zoom call is also tagged for Langfuse: LiteLLM request metadata carries the tags `zoom` and `zoom-prompt:<id>`, so traces can be filtered by prompt version (the `prompt_id` field itself does not show up in a trace's metadata, the tag is the way to filter).

## Architecture notes

- **Everything is a Fastify plugin.** `src/app.ts` decorates `config` on the root instance, then registers `plugins/auth.ts` and `plugins/error-handler.ts` (both wrapped in `fastify-plugin`'s `fp()` — required so their hook/error-handler apply app-wide rather than being scoped to their own plugin encapsulation) and the route plugins in `src/routes/*.ts`, which read `fastify.config` rather than taking it as a function parameter. Registration order matters for `@fastify/cors` → `@fastify/rate-limit` → `plugins/auth.ts`: CORS has to answer browser preflights (which never carry the API key) before auth can reject them, and rate limiting counts rejected requests too. `test/unit/app.test.ts` fails if the order is wrong.
- **`src/routes/chat.ts`** validates the incoming request against `ChatCompletionRequestSchema` (from `@szrs/llm-proxy-contracts`), forwards it to LiteLLM as a bearer-authenticated OpenAI-shaped request (via `src/lib/litellm.ts`, shared by all routes), and — since `ChatCompletionResponseSchema` is this service's own normalized shape, not raw OpenAI's — maps LiteLLM's raw response into that shape before validating and returning it. A non-2xx from LiteLLM is forwarded with its original status code, not collapsed to a generic 500.
- **`src/routes/zoom.ts`** builds the zoom prompt from the registry (`src/zoom/prompts/`, `src/zoom/zoom.ts`), calls LiteLLM with the prompt's parameters, and validates the output against `ZoomResponseSchema`. Invalid output is retried up to 3 times with the validation error appended to the prompt; LiteLLM errors are forwarded as-is, like `chat.ts`. `/v1/zoom/stream` runs the same loop over LiteLLM's streaming API (`chatCompletionStream` in `src/lib/litellm.ts`) and sends each step as an SSE event; if the client disconnects, the stream stops and the upstream LiteLLM request is cancelled.
- **`src/zoom/normalize.ts`** rewrites the Detail workspace into a canonical form (blocks `b1`, `b2`, …, variables `v1`, `v2`, …, no positions) before prompting, and `restoreIds` maps the binding ids in a result back to the caller's own. The model, the repair step and the validation all work in canonical ids, so a result can be shared between users. Only ids of blocks that had one are numbered, so a block can be bound exactly when it could be before.
- **`src/zoom/cache.ts`, `cache-key.ts` and `plugins/zoom-cache.ts`** are the optional cache. The `redis` client is loaded only when `CACHE_URL` is set. Reads and writes never reject: an error, a timeout or an entry that fails the usual checks is a miss. `zoomCacheKey` hashes the model, slug, prompt id and fingerprint, and canonical workspace with sorted keys, so key order doesn't matter.
- **`src/zoom/prompts/`** holds one frozen file per prompt id plus `index.ts` (the registry and `DEFAULT_PROMPT_ID`), `params.ts` (the shared sampling parameters) and `slug.ts`. Each prompt is `{ id, system, buildUser, params }`; the routes and the cache key only ever go through `getZoomPrompt(id)`. `src/zoom/outline.ts` builds the outline `v1` puts in the user message (a generic descriptor, with a hook a host can pass to name its own blocks), `src/zoom/plan.ts` reads the model's `plan` tolerantly, and `src/zoom/attempt-log.ts` classifies why an attempt failed and writes the one log record per attempt. `src/lib/litellm.ts` returns, for a stream, a summary with the finish reason and token usage that is filled in as the stream is read.
- **`exports`** in `package.json` exposes `src/*.js` (the TypeScript source) to `apps/evals`, which reuses the prompt registry, parsing and validation. The proxy itself imports nothing from `apps/evals` and has no Blockly dependency.
- **`src/zoom/flights.ts`** lets streaming requests for the same key share one run. Subscribers are counted when they join, the run stops when the last one leaves, and it stays registered until its result has been stored, so a request arriving just after `done` joins it instead of starting another call.
- **`src/routes/health.ts`**'s `/readyz` checks LiteLLM's `/health/liveliness` endpoint — any HTTP response counts as "reachable" (even a 401), only a network-level failure means not-ready, since readiness shouldn't depend on `LITELLM_VIRTUAL_KEY` being valid.
- **No database and no provider abstraction.** LiteLLM model aliases (`model_name` in `infra/llm-proxy/docker/litellm/config.yaml`) are the providers. Callers pass an alias as `model`, and LiteLLM handles the vendor API, fallbacks and which models the virtual key may use. There are no usage-reporting endpoints either: LiteLLM's own spend tracking (`/spend/logs`, per virtual key) covers that, and `apps/dashboard` would query LiteLLM directly for it rather than going through here.
