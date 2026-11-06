# Checks

Scripts that measure the real system, and the dated results they produced. They call real models, so they cost money and are not part of `pnpm test`: nothing here runs in CI.

| Script                                                         | What it measures                                                                                                                                                                                                         | Run                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| [`cap-and-temperature-spike.ts`](cap-and-temperature-spike.ts) | Per model alias: whether a fixed `temperature` is accepted, which output caps are accepted, whether reasoning tokens use up the cap, how `v0` and `v1` zoom a small program, and whether the prompt id reaches Langfuse. | `pnpm spike:cap <alias> [<alias> ...]` |

## Running one

1. Start the local stack (`docker compose up -d` in `infra/llm-proxy`) and make sure `LITELLM_VIRTUAL_KEY` is in `apps/llm-proxy/.env.local`.
2. From `apps/llm-proxy`, run the script with the aliases to test. To also check Langfuse, load its keys first without printing them: `set -a && . ../../infra/llm-proxy/.env && set +a`.
3. The script writes its raw results to `results/<date>-<name>.json`. Add a short `results/<date>-<name>.md` with what they mean and what was decided.

## Viewing results

`pnpm report` (from `apps/llm-proxy`) turns every `results/*.json` into a self-contained `.html` page beside it, and `pnpm report path/to/file.json` does one. Open the file in a browser: it needs no server and loads nothing from the network. The HTML is generated, so it is gitignored.

The page leads with each model's own name (`glm-5.3-flash`), with its provider beside it and the config alias only as a hint, because the alias says nothing about what was measured. The spike records what each alias resolves to in its `models` block (from LiteLLM's `/v1/model/info`). To add it to a result written without one, run `pnpm spike:cap --models-only <results.json>`; that makes no model calls.

The page shows a table of what the check found, then one chart per measure, grouped by model with one colour per prompt (the same colour in every chart), and the raw outputs. Hover or focus a bar for its value and the number of runs behind it. Every chart has a table view, and light and dark mode follow the system setting.

The viewer is built around rows, not around any one check: a row is a model, a prompt, an optional size tier and some numbers. Any number in a row gets a chart, and rows of different tiers get separate panels on one scale. A new kind of result needs only an adapter in `report/` that maps its JSON to rows (`report/spike.ts` is the example), registered in `report/cli.ts`. The baseline's records get one when the baseline exists.

## Conventions

- **Scripts stay in the repo** next to their results, so a result can be reproduced. A script is type-checked (`pnpm check-types`) and linted like the rest of the app.
- **Results are dated and not edited later.** A new run is a new file. The one addition is an "Outcome" section recording what was decided because of them. The `.md` says which aliases resolved to which models, because aliases can be repointed.
- **No secrets.** The scripts never print keys, and the JSON holds only model outputs, token counts and timings.

## Results

- [2026-11-06: cap and temperature spike](results/2026-11-06-cap-and-temperature-spike.md)
