# Checks

Scripts that measure the real system, and the dated results they produced. They call real models, so they cost money and are not part of `pnpm test`: nothing here runs in CI.

| Script                                                         | What it measures                                                                                                                                                                                                         | Run                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| [`cap-and-temperature-spike.ts`](cap-and-temperature-spike.ts) | Per model alias: whether a fixed `temperature` is accepted, which output caps are accepted, whether reasoning tokens use up the cap, how `v0` and `v1` zoom a small program, and whether the prompt id reaches Langfuse. | `pnpm spike:cap <alias> [<alias> ...]` |

The zoom smoke check lives in the dashboard, because it drives the real demo runner and uses the dashboard's Playwright, Postgres client and test-database helpers: [`apps/dashboard/scripts/smoke-zoom.ts`](../../dashboard/scripts/smoke-zoom.ts) with its programs in `smoke-programs.ts`. It writes its results here, next to the others.

## Running one

1. Start the local stack (`docker compose up -d` in `infra/llm-proxy`) and make sure `LITELLM_VIRTUAL_KEY` is in `apps/llm-proxy/.env.local`.
2. From `apps/llm-proxy`, run the script with the aliases to test. To also check Langfuse, load its keys first without printing them: `set -a && . ../../infra/llm-proxy/.env && set +a`.
3. The script writes its raw results to `results/<date>-<name>.json`. Add a short `results/<date>-<name>.md` with what they mean and what was decided.

## The smoke check

It runs five programs (and a sixth, in a custom block set, straight against the proxy) on each model alias in the real demo runner, with real model calls, and records what appears: concept and Semantic block counts, overlaps, colours, the plugin's status line, what happens when a bound field is edited, the proxy's log of each attempt, and a screenshot of every level. It never touches the dev database: it empties and refills the demos table of `dashboard_test`, as the e2e tests do, and empties it again at the end.

Steps, from the repository root:

1. LiteLLM up (`docker compose up -d` in `infra/llm-proxy`), and the dashboard's Postgres container.
2. The proxy, with its output kept: `cd apps/llm-proxy && pnpm dev > /tmp/proxy.log`. It zooms with its default prompt (`DEFAULT_PROMPT_ID`); to check another prompt, change that locally and do not commit it.
3. Build the dashboard and its dependencies, with placeholder values for the variables the build requires: `DATABASE_URL=postgresql://build:build@localhost:5432/build BETTER_AUTH_SECRET=build-only-placeholder-not-a-secret-0000 DASHBOARD_URL=http://localhost:4173 PROXY_URL=http://localhost:3000 pnpm turbo run build --filter=@szrs/dashboard`.
4. Start the dashboard against the **test** database and the real proxy, as the e2e config does (the credentials are the public ones in `apps/dashboard/tests/support/auth.ts`): from `apps/dashboard`, `PORT=4173 PROTOCOL_HEADER=x-forwarded-proto DASHBOARD_URL=http://localhost:4173 PROXY_URL=http://localhost:3000 DATABASE_URL=postgresql://dashboard:dashboard@localhost:5433/dashboard_test BETTER_AUTH_SECRET=e2e-secret-e2e-secret-e2e-secret-0123456789 INITIAL_ADMIN_NAME="E2E Admin" INITIAL_ADMIN_EMAIL=admin@example.com INITIAL_ADMIN_PASSWORD=e2e-admin-password node build`.
5. Run it, from `apps/dashboard`: `pnpm smoke:zoom --models <alias>,<alias> --proxy-log /tmp/proxy.log`. `--only <program>[,<program>]` runs some of the programs.
6. Add the model names and make the report, from `apps/llm-proxy`: `pnpm spike:cap --models-only checks/results/<date>-smoke-check.json`, then `pnpm report`.

The screenshots are in `results/<date>-smoke-check/` and are kept, so they can be looked at by hand; the report embeds them. The custom block set cannot go through the runner, which registers only core blocks, so for that program there are no pictures, and the plan and counts come from the proxy.

## Viewing results

`pnpm report` (from `apps/llm-proxy`) turns every `results/*.json` into a self-contained `.html` page beside it, and `pnpm report path/to/file.json` does one. Open the file in a browser: it needs no server and loads nothing from the network. The HTML is generated, so it is gitignored.

The page leads with each model's own name (`glm-5.3-flash`), with its provider beside it and the config alias only as a hint, because the alias says nothing about what was measured. The spike records what each alias resolves to in its `models` block (from LiteLLM's `/v1/model/info`). To add it to a result written without one, run `pnpm spike:cap --models-only <results.json>`; that makes no model calls.

The page shows a table of what the check found, then one chart per measure, grouped by model with one colour per prompt (the same colour in every chart), and the raw outputs. Hover or focus a bar for its value and the number of runs behind it. Every chart has a table view, and light and dark mode follow the system setting.

The viewer is built around rows, not around any one check: a row is a model, a prompt, an optional size tier and some numbers. Any number in a row gets a chart, and rows of different tiers get separate panels on one scale. A new kind of result needs only an adapter in `report/` that maps its JSON to rows (`report/spike.ts` is the example), registered in `report/cli.ts`. The baseline's records get one when the baseline exists.

## Pitfalls when writing a check

- **Browser-side code in Playwright's `page.evaluate`** must not contain named inner functions or `const f = () => ...`: `tsx` rewrites them with a helper that does not exist in the page ("__name is not defined"). Return raw pieces and tidy them in Node, or pass a string.
- **A locked zoom block has no `blocklyDraggable` class** (the loader makes blocks immovable). Select `g.blocklyBlock` under `g.blocklyBlockCanvas`, and use `:scope > path.blocklyPath` for a block's own colour.
- **Rendered text includes editable field values.** To judge what a model wrote into a label, read `g.blocklyLabelField` only; a value in an editable field is live and follows Detail.
- **JavaScript's `String.replace` treats `$&` in the replacement as special.** When a script edits source with a replacement string, pass a function, or the code gets mangled.
- **A background shell may not start in the directory you expect.** Run scripts with `pnpm --filter @szrs/<name> <script>` from the repository root.
- **`loading="lazy"` images** are not loaded until scrolled into view, so a check for broken images must make them eager first.

## Conventions

- **Scripts stay in the repo** next to their results, so a result can be reproduced. A script is type-checked (`pnpm check-types`) and linted like the rest of the app.
- **Results are dated and not edited later.** A new run is a new file. The one addition is an "Outcome" section recording what was decided because of them. The `.md` says which aliases resolved to which models, because aliases can be repointed.
- **No secrets.** The scripts never print keys, and the JSON holds only model outputs, token counts and timings.

## Results

- [2026-11-06: cap and temperature spike](results/2026-11-06-cap-and-temperature-spike.md)
- [2026-11-06: zoom smoke check](results/2026-11-06-smoke-check.md)
