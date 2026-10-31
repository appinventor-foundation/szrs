# Dashboard (`apps/dashboard`)

SvelteKit 3 app (adapter-node) with Tailwind 4 + Skeleton 5 theming, backed by its own Postgres through Drizzle. Sign-in is email and password through better-auth with closed registration: admins create the accounts. It is part of the pnpm/Turborepo monorepo at the repo root.

## Commands

Run from `apps/dashboard` unless noted. Root equivalents go through Turborepo.

| Task                   | Command                                                                        |
| ---------------------- | ------------------------------------------------------------------------------ |
| Dev server             | `pnpm dev` (http://localhost:5174)                                             |
| Everything             | `pnpm test` at the repo root: lint, types, unit, then e2e                      |
| Lint / types           | `pnpm lint`, `pnpm check-types`                                                |
| Unit tests             | `pnpm test:unit` (Vitest: `server` project in node, `client` in a browser)     |
| E2E                    | `pnpm test:e2e` (Playwright; builds and starts its own server)                 |
| Generate a migration   | `pnpm db:generate`, then commit `drizzle/` including `drizzle/meta`            |
| Apply migrations       | `pnpm db:migrate`                                                              |
| Create the dev admin   | `pnpm auth:seed` (from `INITIAL_ADMIN_*` in `.env.local`; skips if one exists) |
| Regenerate auth schema | `pnpm auth:generate`, then `pnpm db:generate`                                  |

The database comes from the repo's compose stack: `docker compose -f infra/llm-proxy/docker-compose.yml up -d dashboard-db`. Copy `.env.example` to `.env.local` first, then `pnpm db:migrate` and `pnpm auth:seed`. Dev uses database `dashboard` on `localhost:5433`; e2e uses `dashboard_test` in the same container and truncates it.

## Rules

- **Drizzle + Zod, migrations only through drizzle-kit.** Never `push`, never hand-write or edit generated SQL. Change the table, run `db:generate`, commit the result.
- **Every new feature gets Playwright e2e tests** in `tests/*.e2e.ts`.
- **No business logic in `.svelte` files.** Script blocks are TypeScript and hold UI wiring only: props, local view state, handlers that call imported functions. Database access, business rules and API calls live in their own layer and are imported.
- **Never use `$effect` to derive state.** Use `$derived`. `$effect` is only for syncing with an external system, with an eslint-disable and a reason. Lint bans it in `.svelte`, `.svelte.ts` and `.svelte.js` files.
- Components cannot import `drizzle-orm`, `postgres` or `#lib/server/*` (lint rule, and Kit's build guard fails too).
- **Auth is server-side only.** Routes call services, services call `auth.api.*` through repositories. There is no browser auth client; forms post to actions and work without JS.

## Layers (`src/lib`)

```
route (+page.server.ts, +server.ts)   parse input with Zod, call a service, map errors
  -> services/    business rules; take a repository; throw domain errors (errors.ts)
  -> repositories/  data access: Drizzle queries, or better-auth's API for users and sessions
  -> db/          client.ts (lazy pool), schema/ (Drizzle tables)
```

All of the above sits under `src/lib/server/`, which Kit treats as server-only. Outside it:

- `src/lib/schemas/`: plain, browser-safe Zod schemas and the inferred types. They must not import anything from `server/`. Components may `import type` from here.
- `src/lib/forms.ts`: the shape of failed form actions (`FormErrors`, `FormValues`).
- `src/lib/components/`: shared components, markup only.
- `src/lib/state/`: `*.svelte.ts` view-models for cross-component UI state.

Wiring: `server/container.ts` is the only place repositories are built into services. Routes call `getDemoService()`, `getAuthService()` and `getUserService(event)` and never touch the database. `server/forms.ts` has `parseForm(schema, formData, omitValues)`, `mapDomainErrors(fn)` (turns `NotFoundError` into a 404), `attempt(fn)` (turns a `RuleViolationError` or `InvalidCredentialsError` into a message) and `formError(message)`. Form actions return `fail(400, { errors, values })`, so the form can redisplay what was typed; passwords are never sent back. A page with several forms tags each result with `action: '<name>'`.

Imports use the `#lib/...` alias **with a `.js` extension** (`#lib/server/errors.js`), as in `apps/docs`. Links use `resolve()` from `$app/paths`, and route ids include the group, for example `resolve('/(protected)/demos')`. Every source file starts with the Apache license header (`//` block in TS, an HTML comment in Svelte).

**Files that run outside Vite use relative imports and no `$app/*`.** `scripts/ensure-admin.ts` (run by `tsx`), the e2e support files, drizzle-kit and the better-auth CLI cannot resolve `#lib` or SvelteKit modules. Everything they reach is therefore relative: `server/auth/create-auth.ts`, `server/auth/roles.ts`, `server/db/create-database.ts` and `schema/`, `server/repositories/users.ts`, `server/services/bootstrap.ts` and `server/errors.ts`. SvelteKit-specific code lives next to them (`server/auth/index.ts`, `server/db/client.ts`).

## Authentication

- **Config:** `server/auth/create-auth.ts` builds better-auth: Drizzle adapter, `emailAndPassword` with `disableSignUp: true`, and the `admin()` plugin (roles `admin` and `user`). `server/auth/index.ts` adds `sveltekitCookies(getRequestEvent)` as the **last** plugin, which lets form actions set the session cookie.
- **Tables:** `server/db/schema/auth.ts` is **generated** by `pnpm auth:generate`; never edit it. When `create-auth.ts` changes (a plugin, a field), run `pnpm auth:generate`, then `pnpm db:generate`, and commit both. `server/db/schema/auth.test.ts` fails when the generated schema is stale.
- **Protection happens in one place: `hooks.server.ts`**, via `server/auth/hooks.ts` and the pure policy in `server/auth/guard.ts`. Anything under `src/routes/(protected)/` needs a signed-in user, and anything under `(protected)/admin/` needs the `admin` role. Everything else is public (`/`, `/login`, `/healthz`, `/api/auth/*`). A visitor gets a 303 to `/login?redirectTo=...` on GET and a 401 otherwise; a non-admin gets 403. **Put new protected pages under `(protected)`; do not add per-route checks.** A layout `load` is not a guard: layout loads do not run before form actions or `+server.ts` endpoints.
- `redirectTo` goes through `safeRedirectPath` (same-site paths only). The layout's `+layout.server.ts` only supplies the user for the header.
- **Users and sessions:** `repositories/users.ts` reads with Drizzle and writes through better-auth's admin API (it owns password hashing and validation); `repositories/sessions.ts` does sign-in and sign-out. Admin calls need the signed-in admin's request headers, so `getUserService(event)` is built per request. `services/users.ts` holds the rules: nobody can change the role of, ban or delete themselves, and the last active admin can never be removed, demoted or banned.
- **First admin:** registration is closed, so `scripts/ensure-admin.ts` creates one from `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD`, only when no active admin exists. It runs after migrations in the Docker `migrate` target, and as `pnpm auth:seed` locally. It exits 1 if there is no admin and no credentials.
- Rate limiting is better-auth's default: off outside production, on (in memory) in production.

## Adding a feature (the demos feature is the template)

1. Table in `server/db/schema/<name>.ts`, exported from `schema/index.ts`. Keep those files free of `#lib` imports: drizzle-kit loads them without alias support.
2. `pnpm db:generate`, review the SQL, commit `drizzle/`.
3. Shared Zod schemas in `src/lib/schemas/<name>.ts`, written by hand.
4. **Extend `server/db/schema/demos.test.ts` (or add a sibling test) so the Zod schemas are checked against the new table.** This test is the only thing keeping the hand-written schemas in step with the database.
5. Repository, then service (with a unit test against a fake repository, see `services/demos.test.ts`), then a getter in `container.ts`.
6. Routes and components. **Anything that needs a signed-in user goes under `src/routes/(protected)/`.**
7. E2E tests. **Add the new table to `resetDatabase()` in `tests/support/database.ts`.** It truncates `demos`, clears sessions and verification rows, and deletes every user except the seeded test admin.

## Environment

Kit 3 has no `$env/*` modules. Variables are declared in `src/env.ts` with `defineEnvVars` (Zod as the schema) and imported from `$app/env/private`. The required ones are `DATABASE_URL`, `BETTER_AUTH_SECRET` (32+ characters) and `DASHBOARD_URL` (the public URL; better-auth's base URL and trusted origin). Kit validates them when the server starts and also during `vite build`, so a build without them fails with `env_invalid`. Locally `.env.local` covers it. CI (`check` and `test-unit` jobs) and the Dockerfile builder stage use placeholder values that nothing connects to or signs with. `INITIAL_ADMIN_*` are read only by `scripts/ensure-admin.ts`, not by the app. A new variable needs: an entry in `src/env.ts`, `.env.example`, both compose files in `infra/`, the CI placeholders and Dockerfile `ARG`s if the build needs it, and `turbo.json` (`globalPassThroughEnv`) if lint's turbo rule complains.

## Testing notes

- E2E runs one worker against a shared database. **Global setup migrates the test database and seeds one admin** (`adminCredentials` in `tests/support/auth.ts`) through the same `ensure-admin` script the deploy uses; `resetDatabase()` keeps that admin between tests but clears its sessions. So every test signs in itself: `await signIn(page, adminCredentials)` (see the `beforeEach` in `tests/demos.e2e.ts`). Do not demote, ban or delete the seeded admin in a test.
- Other users: `createUser(page)` in `tests/support/users.ts` calls better-auth's admin API with the page's session. For a second logged-in browser at the same time use `newSession(browser)` from `tests/support/page.ts` (contexts made by hand do not inherit the config's `use` options).
- **Open pages with `visit(page, path)` from `tests/support/page.ts`, not `page.goto`, whenever the test types or clicks.** It waits for the `data-hydrated` marker that the root layout sets. Hydration resets form fields to their initial values, so typing before it finishes silently loses the text; this only shows up on slow machines like CI.
- **After clicking a client-side link, wait for something unique to the new page** (a heading, a field value, the "Back to users" link) before interacting. Until then locators such as `getByLabel('Title')` still match the old page's form. See `openEditor` in `tests/demos.e2e.ts` and `manage` in `tests/admin-users.e2e.ts`.
- Assert redirects with an exact URL (`toHaveURL('/login?redirectTo=%2Fdemos')`), not a loose regex. Kit emits relative `Location` headers (`../login`), which are right but easy to get wrong unnoticed.
- Form POSTs return 403 ("Cross-site POST form submissions are forbidden") unless the server derives the right origin. adapter-node assumes `https` unless `PROTOCOL_HEADER` names a header. The e2e config sets `PROTOCOL_HEADER=x-forwarded-proto` on the server and sends that header from the browser, which is what Traefik does in production. Dev (`pnpm dev`) does not have this problem. better-auth additionally checks the `Origin` header of cookie-authenticated requests against `DASHBOARD_URL`, so raw API calls from tests pass `Origin: baseURL`.
- Kit's server-only import check is disabled under Vitest, so a leaked server import will not show up in unit tests. Lint and the build catch it.
- Locators: demo rows use `aria-label`s like `Edit <title>` and `Delete <title>`, and user rows use `Manage <email>`. Use `{ exact: true }` when a name is also a substring of another control (`Sign out` vs `Sign out everywhere`, `Ban` vs `Unban`) or of other text.

## Deploy

- `Dockerfile` (build context is the repo root): `builder` runs the build with placeholder `ARG`s for the required env; `migrate` is a one-shot target that runs `drizzle-kit migrate` and then `scripts/ensure-admin.ts`; `runner` copies production `node_modules` because adapter-node does not bundle runtime dependencies. pnpm uses its symlinked store here, so the runner keeps the `/app/apps/dashboard` plus `/app/node_modules/.pnpm` layout. Do not flatten it.
- `infra/dokploy/docker-compose.yml`: `dashboard-db` (postgres:18-alpine), a one-shot `dashboard-migrate`, then `dashboard`, which waits on `service_completed_successfully`. `DASHBOARD_DB_PASSWORD`, `BETTER_AUTH_SECRET` and `DASHBOARD_URL` must be set in Dokploy. **The first deploy also needs `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD`**: without them (and with no admin yet) the migrate step fails on purpose and the dashboard does not start. Later deploys do not need them. Behind Traefik the app learns its origin from `PROTOCOL_HEADER` / `HOST_HEADER` (no `ORIGIN` variable in Kit 3), while better-auth uses `DASHBOARD_URL`; the two must describe the same address.
- The local stack in `infra/llm-proxy/docker-compose.yml` has the same `dashboard-db`, with a published port and an init script that creates `dashboard_test`. Keep the two compose files in step.

## Version pins and gotchas

- `postgres` is pinned to 3.4.9: 4.0.0 was too new for the release-age gate and drizzle-orm 0.45 targets 3.x. `drizzle-zod` is a devDependency (used only by tests). `better-auth`, `@better-auth/drizzle-adapter` and the `auth` CLI are pinned together at 1.7.14; upgrade them as one, then rerun `pnpm auth:generate` and look for a schema diff. `tsx` runs the bootstrap script.
- The generated auth tables use `timestamp` without time zone, unlike `demos`. Keep database and app on UTC (the containers are).
- TypeScript is pinned to 6.0.3 (see the repo notes on the Kit 3 migration). `pnpm-workspace.yaml` has a release-age gate: a brand-new package version may need `minimumReleaseAgeExclude`.
- ESLint `no-restricted-imports` patterns need `\\#` for `#lib/...` (a leading `#` is a comment in those patterns).
- In `hooks.ts` the hook's `resolve` argument shadows `$app/paths`' `resolve`; the latter is imported as `resolvePath`.
- The "Theme preview" section on the home page (`src/routes/+page.svelte`) is temporary; remove it once the dashboard has real content.
