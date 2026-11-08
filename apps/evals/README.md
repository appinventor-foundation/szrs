# Evals

`apps/evals` is its own package, not part of the proxy or any deployed service: it imports the proxy's prompt registry, parsing and validation through the proxy's `exports` map, and uses headless Blockly (`blockly` is a dependency here, and must stay out of the proxy). It started in phase 0a as `apps/llm-proxy/checks/`; the dated results written then keep their original text, which still says `checks/` and `apps/llm-proxy`.

Run everything from `apps/evals`. Scripts read `LITELLM_VIRTUAL_KEY` from `apps/llm-proxy/.env.local` (so there is one copy of the key), then from `apps/evals/.env.local` if that exists.

Scripts that measure the real system, and the dated results they produced. They call real models, so they cost money and are not part of `pnpm test`: nothing here runs in CI.

| Script                                                         | What it measures                                                                                                                                                                                                         | Run                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| [`cap-and-temperature-spike.ts`](cap-and-temperature-spike.ts) | Per model alias: whether a fixed `temperature` is accepted, which output caps are accepted, whether reasoning tokens use up the cap, how `v0` and `v1` zoom a small program, and whether the prompt id reaches Langfuse. | `pnpm spike:cap <alias> [<alias> ...]` |

| [`openrouter-params-probe.ts`](openrouter-params-probe.ts) | Whether LiteLLM passes OpenRouter's `reasoning` and `provider` request fields on, whether reasoning can be lowered or switched off, whether a provider pin is honoured, and which provider served each call; then one zoom with reasoning at `low`. | `pnpm probe:openrouter <model id> [...]` |
| [`baseline/`](baseline/) | The phase 0b baseline: every corpus program (20, written by hand in `baseline/corpus/`) zoomed with each chosen prompt on each chosen model, k times, with the proxy's retry loop and no cache. Stores the raw text of every attempt, scores it with the deterministic metrics (`baseline/metrics.ts`) and can score it again later. | `pnpm baseline:run --models <id,...> --prompts v0,v1 [--samples k] [--dry-run]`, `pnpm baseline:score <results.json>` |
| [`screenshots/`](screenshots/) | Draws zooms the baseline stored, in a real browser (Playwright's Chromium), through the plugin's own `ZoomLevelLoader`: the Detail program, then each chosen run's Semantic and Concept levels, with the number of blocks, overlaps (D25) and block colours measured as it draws. No model call, so no cost. `pnpm report` makes a gallery with one column per prompt. | `pnpm baseline:screenshots [--programs a,b] [--models a,b] [--prompts v0,v1] [--results file.json] [--colour] [--covers file.json]` |

The zoom smoke check lives in the dashboard, because it drives the real demo runner and uses the dashboard's Playwright, Postgres client and test-database helpers: [`apps/dashboard/scripts/smoke-zoom.ts`](../../dashboard/scripts/smoke-zoom.ts) with its programs in `smoke-programs.ts`. It writes its results here, next to the others.

## Running one

1. Start the local stack (`docker compose up -d` in `infra/llm-proxy`; for the baseline, with the wildcard route, see "The baseline") and make sure `LITELLM_VIRTUAL_KEY` is in `apps/llm-proxy/.env.local` (or `apps/evals/.env.local`).
2. From `apps/evals`, run the script with the aliases to test. To also check Langfuse, load its keys first without printing them: `set -a && . ../../infra/llm-proxy/.env && set +a`.
3. The script writes its raw results to `results/<date>-<name>.json`. Add a short `results/<date>-<name>.md` with what they mean and what was decided.

## The smoke check

It runs five programs (and a sixth, in a custom block set, straight against the proxy) on each model alias in the real demo runner, with real model calls, and records what appears: concept and Semantic block counts, overlaps, colours, the plugin's status line, what happens when a bound field is edited, the proxy's log of each attempt, and a screenshot of every level. It never touches the dev database: it empties and refills the demos table of `dashboard_test`, as the e2e tests do, and empties it again at the end.

Steps, from the repository root:

1. LiteLLM up (`docker compose up -d` in `infra/llm-proxy`), and the dashboard's Postgres container.
2. The proxy, with its output kept: `cd apps/llm-proxy && pnpm dev > /tmp/proxy.log`. It zooms with its default prompt (`DEFAULT_PROMPT_ID`); to check another prompt, change that locally and do not commit it.
3. Build the dashboard and its dependencies, with placeholder values for the variables the build requires: `DATABASE_URL=postgresql://build:build@localhost:5432/build BETTER_AUTH_SECRET=build-only-placeholder-not-a-secret-0000 DASHBOARD_URL=http://localhost:4173 PROXY_URL=http://localhost:3000 pnpm turbo run build --filter=@szrs/dashboard`.
4. Start the dashboard against the **test** database and the real proxy, as the e2e config does (the credentials are the public ones in `apps/dashboard/tests/support/auth.ts`): from `apps/dashboard`, `PORT=4173 PROTOCOL_HEADER=x-forwarded-proto DASHBOARD_URL=http://localhost:4173 PROXY_URL=http://localhost:3000 DATABASE_URL=postgresql://dashboard:dashboard@localhost:5433/dashboard_test BETTER_AUTH_SECRET=e2e-secret-e2e-secret-e2e-secret-0123456789 INITIAL_ADMIN_NAME="E2E Admin" INITIAL_ADMIN_EMAIL=admin@example.com INITIAL_ADMIN_PASSWORD=e2e-admin-password node build`.
5. Run it, from `apps/dashboard`: `pnpm smoke:zoom --models <alias>,<alias> --proxy-log /tmp/proxy.log`. `--only <program>[,<program>]` runs some of the programs.
6. Add the model names and make the report, from `apps/evals`: `pnpm spike:cap --models-only results/<date>-smoke-check.json`, then `pnpm report`.

The screenshots are in `results/<date>-smoke-check/` and are kept, so they can be looked at by hand; the report embeds them. The custom block set cannot go through the runner, which registers only core blocks, so for that program there are no pictures, and the plan and counts come from the proxy.

## The baseline

**Models and their conditions.** `--models` takes ids from [`baseline/model-registry.ts`](baseline/model-registry.ts). An entry names the model in full (`openrouter/z-ai/glm-5.3-flash`), which is sent as `model` to LiteLLM, and the extra request fields it runs under: a provider pin (`provider: { order: [...], allow_fallbacks: false }`, so a model is not served by a different host, with a different quantization, from one call to the next) and optionally `reasoning`. These are OpenRouter's own fields, which LiteLLM passes on (see `pnpm probe:openrouter`). Each result records the conditions, the cost in dollars and the reasoning tokens of every call. To benchmark another model, add an entry: nothing is added to LiteLLM's config, and the model does not appear in the dashboard's list.

**The wildcard route (local only).** LiteLLM must be started with a wildcard route for OpenRouter, so that it sends any `openrouter/...` name on: `docker compose -f infra/llm-proxy/docker-compose.yml -f infra/llm-proxy/docker-compose.benchmark.yml up -d litellm`. That layers [`docker/litellm/config.benchmark.yaml`](../../infra/llm-proxy/docker/litellm/config.benchmark.yaml) on the shared config; it is not part of the Dokploy image, and the shared virtual key needs no change. `baseline:run` stops before any call if LiteLLM has no route for a model, and says how to start it. A registry entry can also name an LiteLLM alias (then set `expect`, so a repointed alias is caught).

`pnpm baseline:run ... --dry-run` prints how many runs it would make and an estimate of the input size, and calls nothing. A real run needs LiteLLM up and `LITELLM_VIRTUAL_KEY` (found the way the spike finds it, see the top of this file), costs money, and writes `results/<date>-baseline.json` after every finished run, so a stopped run keeps its work (`--resume` continues it). Ask before running it.

Each program is loaded into a headless Blockly workspace and saved first, as the plugin does, so its blocks have ids; the proxy then canonicalises it. A run follows the proxy's zoom route: up to three attempts, a retry carries the last error, a truncated answer stops the run. A call that takes longer than `--call-timeout` seconds (default 2400, since a slow reasoning model can need half an hour to fill the output cap) is recorded as a timeout, its own kind of failure, and is not repeated; a busy or unavailable answer (429, 502, 503, 504) or a network error is repeated up to three times after a wait, and the repeats are recorded. `pnpm baseline:score` and the report score every record again from its stored text with the validators as they are today, so a fixed validator needs no new model calls. D5 (does it load) runs in headless Blockly; what a headless workspace cannot show (layout, rendering, D25) and the binding round trip (D7) are not measured yet. The expected concept counts in the corpus are the author's provisional guesses, not golden annotations.

## Screenshots of stored zooms

`pnpm baseline:screenshots` (from `apps/evals`) bundles `screenshots/page/main.ts` with Vite, draws each stored run in headless Chromium and keeps the pictures: results go to `results/<date>-baseline-screenshots.json` with a folder of PNGs of the same name beside it (an existing result is never overwritten; a second run is `-2`). The defaults are the five programs and five models chosen on 2026-11-07 (see `screenshots/plan.ts`), about 100 pictures and 1.5 MB, in 25 seconds. A run that has no zoom has no pictures and is recorded as invalid; a level the plugin cannot load is recorded with Blockly's error. By default a zoom is drawn as it was stored (black zoom blocks for `v1` and `v2`). `--colour` draws it as the proxy and plugin return it today: the default colour on definitions with none, and each zoom block coloured by its anchor in the run's stored plan, from a rendered Detail workspace (a `v0` to `v2` run has anchors for Concept blocks only); `--covers file.json` (`{"program/model/prompt": {"s1": ["b3"]}}`, canonical ids) adds hand-made `covers`, to see what a `v3` plan would give without a model call. Because it imports the plugin's loader, a change to `apps/blockly-szrs/src/zoom_level_loader.ts` changes what these pictures show. The tool uses `@playwright/test` and `vite` as dev dependencies of this package (never deployed); Playwright's browsers must be installed (`pnpm exec playwright install chromium`, from `apps/evals` or the dashboard).

## Viewing results

`pnpm report` (from `apps/evals`) turns every `results/*.json` into a self-contained `.html` page beside it, and `pnpm report path/to/file.json` does one. Open the file in a browser: it needs no server and loads nothing from the network. The HTML is generated, so it is gitignored. To read two baseline files in one report (two prompts run on different days, so the prompt-effect table compares them per model), use `pnpm report --compare a.json,b.json --prompts v2,v3 --name <label>`: it writes `results/<label>.html` and changes neither file; the commit is shown only when every file was made on the same one. The colour anchors (D23, and D24a, which flags candidates for labels, not wrong anchors) have their own charts and three columns in that table; the charts average each run's share and the table pools the blocks, so they differ slightly.

The page leads with each model's own name (`glm-5.3-flash`), with its provider beside it and the config alias only as a hint, because the alias says nothing about what was measured. The spike records what each alias resolves to in its `models` block (from LiteLLM's `/v1/model/info`). To add it to a result written without one, run `pnpm spike:cap --models-only <results.json>`; that makes no model calls.

The page has a contents list on the left that follows you down the page and marks where you are (on a phone it folds into a "Contents" disclosure), and every section collapses; "Expand all" and "Collapse all" are above it. Sections come in this order: what the adapter wrote (tables, findings), the charts, reference material, and the raw outputs, which start closed because they are most of the page. Each chart says what it shows, which direction is better, and carries its own legend; a share is drawn as a percentage of runs. Charts are grouped under headings, one colour per prompt (the same colour in every chart), with the size tiers folded under an "All programs" panel. Hover or focus a bar for its value and the number of runs behind it. Every chart has a table view, and light and dark mode follow the system setting.

The viewer is built around rows, not around any one check: a row is a model, a prompt, an optional size tier and some numbers. Any number in a row gets a chart, and rows of different tiers get separate panels on one scale. An adapter can also describe its numbers (`metrics`: label, what it shows, which direction is better) and group its charts (`chartGroups`); `report/baseline-insights.ts` does both for the baseline, and also computes its findings, the per-model effect of changing the prompt, and the program grid. A new kind of result needs only an adapter in `report/` that maps its JSON to rows (`report/spike.ts` is the example), registered in `report/cli.ts`. `report/baseline.ts` is the baseline's.

## Pitfalls when writing a check

- **Browser-side code in Playwright's `page.evaluate`** must not contain named inner functions or `const f = () => ...`: `tsx` rewrites them with a helper that does not exist in the page ("__name is not defined"). Return raw pieces and tidy them in Node, or pass a string.
- **A locked zoom block has no `blocklyDraggable` class** (the loader makes blocks immovable). Select `g.blocklyBlock` under `g.blocklyBlockCanvas`, and use `:scope > path.blocklyPath` for a block's own colour.
- **Rendered text includes editable field values.** To judge what a model wrote into a label, read `g.blocklyLabelField` only; a value in an editable field is live and follows Detail.
- **JavaScript's `String.replace` treats `$&` in the replacement as special.** When a script edits source with a replacement string, pass a function, or the code gets mangled.
- **A background shell may not start in the directory you expect.** Run scripts with `pnpm --filter @szrs/<name> <script>` from the repository root.
- **`loading="lazy"` images** are not loaded until scrolled into view, so a check for broken images must make them eager first.

## Conventions

- **Scripts stay in the repo** next to their results, so a result can be reproduced. A script is type-checked (`pnpm check-types`) and linted like the rest of the app.
- **Results are dated and not edited later.** A new run is a new file, and no script overwrites a result: the spike, the probe and the smoke check add `-2`, `-3` to a name that is taken, and the baseline's default name has the time in it (an existing run file is refused unless you pass `--resume`). A resumed baseline run must be on the commit the file was made on, and its header grows to describe every record in it. The one addition is an "Outcome" section recording what was decided because of them. The `.md` says which aliases resolved to which models, because aliases can be repointed.
- **No secrets.** The scripts never print keys, and the JSON holds only model outputs, token counts and timings.

## Results

- [2026-11-06: cap and temperature spike](results/2026-11-06-cap-and-temperature-spike.md)
- [2026-11-06: zoom smoke check](results/2026-11-06-smoke-check.md)
- [2026-11-07: OpenRouter reasoning and provider fields through LiteLLM](results/2026-11-07-openrouter-params.md)
- [2026-11-07: zoom baseline, `v0` and `v1` on ten models](results/2026-11-07-baseline.md)
