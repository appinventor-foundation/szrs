# Dashboard

The SZRS dashboard: a SvelteKit 3 app (Svelte 5, Tailwind 4, Skeleton 5) with its own Postgres database, accessed through Drizzle ORM and validated with Zod. It lives in the pnpm/Turborepo monorepo at the repo root and shares UI components with the other apps through `@szrs/ui`.

Today it ships the foundation, sign-in, user management and one proving feature:

- **Sign-in** with email and password (better-auth). Registration is closed: only an admin creates accounts.
- **Admin area** at `/admin/users` to create users and manage them: change role, set a password, ban or unban, sign out everywhere, delete.
- **Demos** at `/demos`: a list with full create, read, update and delete, which is the template for real features.

The home page, `/login` and `/healthz` are public. Everything else needs a signed-in user, and `/admin/*` needs the `admin` role.

## Prerequisites

- Node 24.20.0 (pinned in the repo's `mise.toml`)
- pnpm 12 (the repo pins it in `packageManager`)
- Docker, for the database

## Getting started

From the repo root:

```bash
pnpm install

# Start the dashboard's Postgres (also creates the dashboard_test database)
docker compose -f infra/llm-proxy/docker-compose.yml up -d dashboard-db

cd apps/dashboard
cp .env.example .env.local
pnpm db:migrate
pnpm auth:seed   # creates the dev admin from .env.local, unless one exists
pnpm dev
```

Open http://localhost:5174 and sign in with the `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` from `.env.local` (`admin@example.com` / `dev-admin-password` by default). The dashboard always uses port 5174 (the docs app uses 5173), so `DASHBOARD_URL` can stay fixed; if something else holds 5174 the dev server stops with an error instead of moving. If you develop over SSH, forward port 5174 to your browser.

`GET /healthz` reports whether the app can reach the database.

## Scripts

Run these in `apps/dashboard`. The repo root has Turborepo equivalents that cover every app.

| Command              | What it does                                                              |
| -------------------- | ------------------------------------------------------------------------- |
| `pnpm dev`           | Start the dev server                                                      |
| `pnpm build`         | Production build (adapter-node, output in `build/`)                       |
| `pnpm lint`          | ESLint                                                                    |
| `pnpm check-types`   | `svelte-check`, failing on warnings                                       |
| `pnpm test:unit`     | Vitest: server tests in Node, component tests in a browser                |
| `pnpm test:e2e`      | Playwright against a production build and the `dashboard_test` database   |
| `pnpm db:generate`   | Generate a migration from schema changes                                  |
| `pnpm db:migrate`    | Apply migrations to the database in `DATABASE_URL`                        |
| `pnpm db:studio`     | Browse the database in Drizzle Studio                                     |
| `pnpm auth:seed`     | Create the first admin from `INITIAL_ADMIN_*`; does nothing if one exists |
| `pnpm auth:generate` | Regenerate the Drizzle auth tables after changing the better-auth config  |

`pnpm test` at the repo root runs lint, type checks, unit tests and e2e in that order. The e2e tests need the `dashboard-db` container running, and they empty `dashboard_test` between tests, never your dev database.

## Configuration

Environment variables are declared and validated in `src/env.ts`. The app refuses to start if one is missing or invalid.

| Variable                                        | Used for                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                  | Postgres connection string (the dev value is in `.env.example`)                        |
| `BETTER_AUTH_SECRET`                            | Signs sessions; at least 32 characters (`openssl rand -hex 32`)                        |
| `DASHBOARD_URL`                                 | The address people open the dashboard at; sign-in only works from this origin          |
| `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` | Read only by `pnpm auth:seed` and the deploy's migrate step, to create the first admin |
| `TEST_DATABASE_URL`                             | Optional override for the e2e database; defaults to `dashboard_test` on port 5433      |

## How the code is organised

Server code is split into layers under `src/lib/server/`:

```
route  ->  service  ->  repository  ->  database
```

Routes validate input with Zod and call a service. Services hold the business rules. Repositories are the only place that writes Drizzle queries. Svelte components only display data and wire up events. The Drizzle tables live in `src/lib/server/db/schema`, so SvelteKit refuses to bundle them into the browser. The Zod schemas shared with the browser are in `src/lib/schemas`.

## Authentication and users

Authentication is server-side only: forms post to actions, which call better-auth through services, so there is no auth code in the browser and the forms work without JavaScript. Roles are `admin` and `user`.

- **Where access is enforced:** in `src/hooks.server.ts`, for page loads, form actions and endpoints alike. Pages under `src/routes/(protected)/` need a signed-in user, and pages under `(protected)/admin/` need an admin. A visitor is sent to `/login` and back; a signed-in non-admin gets a 403.
- **Safeguards:** nobody can change the role of, ban or delete themselves, and the last active admin can never be removed, demoted or banned, so the dashboard cannot lock itself out.
- **Passwords:** only admins set them (there is no email, so no reset-by-email). Use the admin area to give a user a new password.
- **The first admin:** because nobody can register, a new environment starts empty. `scripts/ensure-admin.ts` creates the first admin from `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD`, only when no active admin exists. It runs after the migrations on every deploy, and as `pnpm auth:seed` locally.
- **The auth tables** (`src/lib/server/db/schema/auth.ts`) are generated by `pnpm auth:generate`. Don't edit them by hand; see [AGENTS.md](./AGENTS.md).

Contributors and coding agents should read [AGENTS.md](./AGENTS.md) for the rules, the step-by-step checklist for adding a feature, and the pitfalls we have already hit.

## Troubleshooting sign-in

- **"Invalid email or password" for the seeded admin:** `pnpm auth:seed` does nothing when any active admin already exists, so a leftover admin in your dev database means `admin@example.com` was never created. List the users with `docker exec llm-proxy-dashboard-db-1 psql -U dashboard -d dashboard -c 'select email, role from "user"'`, delete the stray one in the admin area (or with SQL), and run `pnpm auth:seed` again.
- **The browser shows a 400 on `/login`:** a failed sign-in answers 400 on purpose. Check the credentials first.
- **Sign-in only works from `DASHBOARD_URL`:** it must be the address you actually open (`http://localhost:5174` in dev, the public domain in production).
- **"Port 5174 is already in use":** another dev server holds the port. Stop it rather than letting this one move, because the port has to match `DASHBOARD_URL`.

## Database migrations

Migrations are generated and applied only with drizzle-kit. Change a table in `src/lib/server/db/schema`, run `pnpm db:generate`, review the SQL and commit the new files in `drizzle/`. Never edit generated migrations or use `drizzle-kit push`.

## Deployment

The app is deployed with Dokploy from `infra/dokploy/docker-compose.yml`, alongside its own Postgres (`dashboard-db`). A one-shot `dashboard-migrate` service applies migrations and creates the first admin (if there is none) before the dashboard starts. The `Dockerfile` has a `migrate` target for that job and a `runner` target for the app, and its build context is the repo root:

```bash
docker build -f apps/dashboard/Dockerfile -t szrs-dashboard .
```

Set these in Dokploy before the first deploy:

- `DASHBOARD_DB_PASSWORD`
- `BETTER_AUTH_SECRET`
- `DASHBOARD_URL`, the public address of the dashboard (it must match the domain you add for it)
- `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD`, for the first admin. The first deploy fails on purpose without them, rather than leaving a dashboard nobody can sign in to. Later deploys don't need them.

Behind Traefik the app learns its public address from the forwarded protocol and host headers, so no `ORIGIN` variable is needed.

## Continuous integration

`.github/workflows/test.yml` runs three jobs: `check` (lint and type checks), `test-unit`, and `test-e2e`, which uses a throwaway Postgres service container.
