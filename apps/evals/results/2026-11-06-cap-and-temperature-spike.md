# Cap and temperature spike, 2026-11-06

Raw results: [`2026-11-06-cap-and-temperature-spike.json`](2026-11-06-cap-and-temperature-spike.json). Script: [`../cap-and-temperature-spike.ts`](../cap-and-temperature-spike.ts), run as `pnpm spike:cap openrouter openrouter-2` with LiteLLM running locally.

## What was tested

| Alias          | Model it resolved to                           |
| -------------- | ---------------------------------------------- |
| `openrouter`   | `openrouter/deepseek/deepseek-v4.1-flash-1017` |
| `openrouter-2` | `openrouter/z-ai/glm-5.3-flash`                |

The results JSON records this in its `models` block, read from LiteLLM's `/v1/model/info`. The first run did not record it, so it was added afterwards with `pnpm spike:cap --models-only` (the models had not changed in between: they are the ones the container was started with). Below, the models are called by name; the aliases are only names in the LiteLLM config. The program was a 14-block, 3-stack dice game: a `rollDice` procedure, a loose score update and a `resetGame` procedure. `v0` and `v1` both ran with the shared parameters (`temperature` 0.2, `maxTokens` 8192, the placeholder in `src/zoom/prompts/params.ts`).

## Findings

| Question                                                | `openrouter` (deepseek)                | `openrouter-2` (glm)                   |
| ------------------------------------------------------- | -------------------------------------- | -------------------------------------- |
| Accepts `temperature: 0.2`?                             | Yes (HTTP 200)                         | Yes (HTTP 200)                         |
| Accepts `max_tokens` 8192, 16384, 32768, 65536, 131072? | All accepted                           | All accepted                           |
| Reasoning tokens counted against the cap?               | Yes                                    | Yes                                    |
| With `max_tokens: 256` and a long answer                | Stopped at 256, all 256 were reasoning | Stopped at 256, all 256 were reasoning |
| Stream reports token usage?                             | Yes                                    | Yes                                    |

**Both models reason before they answer, and that counts against `max_tokens`.** With a small cap they spend the whole budget thinking and return no answer text. This changes how to read the cap. For a zoom of the 14-block sample, the completion size (reasoning plus answer) was:

| Prompt | `openrouter` (deepseek) | `openrouter-2` (glm) |
| ------ | ----------------------- | -------------------- |
| `v0`   | 1768 tokens             | 5994 tokens          |
| `v1`   | 1230 tokens             | 5890 tokens          |

That is 72% of the 8192 placeholder for glm on a program of 14 blocks. A program ten times larger would very likely be cut off at 8192, and truncation now fails the zoom without a retry. **8192 is too small as a shared cap for a reasoning model.** Both models accepted caps up to 131072, so the limit is not the provider's. Reasoning tokens are billed, so a higher cap costs money only when a model uses it. A value to decide on is about 32768 (about five times what glm used here); it is not set yet.

Other observations:

- **`temperature` is accepted, not proven to be used.** Both returned 200 with and without it. Reasoning models often ignore sampling parameters, so a 200 does not show it reduces run-to-run variance. That needs the stability metric (D19) from the baseline.
- **`v1` produced three concepts for the three stacks on both models in every run; `v0` never did.** `v0` gave one Semantic block for the whole program on deepseek in every run, and one Concept block on both models. This is one program, so it is an anecdote, but it points the right way.
- **`v1` input is larger on a small program.** 2024 against 1829 tokens on deepseek (+11%) and 1927 against 1753 on glm (+10%): the longer system prompt and the outline outweigh the compact JSON. The compact JSON saves more as programs grow.
- **Time to the first streamed token is long for glm** (22 to 39 seconds, about 5 seconds for deepseek), because it reasons before it writes. The plugin shows nothing in that time.
- **Langfuse:** both `v1` traces carried the tag `zoom-prompt:v1`, so traces can be filtered by prompt version. The `prompt_id` field did not appear in the trace metadata, so the tag is the way to filter.
- **Repeated runs differ.** Across three runs of the script (the first with a scratch copy before it was committed), glm's `v1` gave 3 or 4 Semantic top-level blocks, and its `v0` gave 2 or 3. Counts from one run are not a measurement.

## Outcome

- **Decided (2026-11-06): the shared `maxTokens` is 32768**, in `src/zoom/prompts/params.ts`, with the reasoning above recorded there and in the proxy README. It overrides the alias's `max_tokens` in the LiteLLM config, and only these two aliases were tested.
- **Still open:** whether `temperature` should stay in the shared parameters, since it may do nothing for reasoning models (the baseline's stability metric decides), and whether the plugin should say something while a model reasons before the first token.
