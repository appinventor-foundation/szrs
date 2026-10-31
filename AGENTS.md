# SZRS monorepo

Semantic zoom for Blockly: a Blockly plugin (`apps/blockly-szrs`) that shows a block program at higher levels of abstraction written by an LLM, an `apps/llm-proxy` that keeps the LLM credentials server-side, an `apps/dashboard` (sign-in, admin, its own Postgres), an `apps/docs` site, and the infrastructure in `infra/`. [README.md](README.md) has the overview and diagram. This file is what a coding agent needs across the whole repo.

**Per-app agent files:** only `apps/dashboard/AGENTS.md` exists so far. Read it before touching the dashboard. For every other app, the app's own README is the source of truth, and more targeted agent files will come as we work on them.

## Layout

| Path                           | Notes                                                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `apps/blockly-szrs`            | The plugin. Browser code, built with `blockly-scripts` (`@blockly/dev-scripts`). Uses TypeScript `^5`, not the repo's pinned 6.0.3. |
| `apps/llm-proxy`               | Fastify, ESM, runs from TypeScript with `tsx` in dev. No database and no provider code: LiteLLM model aliases are the providers.    |
| `apps/dashboard`               | SvelteKit 3, Drizzle, better-auth. Has its own `AGENTS.md`.                                                                         |
| `apps/docs`                    | SvelteKit + mdsvex, static output, served by nginx. Pages are markdown in `content/`.                                               |
| `packages/llm-proxy-contracts` | Zod schemas for the proxy API. **Shared by the plugin and the proxy**, so a change here affects both.                               |
| `packages/ui`                  | Svelte components and the Tailwind/Skeleton theme shared by dashboard and docs.                                                     |
| `packages/eslint-config`       | The one ESLint config every package re-exports. Some rules (see below) apply repo-wide.                                             |
| `packages/typescript-config`   | `svelte.json` and `node.json` tsconfig bases.                                                                                       |
| `infra/llm-proxy`              | Local dev Compose stack: LiteLLM, Langfuse, Jaeger, Redis caches, the dashboard's Postgres.                                         |
| `infra/dokploy`                | Production Compose stack: the same services plus the apps. Deployed with Dokploy and Traefik.                                       |

`pnpm-workspace.yaml` covers `apps/*` and `packages/*` only. `infra/` is outside the workspace and no Turborepo task touches it. `apps/bszrs/` is a leftover, untracked build folder (no `package.json`); ignore it.

Cross-app facts that are easy to get wrong:

- The dashboard is **deliberately not** a client of the proxy. Do not add dashboard routes to `apps/llm-proxy`. Every site that uses the plugin runs its own proxy and LiteLLM.
- The proxy's real spending cap is the LiteLLM virtual key (budget, rate limit, model list). CORS, per-IP limits and `INTERNAL_API_KEY` are not security boundaries: a key the plugin sends from the browser is visible to every visitor.
- Routes: `/v1/chat/completions`, `/v1/models`, `/v1/zoom`, `/v1/zoom/stream` (SSE), `/healthz`, `/readyz`. Request and response shapes live in `packages/llm-proxy-contracts`.

## Commands

Node 24.20.0 and pnpm 12.4.2 come from `mise.toml` (`mise install`). Commit `pnpm-lock.yaml` together with any `package.json` change: CI installs with `--frozen-lockfile`.

| Task        | Command (repo root)                   | Notes                                                          |
| ----------- | ------------------------------------- | -------------------------------------------------------------- |
| Dev servers | `pnpm dev`                            | Turborepo, persistent, every package with a `dev` script       |
| Build       | `pnpm build`                          |                                                                |
| Lint        | `pnpm lint`                           | `turbo run lint`                                               |
| Types       | `pnpm check-types`                    | **Depends on `build`**                                         |
| Unit tests  | `pnpm test:unit`                      | **Depends on `build`**                                         |
| E2E         | `pnpm test:e2e`                       | Dashboard only today; never cached; needs its Postgres running |
| Everything  | `pnpm test`                           | lint, types, unit, e2e, stopping at the first failure          |
| Format      | `pnpm format`, `pnpm format:check`    | Prettier over the whole repo                                   |
| One package | `pnpm --filter @szrs/<name> <script>` | e.g. `pnpm --filter @szrs/llm-proxy test:unit`                 |

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

## Environment variables and CI

- `turbo.json` runs tasks with a filtered environment. A variable that a task needs must be in `globalPassThroughEnv` (today: `CI`, `DATABASE_URL`, `TEST_DATABASE_URL`, `BETTER_AUTH_SECRET`, `DASHBOARD_URL`) or the task won't see it, and lint's `turbo/no-undeclared-env-vars` rule flags it.
- SvelteKit validates its environment variables **during `vite build`**, and `check-types` and `test:unit` build first. So CI jobs and Dockerfile builder stages set placeholder values for the dashboard's required variables. If you add a required variable, add placeholders in `.github/workflows/test.yml` and the Dockerfile `ARG`s too.
- Secrets live in gitignored files: `apps/*/.env.local`, `infra/llm-proxy/.env` (Compose only auto-loads a file named `.env`) and `infra/dokploy/.env`. Commit only the `.env.example` files, and keep them in step with the code and compose files.
- CI (`.github/workflows/test.yml`) has three jobs: `check` (lint, types), `test-unit`, `test-e2e` (dashboard, with a Postgres service container). Keep `pnpm test` and CI equivalent.

## Infrastructure

- `infra/dokploy/docker-compose.yml` is standalone on purpose (no `include`) and **mirrors `infra/llm-proxy/docker-compose.yml`**. Change images, env or healthchecks in both. It differs in: apps built from the repo root, `expose` instead of host ports, config baked into images instead of bind mounts, passwords from env, `restart: unless-stopped`.
- Domains are added in Dokploy's UI (Traefik). Adding a domain changes a service's networks, so check Dokploy's Preview Compose before giving a service one. Required variables use `${VAR:?set VAR}`. Slim Node images have no `curl` or `wget`: healthchecks use `node -e "fetch(...)"`.
- First deploy is two steps: LiteLLM must be running before it can mint the proxy's virtual key (steps in the compose file header and `apps/llm-proxy/README.md`). The dashboard also needs an initial admin on its first deploy (see its README).
- Postgres 18 images mount their volume at `/var/lib/postgresql`, not `.../data`.

## Working agreements

- **Ask before** creating or switching branches, committing, pushing, deleting data or files you did not create, or running anything that writes to a shared or dev database. Do the work the request describes and stop there.
- **Never experiment against the dev database.** Use the test database, or clean up everything you create.
- **Do not print secrets** (generated passwords, keys, `.env` values) into the conversation or into committed files. When adding to a real `.env`, append only and leave existing values untouched.
- **Report faithfully:** say what you ran and what you did not run, and do not describe something as verified if only part of it was.
- Prefer the repo's own scripts (`pnpm test`, `pnpm format`) over ad-hoc commands, and leave the working tree free of scratch files.

## Known documentation drift

These are stale, not instructions. Fix them when you work in those areas.

- `apps/llm-proxy/README.md` says pnpm 11.22.0 (the repo uses 12.4.2) and cites `apps/blockly-szrs/DECISIONS.md`, which does not exist.
- `apps/blockly-szrs/README.md` still has generator placeholders (`blockly-blockly-szrs`, TODO sections), and `GETSTARTED.md` documents `npm` commands and a `localhost:3000/test` URL, which is also the proxy's port. The test playground hardcodes `proxyUrl: 'http://localhost:3000'` in `test/index.ts`.

## Open decisions: do not start unprompted

From the project notes of 2026-10-30; check they are still open before relying on them.

- Whether to make the llm-proxy public, or host the Blockly plugin inside the dashboard with the proxy staying internal. Before any public exposure, set `INTERNAL_API_KEY` (unset in the deployed compose today) and give the LiteLLM virtual key a budget, rate limit and model list.
- Server housekeeping: the broken `claude-3-5-sonnet` alias in `infra/llm-proxy/docker/litellm/config.yaml`, and real `OPENAI_API_KEY` / `OPENROUTER_API_KEY` values in Dokploy.
- A self-service change-password page for the dashboard (admins set passwords for now).
