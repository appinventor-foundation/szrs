# Dashboard (`apps/dashboard`)

SvelteKit 3 app (adapter-node) with Tailwind 4 + Skeleton 5 theming, backed by its own Postgres through Drizzle. It is part of the pnpm/Turborepo monorepo at the repo root.

## Commands

Run from `apps/dashboard` unless noted. Root equivalents go through Turborepo.

| Task                 | Command                                                                    |
| -------------------- | -------------------------------------------------------------------------- |
| Dev server           | `pnpm dev` (http://localhost:5173)                                         |
| Everything           | `pnpm test` at the repo root: lint, types, unit, then e2e                  |
| Lint / types         | `pnpm lint`, `pnpm check-types`                                            |
| Unit tests           | `pnpm test:unit` (Vitest: `server` project in node, `client` in a browser) |
| E2E                  | `pnpm test:e2e` (Playwright; builds and starts its own server)             |
| Generate a migration | `pnpm db:generate`, then commit `drizzle/` including `drizzle/meta`        |
| Apply migrations     | `pnpm db:migrate`                                                          |

The database comes from the repo's compose stack: `docker compose -f infra/llm-proxy/docker-compose.yml up -d dashboard-db`. Copy `.env.example` to `.env.local` first. Dev uses database `dashboard` on `localhost:5433`; e2e uses `dashboard_test` in the same container and truncates it.

## Rules

- **Drizzle + Zod, migrations only through drizzle-kit.** Never `push`, never hand-write or edit generated SQL. Change the table, run `db:generate`, commit the result.
- **Every new feature gets Playwright e2e tests** in `tests/*.e2e.ts`.
- **No business logic in `.svelte` files.** Script blocks are TypeScript and hold UI wiring only: props, local view state, handlers that call imported functions. Database access, business rules and API calls live in their own layer and are imported.
- **Never use `$effect` to derive state.** Use `$derived`. `$effect` is only for syncing with an external system, with an eslint-disable and a reason. Lint bans it in `.svelte`, `.svelte.ts` and `.svelte.js` files.
- Components cannot import `drizzle-orm`, `postgres` or `#lib/server/*` (lint rule, and Kit's build guard fails too).

## Layers (`src/lib`)

```
route (+page.server.ts, +server.ts)   parse input with Zod, call a service, map errors
  -> services/    business rules; take a repository; throw domain errors (errors.ts)
  -> repositories/  the only code that writes Drizzle queries; one per aggregate
  -> db/          client.ts (lazy pool), schema/ (Drizzle tables)
```

All of the above sits under `src/lib/server/`, which Kit treats as server-only. Outside it:

- `src/lib/schemas/`: plain, browser-safe Zod schemas and the inferred types. They must not import anything from `server/`. Components may `import type` from here.
- `src/lib/forms.ts`: the shape of failed form actions (`FormErrors`, `FormValues`).
- `src/lib/components/`: shared components, markup only.
- `src/lib/state/`: `*.svelte.ts` view-models for cross-component UI state.

Wiring: `server/container.ts` is the only place repositories are built into services. Routes call `getDemoService()` and never touch the database. `server/forms.ts` has `parseForm(schema, formData)` and `mapDomainErrors(fn)` (turns `NotFoundError` into a 404). Form actions return `fail(400, { errors, values })` so the form can redisplay what was typed.

Imports use the `#lib/...` alias **with a `.js` extension** (`#lib/server/errors.js`), as in `apps/docs`. Links use `resolve()` from `$app/paths`. Every source file starts with the Apache license header (`//` block in TS, an HTML comment in Svelte).

## Adding a feature (the demos feature is the template)

1. Table in `server/db/schema/<name>.ts`, exported from `schema/index.ts`. Keep those two files free of `#lib` imports: drizzle-kit loads them without alias support.
2. `pnpm db:generate`, review the SQL, commit `drizzle/`.
3. Shared Zod schemas in `src/lib/schemas/<name>.ts`, written by hand.
4. **Extend `server/db/schema/demos.test.ts` (or add a sibling test) so the Zod schemas are checked against the new table.** This test is the only thing keeping the hand-written schemas in step with the database.
5. Repository, then service (with a unit test against a fake repository, see `services/demos.test.ts`), then a getter in `container.ts`.
6. Routes and components.
7. E2E tests. **Add the new table to `resetDatabase()` in `tests/support/database.ts`**: it currently truncates only `demos`.

## Environment

Kit 3 has no `$env/*` modules. Variables are declared in `src/env.ts` with `defineEnvVars` (Zod as the schema) and imported from `$app/env/private`. Kit validates them when the server starts and also during `vite build`, so a build without `DATABASE_URL` fails with `env_invalid`. Locally `.env.local` covers it. CI and the Dockerfile use a placeholder value that nothing connects to. A new variable needs: an entry in `src/env.ts`, `.env.example`, the compose files in `infra/`, and `turbo.json` (`globalPassThroughEnv`) if lint's turbo rule complains.

## Testing notes

- E2E runs one worker against a shared database and truncates between tests. Keep tests independent of each other's data.
- **Open pages with `visit(page, path)` from `tests/support/page.ts`, not `page.goto`, whenever the test types or clicks.** It waits for the `data-hydrated` marker that the root layout sets. Hydration resets form fields to their initial values, so typing before it finishes silently loses the text; this only shows up on slow machines like CI.
- **After clicking a client-side link, wait for something unique to the new page** (a heading, a field value) before interacting. Until then locators such as `getByLabel('Title')` still match the old page's form. See `openEditor` in `tests/demos.e2e.ts`.
- Form POSTs return 403 ("Cross-site POST form submissions are forbidden") unless the server derives the right origin. adapter-node assumes `https` unless `PROTOCOL_HEADER` names a header. The e2e config sets `PROTOCOL_HEADER=x-forwarded-proto` on the server and sends that header from the browser, which is what Traefik does in production. Dev (`pnpm dev`) does not have this problem.
- Kit's server-only import check is disabled under Vitest, so a leaked server import will not show up in unit tests. Lint and the build catch it.
- Locators: demo rows use `aria-label`s like `Edit <title>` and `Delete <title>`. Use `{ exact: true }` with `getByText` when a title is also a substring of other text.

## Deploy

- `Dockerfile` (build context is the repo root): `builder` runs the build with a placeholder `ARG DATABASE_URL`; `migrate` is a one-shot target that runs `drizzle-kit migrate`; `runner` copies production `node_modules` because adapter-node does not bundle runtime dependencies. pnpm uses its symlinked store here, so the runner keeps the `/app/apps/dashboard` plus `/app/node_modules/.pnpm` layout. Do not flatten it.
- `infra/dokploy/docker-compose.yml`: `dashboard-db` (postgres:18-alpine), a one-shot `dashboard-migrate`, then `dashboard`, which waits on `service_completed_successfully`. `DASHBOARD_DB_PASSWORD` must be set in Dokploy. Behind Traefik the app learns its origin from `PROTOCOL_HEADER` / `HOST_HEADER` (no `ORIGIN` variable in Kit 3).
- The local stack in `infra/llm-proxy/docker-compose.yml` has the same `dashboard-db`, with a published port and an init script that creates `dashboard_test`. Keep the two compose files in step.

## Version pins and gotchas

- `postgres` is pinned to 3.4.9: 4.0.0 was too new for the release-age gate and drizzle-orm 0.45 targets 3.x. `drizzle-zod` is a devDependency (used only by tests).
- TypeScript is pinned to 6.0.3 (see the repo notes on the Kit 3 migration). `pnpm-workspace.yaml` has a release-age gate: a brand-new package version may need `minimumReleaseAgeExclude`.
- ESLint `no-restricted-imports` patterns need `\\#` for `#lib/...` (a leading `#` is a comment in those patterns).
- The "Theme preview" section on the home page (`src/routes/+page.svelte`) is temporary; remove it once the dashboard has real content.
