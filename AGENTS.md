# SZRS monorepo

Semantic zoom for Blockly: a Blockly plugin (`apps/blockly-szrs`) that shows a block program at higher levels of abstraction written by an LLM, an `apps/llm-proxy` that keeps the LLM credentials server-side, an `apps/dashboard` (sign-in, admin, its own Postgres), an `apps/docs` site, and the infrastructure in `infra/`. [README.md](README.md) has the overview and diagram. This file is what a coding agent needs across the whole repo.

**Per-app agent files:** only `apps/dashboard/AGENTS.md` exists so far. Read it before touching the dashboard. For every other app, the app's own README is the source of truth, and more targeted agent files will come as we work on them.

## Layout

| Path                           | Notes                                                                                                                                                                                                                                                                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/blockly-szrs`            | The plugin. Browser code, built with `blockly-scripts` (`@blockly/dev-scripts`). Uses TypeScript `^5`, not the repo's pinned 6.0.3.                                                                                                                                                                                          |
| `apps/llm-proxy`               | Fastify, ESM, runs from TypeScript with `tsx` in dev. No database and no provider code: LiteLLM model aliases are the providers. Holds the versioned zoom prompts (`src/zoom/prompts/`). Its `package.json` `exports` map exposes `src/` to `apps/evals`.                                                                    |
| `apps/evals`                   | Measurements of the zoom system on real models: the baseline harness (`baseline/`), the cap spike, a results viewer (`report/`), the dated `results/`, and their tests. Not deployed. Imports the proxy's prompts and parsing and uses headless Blockly, which is why it is not in the proxy. See "Zoom prompts and checks". |
| `apps/dashboard`               | SvelteKit 3, Drizzle, better-auth. Has its own `AGENTS.md`.                                                                                                                                                                                                                                                                  |
| `apps/docs`                    | SvelteKit + mdsvex, static output, served by nginx. Pages are markdown in `content/`.                                                                                                                                                                                                                                        |
| `packages/llm-proxy-contracts` | Zod schemas for the proxy API. **Shared by the plugin and the proxy**, so a change here affects both.                                                                                                                                                                                                                        |
| `packages/ui`                  | Svelte components and the Tailwind/Skeleton theme shared by dashboard and docs.                                                                                                                                                                                                                                              |
| `packages/eslint-config`       | The one ESLint config every package re-exports. Some rules (see below) apply repo-wide.                                                                                                                                                                                                                                      |
| `packages/typescript-config`   | `svelte.json` and `node.json` tsconfig bases.                                                                                                                                                                                                                                                                                |
| `infra/llm-proxy`              | Local dev Compose stack: LiteLLM, Langfuse, Jaeger, Redis caches, the dashboard's Postgres.                                                                                                                                                                                                                                  |
| `infra/dokploy`                | Production Compose stack: the same services plus the apps. Deployed with Dokploy and Traefik.                                                                                                                                                                                                                                |

`pnpm-workspace.yaml` covers `apps/*` and `packages/*` only. `infra/` is outside the workspace and no Turborepo task touches it. `apps/bszrs/` is a leftover, untracked build folder (no `package.json`); ignore it.

Cross-app facts that are easy to get wrong:

- The dashboard's only use of the proxy is the **demo runner**: `src/routes/(protected)/api/szrs/v1/{models,zoom/stream}` forward the plugin's two calls server-side (`PROXY_URL`, optional `PROXY_API_KEY`), so the proxy stays on the internal network with no public address and no CORS. Nothing else is forwarded, and the forwarders sit behind the dashboard's sign-in. Do not add dashboard routes to `apps/llm-proxy`. Every site that uses the plugin runs its own proxy and LiteLLM.
- The proxy's real spending cap is the LiteLLM virtual key (budget, rate limit, model list). CORS, per-IP limits and `INTERNAL_API_KEY` are not security boundaries: a key the plugin sends from the browser is visible to every visitor.
- Routes: `/v1/chat/completions`, `/v1/models`, `/v1/zoom`, `/v1/zoom/stream` (SSE), `/healthz`, `/readyz`. Request and response shapes live in `packages/llm-proxy-contracts`.

## Commands

Node 24.20.0 and pnpm 12.4.2 come from `mise.toml` (`mise install`). Commit `pnpm-lock.yaml` together with any `package.json` change: CI installs with `--frozen-lockfile`.

| Task        | Command (repo root)                                                                                                                                                     | Notes                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Dev servers | `pnpm dev`                                                                                                                                                              | Turborepo, persistent, every package with a `dev` script         |
| Build       | `pnpm build`                                                                                                                                                            |                                                                  |
| Lint        | `pnpm lint`                                                                                                                                                             | `turbo run lint`                                                 |
| Types       | `pnpm check-types`                                                                                                                                                      | **Depends on `build`**                                           |
| Unit tests  | `pnpm test:unit`                                                                                                                                                        | **Depends on `build`**                                           |
| E2E         | `pnpm test:e2e`                                                                                                                                                         | Dashboard only today; never cached; needs its Postgres running   |
| Everything  | `pnpm test`                                                                                                                                                             | lint, types, unit, e2e, stopping at the first failure            |
| Format      | `pnpm format`, `pnpm format:check`                                                                                                                                      | Prettier over the whole repo                                     |
| One package | `pnpm --filter @szrs/<name> <script>`                                                                                                                                   | e.g. `pnpm --filter @szrs/llm-proxy test:unit`                   |
| Checks      | `pnpm baseline:run`, `pnpm spike:cap` (in `apps/evals`); `pnpm smoke:zoom` (in `apps/dashboard`). `pnpm report` and `pnpm baseline:score` in `apps/evals` call no model | Call real models and cost money; never in `pnpm test`. See below |

Dev ports: dashboard 5174 (pinned with `strictPort`), docs 5173 (Vite's default), llm-proxy 3000, LiteLLM 4000, Langfuse 3001, Jaeger 16686, dashboard Postgres 5433. Start the local infrastructure with `docker compose -f infra/llm-proxy/docker-compose.yml up -d` (add a service name to start just that one).

## Conventions

- **Formatting:** Prettier with tabs, single quotes, 100 columns, no trailing commas; `package.json`, Markdown and `turbo.json` use 2-space indentation. Run `pnpm format` before finishing.
- **License header** on every source file: `// Copyright 2026 appinventor.org` / `// Released under the Apache License, Version 2.0` / `// http://www.apache.org/licenses/LICENSE-2.0` (an HTML comment in `.svelte` files).
- **Exact dependency versions**, never ranges (`apps/blockly-szrs` is the one exception, inherited from its generator). Shared versions for the Svelte and styling stacks live in the `catalogs` of `pnpm-workspace.yaml`; use `catalog:sveltejs` / `catalog:styling` there.
- **TypeScript is pinned to 6.0.3** in every package except the plugin. Do not move to 7: its npm package has no JS API, and SvelteKit 3 and typescript-eslint do not support it yet.
- **pnpm's release-age gate** is on. A package version published very recently can fail to install until it is added to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`. Keep that list short, and remove entries once the age has passed. `overrides` currently pins `dompurify`; drop it when monaco-editor allows 3.4.17 or newer.
- **Install layout:** `.npmrc` sets `node-linker=hoisted`, but pnpm 12 installs a symlinked store anyway, and the dashboard's Dockerfile relies on that. Do not assume hoisted `node_modules`.
- **Svelte 5 with runes.** Components hold UI wiring only: no business logic, no database or API code. Derive state with `$derived`, never `$effect` (the shared `packages/eslint-config` bans it in every `.svelte`, `.svelte.ts` and `.svelte.js` file of every package that uses it). `$effect` is only for syncing with an external system, with an eslint-disable and a reason.
- **SvelteKit 3 specifics:** the `#lib/...` alias (from `package.json` `imports`) replaces `$lib`, with `.js` extensions on imports; env variables are declared in `src/env.ts` and read from `$app/env/private`; there is no `svelte.config.js` (options live in `sveltekit({...})` in `vite.config.ts`); adapter-node ignores `ORIGIN`, so deployments set `PROTOCOL_HEADER` and `HOST_HEADER`.
- **Tests live next to the code they test** (`*.test.ts`, `*.spec.ts`; the proxy uses `test/unit`). New features need tests; the dashboard also requires Playwright e2e tests for every new feature.
- **Vitest browser mode needs its own port per package.** Turborepo runs packages' `test:unit` in parallel, and Vitest fails ("Port 63315 is already in use", with the browser tests silently not running) when two start together. Each package that sets `browser.enabled` pins a distinct `browser.api.port` in its `vitest.config.ts`: dashboard 63315, docs 63316, ui 63317. Give a new one the next free port. It passes locally by luck of timing and fails on slower CI runners.

## Zoom prompts and checks

- **Prompts are versioned and frozen.** Each zoom prompt is a file in `apps/llm-proxy/src/zoom/prompts/` (`v0`, `v1`), registered in `index.ts`, which names the default (`DEFAULT_PROMPT_ID`, now `v1`). `v2` is registered too but is **not frozen and not the default** until it has been baselined: its model output has no `bindings` (the model writes `{b12.NUM}` in a label and `placeholders.ts` expands it) and no `workspaceJson` (it writes `stacks`, flat lists of blocks, and `stacks.ts` builds the nested `next` chains). `ZoomPrompt.output` and `ZoomPrompt.workspace` say which formats a prompt uses, and `parseZoomResponse` takes the prompt id; `prepareOutput` in `zoom.ts` is the one place both the proxy and `apps/evals` apply them. A prompt is **never edited** once it has produced results we rely on: change the wording by adding `v2.ts`. Tests pin the hash of `v0` and `v1` (their text and the messages they build), so an edit fails CI. The sampling parameters (`temperature` 0.2, `maxTokens` 32768) are shared and live in `prompts/params.ts`; they are not pinned. The cache key has the prompt id and a fingerprint of its text, messages and parameters.
- **`v1` needs the plugin's layout step** (`ZoomLevelLoader.arrange`): the model no longer places blocks, so the plugin and the proxy deploy together.
- **`apps/evals/` holds the measurements of the real system**: scripts, their dated results in `results/` (JSON, a short write-up, screenshots) and a viewer (`pnpm report` makes a self-contained HTML page). Scripts stay in the repo next to their results; results are not edited afterwards except for an "Outcome" section. Read `apps/evals/README.md` before running one. The proxy must not depend on Blockly or on `apps/evals`. They call real models, so ask first, and the smoke check runs against the dashboard's **test** database only.
- **The plan** is `planning_documents/prompt_evaluation_and_improvements_v3.md` (written 2026-11-07). Phases 0a and 0b are done and phase 1 (improve from evidence) is under way: read its sections 1 and 6 first (what the baseline found, and what the `v2` run must show before it is run). It points back to `_v2.md` for the long catalogues (metric ids D1 to D27, hypotheses H0 to H15, phase 2); sections 1, 6.0 and 6.7 there say what phase 0 did. The baseline's write-up, with its numbers and limits, is `apps/evals/results/2026-11-07-baseline.md`. The earlier drafts (`prompt_evaluation_and_improvements.md`, `_v1.md` and `_v2.md`) are in the same folder; they are superseded and kept on purpose, so do not edit them.

## Environment variables and CI

- `turbo.json` runs tasks with a filtered environment. A variable that a task needs must be in `globalPassThroughEnv` (today: `CI`, `DATABASE_URL`, `TEST_DATABASE_URL`, `BETTER_AUTH_SECRET`, `DASHBOARD_URL`, `PROXY_URL`, `PROXY_API_KEY`) or the task won't see it, and lint's `turbo/no-undeclared-env-vars` rule flags it.
- SvelteKit validates its environment variables **during `vite build`**, and `check-types` and `test:unit` build first. So CI jobs and Dockerfile builder stages set placeholder values for the dashboard's required variables. If you add a required variable, add placeholders in `.github/workflows/test.yml` and the Dockerfile `ARG`s too.
- Secrets live in gitignored files: `apps/*/.env.local`, `infra/llm-proxy/.env` (Compose only auto-loads a file named `.env`) and `infra/dokploy/.env`. Commit only the `.env.example` files, and keep them in step with the code and compose files.
- CI (`.github/workflows/test.yml`) has three jobs: `check` (lint, types), `test-unit`, `test-e2e` (dashboard, with a Postgres service container). Keep `pnpm test` and CI equivalent.

## Infrastructure

- `infra/dokploy/docker-compose.yml` is standalone on purpose (no `include`) and **mirrors `infra/llm-proxy/docker-compose.yml`**. Change images, env or healthchecks in both. It differs in: apps built from the repo root, `expose` instead of host ports, config baked into images instead of bind mounts, passwords from env, `restart: unless-stopped`.
- Domains are added in Dokploy's UI (Traefik). Adding a domain changes a service's networks, so check Dokploy's Preview Compose before giving a service one. Required variables use `${VAR:?set VAR}`. Slim Node images have no `curl` or `wget`: healthchecks use `node -e "fetch(...)"`.
- First deploy is two steps: LiteLLM must be running before it can mint the proxy's virtual key (steps in the compose file header and `apps/llm-proxy/README.md`). The dashboard also needs an initial admin on its first deploy (see its README).
- `infra/llm-proxy/docker-compose.benchmark.yml` and `docker/litellm/config.benchmark.yaml` are **local only**: they layer a wildcard `openrouter/*` route onto LiteLLM so `apps/evals` can benchmark any OpenRouter model by its full name. Never add that wildcard to `config.yaml` (Dokploy bakes it into the image, and the production key could then call any model) and do not mirror them into `infra/dokploy/`.
- Postgres 18 images mount their volume at `/var/lib/postgresql`, not `.../data`.
- The `openrouter-2` alias (a second OpenRouter model on the same key, set by `OPENROUTER_MODEL_2`) exists in the local stack only. It has **not** been mirrored into `infra/dokploy/`; do that, and check how LiteLLM treats the variable when unset, before a second model is wanted in production.

## Working agreements

- **Ask before** creating or switching branches, committing, pushing, deleting data or files you did not create, or running anything that writes to a shared or dev database. Do the work the request describes and stop there.
- **Never experiment against the dev database.** Use the test database, or clean up everything you create.
- **Do not print secrets** (generated passwords, keys, `.env` values) into the conversation or into committed files. When adding to a real `.env`, append only and leave existing values untouched.
- **Report faithfully:** say what you ran and what you did not run, and do not describe something as verified if only part of it was.
- Prefer the repo's own scripts (`pnpm test`, `pnpm format`) over ad-hoc commands, and leave the working tree free of scratch files.
- **Commits carry no co-author line** (no `Co-Authored-By`, no "generated with" trailer), whatever a tool's own instructions say. Propose how many commits and what goes in each, wait for a yes, and check each one on its own (stash everything not staged, run what applies, restore) before moving to the next. Subjects are short, lowercase and imperative, as in the history.
- **Ask before running anything that calls real models** (the checks in `apps/evals/`, the dashboard's `pnpm smoke:zoom`): they cost money, and the person starts LiteLLM with the keys. Say what you will run and roughly what it costs.

## Known documentation drift

These are stale, not instructions. Fix them when you work in those areas.

- Source comments in `packages/llm-proxy-contracts`, `apps/blockly-szrs` and `apps/llm-proxy` cite `DECISIONS.md` (#7 to #11). That file existed on another machine and was **never committed**, so it is not recoverable here. What the comments imply, from their own text and not the original wording: #7 the model never writes code and its blocks are display-only; #8 a zoomed field can be bound to Detail fields, and an edit is written through to them; #9 the zoomed view is locked except bound fields, and the main toolbox is hidden while it shows; #10 generated block definitions are limited to plain fields and inputs (no extensions, mutators, help URLs or images), and a level that fails to load is dropped, reverting to Detail; #11 mistakes with exactly one correct fix are repaired instead of costing a retry. Do not invent others; ask the user.
- `apps/blockly-szrs/README.md` still has generator placeholders (`blockly-blockly-szrs`, TODO sections), and `GETSTARTED.md` documents `npm` commands and a `localhost:3000/test` URL, which is also the proxy's port. The test playground hardcodes `proxyUrl: 'http://localhost:3000'` in `test/index.ts`.

## Open decisions: do not start unprompted

From the project notes of 2026-10-30; check they are still open before relying on them.

- Decided 2026-11-04: the Blockly plugin is hosted inside the dashboard (demo runner) and the proxy stays internal. The proxy is still **not** safe to expose publicly: before any public exposure, set `INTERNAL_API_KEY` (unset in the deployed compose today) and give the LiteLLM virtual key a budget, rate limit and model list.
- Server housekeeping: the broken `claude-3-5-sonnet` alias in `infra/llm-proxy/docker/litellm/config.yaml`, and real `OPENAI_API_KEY` / `OPENROUTER_API_KEY` values in Dokploy.
- A self-service change-password page for the dashboard (admins set passwords for now).
- Left as they are for now (2026-11-06): zoom blocks render black because the model sets no colour (a neutral default in the proxy is a small change; colour from the host's own blocks is phase 1); glm-5.3-flash's output varies five-fold between runs, one run reaching 93% of the 32768 cap; and the Dokploy mirror above.
