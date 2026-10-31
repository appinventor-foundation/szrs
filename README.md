# SZRS

Semantic zoom for [Blockly](https://developers.google.com/blockly). A student's block program (the **Detail** level) can be zoomed out into higher-level views of the same program: a **semantic** level with one block per logical operation, and a **concept** level that is usually a single block for the whole program. An LLM writes the zoomed views, and the program itself always runs from the Detail blocks.

This repository holds the Blockly plugin, the proxy that keeps the LLM credentials off the browser, a dashboard, a documentation site, and the infrastructure that runs them.

## How the pieces fit

```
 site using the plugin                 your infrastructure
┌────────────────────────┐   HTTPS   ┌─────────────┐     ┌───────────────┐     ┌────────────┐
│ Blockly + blockly-szrs │ ────────► │  llm-proxy  │ ──► │    LiteLLM    │ ──► │ OpenAI,    │
│ (runs in the browser)  │           │  (Fastify)  │     │ (gateway,     │     │ OpenRouter,│
└────────────────────────┘           └─────────────┘     │  virtual key, │     │ Ollama, …  │
                                        │ optional       │  spend limits)│     └────────────┘
                                        ▼ cache          └───────┬───────┘
                                     ┌───────┐                   │ traces
                                     │ Redis │            ┌──────▼──────┐
                                     └───────┘            │  Langfuse   │   Jaeger traces
                                                          └─────────────┘   the proxy's HTTP

 dashboard ── own Postgres, sign-in, admin area        docs ── static documentation site
```

- The **plugin** is client-side code with nowhere safe to keep an API key, so it talks to the **proxy**. The proxy holds the one LiteLLM virtual key, validates requests and forwards them.
- **LiteLLM** does the provider routing, rate limits and spend tracking. The virtual key's budget is the real spending cap.
- Every site that uses the plugin runs its own proxy, with its own LiteLLM and keys. There is no shared hosted proxy.
- The **dashboard** is deliberately not a client of the proxy. It has its own backend and database.

## What's in the repo

| Path                                                           | What it is                                                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [`apps/blockly-szrs`](apps/blockly-szrs)                       | The Blockly semantic-zoom plugin (`SemanticZoomPlugin`), built with `@blockly/dev-scripts`.                   |
| [`apps/llm-proxy`](apps/llm-proxy/README.md)                   | The Fastify proxy in front of LiteLLM: chat, models, semantic zoom (plain and streaming), optional cache.     |
| [`apps/dashboard`](apps/dashboard/README.md)                   | SvelteKit app with sign-in (better-auth), an admin area for managing users, and its own Postgres via Drizzle. |
| [`apps/docs`](apps/docs/README.md)                             | The documentation site: SvelteKit and mdsvex, built to static files from the markdown in `content/`.          |
| [`packages/llm-proxy-contracts`](packages/llm-proxy-contracts) | The Zod schemas for the proxy's API, shared by the plugin and the proxy.                                      |
| [`packages/ui`](packages/ui)                                   | Svelte components and the Tailwind and Skeleton theme shared by the dashboard and docs.                       |
| [`packages/eslint-config`](packages/eslint-config)             | The shared ESLint configuration.                                                                              |
| [`packages/typescript-config`](packages/typescript-config)     | The shared `tsconfig` bases.                                                                                  |
| [`infra/llm-proxy`](infra/llm-proxy)                           | Docker Compose stack for local development: LiteLLM, Langfuse, Jaeger, the dashboard's Postgres and caches.   |
| [`infra/dokploy`](infra/dokploy)                               | The production stack for [Dokploy](https://dokploy.com): the same services plus the apps.                     |

`infra/` is not part of the pnpm workspace, and no Turborepo task touches it.

## Getting started

You need [mise](https://mise.jdx.dev) (or Node 24.20.0 and pnpm 12.4.2 installed some other way) and Docker.

```bash
mise install       # Node and pnpm, pinned in mise.toml
pnpm install
```

Then pick what you are working on. Each app has its own setup, because they need different pieces of infrastructure:

| I want to work on | Start here                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| The dashboard     | [`apps/dashboard/README.md`](apps/dashboard/README.md): start its Postgres, copy `.env.example`, migrate, seed an admin |
| The proxy         | [`apps/llm-proxy/README.md`](apps/llm-proxy/README.md): start the LiteLLM stack, mint a virtual key                     |
| The plugin        | [`apps/blockly-szrs`](apps/blockly-szrs): `pnpm dev` there starts a test playground; point it at a running proxy        |
| The docs          | `pnpm dev` in `apps/docs`; add pages as markdown files in `apps/docs/content/`                                          |

`pnpm dev` at the root starts every app's dev server through Turborepo.

### Dev ports

| Port  | What                              |
| ----- | --------------------------------- |
| 5174  | Dashboard (fixed: `strictPort`)   |
| 5173  | Docs (Vite's default, not pinned) |
| 3000  | llm-proxy                         |
| 4000  | LiteLLM                           |
| 3001  | Langfuse                          |
| 16686 | Jaeger UI                         |
| 5433  | The dashboard's Postgres          |

When developing over SSH, forward the ports you use to your browser.

## Everyday commands

Run these at the repo root. Turborepo runs them in every package that has the script.

| Command                                  | What it does                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm dev`                               | Start the dev servers                                                   |
| `pnpm build`                             | Build everything                                                        |
| `pnpm lint`                              | ESLint                                                                  |
| `pnpm check-types`                       | Type checks (`svelte-check` or `tsc`); builds first                     |
| `pnpm test:unit`                         | Unit and component tests; builds first                                  |
| `pnpm test:e2e`                          | Playwright end-to-end tests (the dashboard's, today)                    |
| `pnpm test`                              | Lint, types, unit and e2e, in that order, stopping at the first failure |
| `pnpm format` / `pnpm format:check`      | Prettier, write or check                                                |
| `pnpm --filter @szrs/dashboard <script>` | Run one script in one package                                           |

The e2e tests need the dashboard's Postgres container running (`docker compose -f infra/llm-proxy/docker-compose.yml up -d dashboard-db`).

## Deployment

The whole system deploys to [Dokploy](https://dokploy.com) from `infra/dokploy/docker-compose.yml`, with Traefik routing public domains to the services. [`infra/dokploy/.env.example`](infra/dokploy/.env.example) lists every variable to set in Dokploy; real values are never committed.

- The compose file is deliberately standalone, and it mirrors `infra/llm-proxy/docker-compose.yml`. When you change one, change the other.
- The first deploy has two steps: LiteLLM has to be running before it can mint the proxy's virtual key. The steps are in the header of the compose file and in the [llm-proxy README](apps/llm-proxy/README.md).
- The dashboard needs `BETTER_AUTH_SECRET`, `DASHBOARD_URL` and its database password on every deploy, plus an initial admin on the first one. See the [dashboard README](apps/dashboard/README.md#deployment).

## Continuous integration

`.github/workflows/test.yml` runs on pull requests and on pushes to `main` and `develop`, in three jobs: `check` (lint and type checks), `test-unit`, and `test-e2e` (the dashboard against a throwaway Postgres service container).

## Conventions

- [Prettier](https://prettier.io) formats everything: tabs, single quotes, 100 columns, no trailing commas.
- Every source file starts with the Apache 2.0 license header.
- Dependencies are pinned to exact versions, except in `apps/blockly-szrs`, which still has the version ranges from its generator.
- Coding agents: see [AGENTS.md](AGENTS.md).

## License

[Apache 2.0](LICENSE)
