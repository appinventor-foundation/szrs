# Semantic zoom prompts: phase 1, from the baseline's evidence (v3)

Status: written 2026-11-07 on branch `feat/promptphase1`, after phases 0a and 0b. **This is the plan for phase 1 and later.** It supersedes `prompt_evaluation_and_improvements_v2.md`, which stays untouched, like the two drafts before it, and remains the reference for the long catalogues named in section 2. Where this document and the code disagree, the code is right. Everything stated about code or results was checked against the files named beside it; what was not checked is marked **(to verify)**.

## 1. Summary

**Phase 0 in one paragraph.** Phase 0a (2026-11-06) fixed the defects that did not need data: a versioned prompt registry (`v0` frozen, `v1` the default), compact JSON, a deterministic outline of the program in the user message, a `plan` that is parsed and scored but not returned, a size-aware multi-concept rule, layout moved from the model into the plugin, sampling parameters with a 32768-token cap and truncation detection, per-attempt instrumentation, and a cache key that knows the prompt. Phase 0b (2026-11-07) built `apps/evals/` (a 20-program corpus, headless Blockly, a runner, deterministic metrics, a results viewer) and ran the baseline: `v0` and `v1` on ten models, 400 runs, $2.69. Details: v2 sections 1, 6.0 and 6.7, and `apps/evals/results/2026-11-07-baseline.md`.

**What the baseline found** (all measured without a judge or a human, so it says nothing yet about whether an abstraction is _good_):

- `v0` wrote exactly one Concept block in all 168 valid zooms. `v1` fixes that: its concept count is in the provisional range in 97% of valid zooms against 54%, it reaches the minimum on 16 of 16 compositions against 0 of 16, and its plan covers every stack once.
- `v1` is valid in 78% of runs against 84% for `v0`, mostly through schema failures (20 against 7) on `gpt-5.4-nano` and `qwen3-coder-next`.
- 6 of 324 valid zooms (1.9%) do not load in Blockly.
- `v1` puts more Detail values into labels (5.3 per zoom against 3.0).

**What this session added (2026-11-07, after the baseline):** a diagnosis of the failures (section 3), a change of output format to remove the failing part (section 4), a prompt `v2` that uses it, stricter structural checks and a rule against split stacks (section 5). `v2` has not been run on a model. Section 6 fixes what its run must show **before** it is run.

**Decisions made in this session** (the user's, with the reasoning kept so they can be reopened):

1. The failing schema may be replaced even though that costs comparability with the `v0` and `v1` numbers; `v0` and `v1` stay frozen and their stored results stay valid as they are. Section 6 compares them to `v2` recomputed with the same validators.
2. The replacement is **value placeholders** (section 4), not a flatter binding shape.
3. A `v2` zoom has **no bound dropdowns**, and a block type that shows a Detail value must be used by exactly one block. Both are checked against data in section 6.
4. Before the `v2` run, the user wants to look at screenshots of a small subset of the stored zooms (section 7, step 2), and this document written (done).
5. After looking at the screenshots, split Semantic stacks are measured (D28) and `v2` carries a rule against them (section 5, split stacks, and criterion C8).

## 2. How to read this document and v2

v3 does not copy v2. Use v2 for:

| What                                                                        | Where in v2 |
| --------------------------------------------------------------------------- | ----------- |
| What a level is for, why "usually one block" fails, colour from host blocks | Section 4   |
| Phase 0 items P0-1 to P0-10 and what each became                            | Section 6   |
| Phase 2, the hierarchy (tree of abstractions, pipeline, contract)           | Section 8   |
| The evaluation framework: corpus tiers, failure taxonomy F, metrics D1-D27  | Section 9   |
| Judge metrics J, human study, calibration, gates                            | 9.6 to 9.10 |
| Hypotheses H0 to H15 and their decision rules                               | Section 10  |
| The earlier open questions 1 to 10                                          | 12.3        |

Metric ids (D1 to D27) and hypothesis ids (H0 to H15) are the ones the code and the results cite, so they are not renumbered. New ones in this document: **D28** (split Semantic stacks) and **H16 to H18**.

## 3. Why the baseline's runs failed

Read from the raw text of every failed attempt in `2026-11-07-baseline.json`, with no model call. The message groups below were counted by hand from the grouped error messages, so treat the counts as approximate. 76 of 400 runs were invalid.

| Failure                                                                   | Models and runs                                                        | What the text shows                                                                                                                                                                 |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `detail` entries written as bare id strings, not `{block, field}` objects | `gpt-5.4-nano`, about 10 `v1` runs                                     | The prompt's concept example is `"bindings": [...]`, so the model infers the shape.                                                                                                 |
| `field: null` on a binding                                                | `qwen3-coder-next`, about 9 `v1` runs                                  | It binds every concept block, and concept blocks have no editable field.                                                                                                            |
| `helpUrl`, or a message that repeats a `%1`                               | the same two models                                                    | Mechanical rules the prompt states and the code enforces.                                                                                                                           |
| Invalid JSON ("Expected ',' or '}'")                                      | `gpt-oss-20b` (19 of its 40 runs), `deepseek-v4.1-flash-1017` (3 `v1`) | Free-form JSON of thousands of tokens, with no constrained decoding.                                                                                                                |
| Binding field that does not exist, or a number bound to a text field      | mostly `qwen3-coder-next`, `gpt-5.4-nano`, `gemma-4-26b-a4b-it`        | The same feature as the first rows, caught by the checks against Detail instead of the schema. Only the most frequent messages were grouped, so the exact share is **(to verify)**. |
| Timeout                                                                   | `qwen3.8-27b`, 3 `v1` runs                                             | The model is slow (about 18 tokens a second), not wrong.                                                                                                                            |

Findings:

- **Bindings are the fragile feature.** The model must name a zoom block, a field on it, and one or more Detail blocks and fields, copying ids exactly. Retries often fail again with the same shape error.
- **"Weak models" is the wrong frame.** The three weakest fail for three different reasons (binding shape, null fields, invalid JSON). Which models to support is still the user's decision (v2 open question 2); the four that reach at least 95% validity with both prompts are `claude-haiku-5.5`, `gemini-3.5-flash-lite`, `glm-5.3-flash` and `minimax-m3`.
- **Model rankings were partly measuring the format.** Adding models before the format is fixed would confound that further.
- The invalid-JSON failures are not touched by the change in section 4. Structured output (H7) is the lever for those, and it is not built.

## 4. The placeholder format (built, not yet run)

The model stops writing `args`, `%N` and `bindings` for editable values. Where a label shows a value a user would want to change, it writes a reference to the Detail field instead: `repeat {b7.NUM} times` (`b7` is a canonical Detail block id from the user message), or `{b3.NUM|b9.NUM}` when one value lives on several blocks. The proxy turns each reference into a `field_number` (a number) or `field_input` (text) arg named `V1`, `V2` and so on, appended after the model's own args so its `%N` numbering is untouched, puts the `%N` in the label, and adds the binding. This happens before the schema and the checks, so the response has the same shape as every other prompt's, and the shared contract, the cache and the plugin do not change.

Where it lives: `apps/llm-proxy/src/zoom/placeholders.ts` (`expandPlaceholders`), called from `parseZoomResponse(text, detail, promptId)` when the prompt's new `output` flag is `'placeholders'`; `apps/llm-proxy/src/zoom/prompts/v2.ts`. The evals scorer passes the prompt id the same way.

Rules and their reasons:

- **Numbers and text only.** The saved workspace holds a field's value, not its options, so the proxy cannot tell a dropdown from text. In the stored valid zooms, 2,468 bindings were 66% number, 29% text and 5% dropdown. `v2` drops the dropdown case; resolving it properly means the plugin looking at the real field (H13's neighbourhood).
- **One block per type that shows a value.** The reference lives in the block _definition_, so every block of that type would bind to the same Detail field. In the stored zooms 6% of bound definitions were used by more than one block. `v2` makes that a retryable error, and the baseline will show how often it fires.
- **Several Detail fields for one value** (2% of bindings): `{b3.NUM|b9.NUM}`, all of the same kind.
- **Only `{b<number>.<FIELD>}` counts.** Other braces in a label are left alone.
- A reference whose field is on a block nested inside the named one is repaired when exactly one nested block holds it (the same repair `repair.ts` makes for bindings), and reported otherwise with the candidate ids.
- It also makes the label rule enforceable: a label that still shows a Detail value as plain text is a measurable leak (D17), and a candidate blocking check (section 7, step 5).

Open: how the plugin looks and behaves with generated field names, and what a user sees when a Detail value is a dropdown that the model referenced anyway (it would become a text field; Blockly ignores an invalid value). Neither was checked.

## 5. The structural checks, and what they leave

`validate.ts` now rejects a block with no `type`, a zoom block with no `output` in a zoom block's value input, and one with no `previousStatement` in a statement input or after another block (`checkConnections`). Replaying the stored baseline with `pnpm baseline:score` (no model call) shows it catches **1 of the 6** zooms that passed the old checks and do not load: a block with no `type` (`gpt-oss-20b`, `v1`, `dice-game`).

The other 5 have a **built-in parent**, whose input kinds the proxy cannot know without Blockly (and the proxy must not depend on Blockly): 3 put a zoom statement block in a value input of `text_print` or `controls_if`, and 2 give `controls_if` input names it does not have (`DO`, `IF1`). `v2`'s prompt carries a rule about it (statement blocks in statement inputs, `"output": null` for a value, the built-in block's own input names), which rests on those 5 cases and is unproven. The plugin already drops a level that fails to load (decision #10, reconstructed in `AGENTS.md`). Whether the plugin should report a load failure back so the proxy retries is not decided and changes the contract.

### Split stacks (found by looking)

The user looked at the gallery of stored zooms (`apps/evals/results/2026-11-07-baseline-screenshots.md`) and saw Semantic blocks that end in "do" or "then" followed by separate blocks that look as if they belong in one stack. The pictures confirm it: `claude-haiku-5.5`'s FizzBuzz `v1` Semantic level has "count from 1 to 100 and do", with no statement input, and a second top-level block, "say Fizz, Buzz…", beside it, neither chained nor nested. `v1`'s prompt already says to keep the operations of one Detail stack together as one stack.

Measured on the stored baseline with no model call, as **D28** (`stackSplit`: the Semantic level has more top-level blocks than the program has top-level stacks; `stackExcess` says by how many): `v0` 32 of 168 valid zooms (19%) and `v1` 35 of 155 re-scored (23%; 36 of 156 before the new validator made one run invalid). On programs with a single Detail stack: `v0` 18 of 58 and `v1` 19 of 53. In the gallery, 10 of the 23 valid `v1` runs. So `v1` did not introduce it and its rule does not stop it. D28 is a proxy: more top-level blocks than Detail stacks is consistent with a split, not proof of one. Few labels end in a dangling do, then or repeat with no statement input (5 in `v1`, 4 in `v0`, by a regex, so approximate), and only 2 of 324 zooms have an empty statement input: the cause is mostly operations not chained with `next`, not empty slots.

`v2`'s prompt first asked the model to connect the blocks of a stack with nested `next` objects. The first smoke run (below) showed that this costs validity: `claude-haiku-5.5` and `minimax-m3` wrote deeply nested chains and miscounted the closing braces, three attempts running. So the format changed again, on the same principle as the placeholders: take the structure off the model. The model now writes each level's blocks as **`stacks`**, a list of stacks, each a flat ordered list of blocks (a loop's body is a list in `inputs`), and the proxy builds the `next` chains and the `workspaceJson` (`apps/llm-proxy/src/zoom/stacks.ts`, `buildStacks`). The prompt also says that a program with N top-level stacks gives at most N lists at this level, and that a block whose label ends in "do", "then" or "repeat" needs an `input_statement` holding what runs inside it. Errors sent back to the model say `stacks`, not `workspaceJson`, for a prompt that writes stacks. A level written the old way (a `workspaceJson`) is still accepted. This is H18, with criterion C8 in section 6. D28 is a metric first; whether it becomes a blocking check (a retry saying which blocks to connect) is decided from the `v2` run, as section 7, step 5 does for the other checks.

A repair was added alongside: a `workspaceJson` saved without its outer `"blocks"` key (`{"languageVersion": 0, "blocks": [...]}`) has exactly one meaning, so the proxy wraps it (as decision #11 does for other one-fix mistakes). Re-scoring the stored baseline with it leaves the valid counts unchanged (`v0` 168, `v1` 155).

**First smoke run of `v2`** (2026-11-07, `apps/evals/results/2026-11-07-v2-ten-models-smoke.json`, `countdown`, ten models, one sample each, $0.058; made with the nested-`next` prompt, before stack lists): 7 of 10 valid, against 9 of 10 for `v0` and 8 of 10 for `v1` on the same program. The placeholders expanded correctly (4 to 7 bindings per zoom); `qwen3-coder-next`, `gpt-5.4-nano` and `gpt-oss-20b`, the models the format change targeted, were valid; 6 of the 7 valid zooms kept the stack together. The three failures: `claude-haiku-5.5` and `minimax-m3` on invalid JSON in the nested chain, and `gemma-4-26b-a4b-it` on a workspace written without its `"blocks"` wrapper (reported misleadingly as "has no block of that type"; the new repair now accepts it, and re-scored with the repair that run is valid). One program and one sample is noisy, but haiku failed identically three times. A second smoke run, with stack lists, is needed before the full run.

**Second smoke run of `v2`** (2026-11-07, `apps/evals/results/2026-11-07-v2-ten-models-smoke-2.json`, `countdown` and `dice-game`, ten models, one sample each, $0.159, made with stack lists): **18 of 20 valid**, 13 of 20 on the first attempt. No invalid JSON. **No split stacks (D28) among the 18 valid zooms**, against 23% for `v1` (35 of 155) and 19% for `v0`; a small sample, but the largest change in the data so far. Bindings per valid zoom were 3.89, against 4.47 for `v1` and 4.21 for `v0` on the same two programs (87% of `v1`'s, above C6's 80%); `gpt-5.4-nano` and `qwen3-coder-next` wrote the values into the labels on `dice-game` ("from 1 to 6") instead of referencing them and so had no bindings there. The two failures, `minimax-m3` and `qwen3.8-27b` on `countdown`, had one cause in all six attempts: a loop label with a `%1` but no `input_statement` declared in `args0`, which the existing repair completed by adding a second `%1`, giving "uses %2 %1 %1". The repair (`addArg` in `repair.ts`) now adds the arg without repeating a `%N` the message already has, and the `v2` prompt now shows a loop definition with its `args0`. Re-scoring the stored runs with that fix gives 20 of 20, and the baseline's counts are unchanged (`v0` 168, `v1` 155), but that replay is a fix fitted to those failures, not a fresh measurement: the full run is the test. `qwen3.8-27b` used 33,000 tokens and 634 seconds on its failed `countdown` run, so retries are expensive for it.

## 6. What the `v2` run must show (fixed before it runs)

**Run:** `v2` on the same 20 programs and ten models, one sample each, under the baseline's parameters (200 runs; about $1.50 and over an hour, `qwen3.8-27b` the slowest). Before it, a smoke run of the ten models on one small program (about $0.05). Both need the user's explicit go. `v0` and `v1` are not re-run: their stored text is re-scored with the same validators as `v2`, because the new checks already change one `v1` number. The smoke run has been made twice (section 5, split stacks); the full run is next.

**Comparison base:** `v1`, re-scored. `v1`'s recomputed validity (78% in the write-up, one run lower with the new checks) and failure counts by kind are read from that re-score, not from the write-up.

Hypotheses:

- **H16.** Value placeholders cut schema and binding failures without lowering validity elsewhere.
- **H17.** Labels of `v2` zooms hold fewer Detail values than `v1`'s, because the references replace the literals.
- **H18.** The rules on connecting the blocks of a stack, and on a statement input for a "do" block, lower the share of split Semantic stacks (D28) without lowering validity or the multi-concept gains.

Criteria, with the reasons they are these:

| #   | Criterion                                                                                                                                                  | Why                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| C1  | `v2`'s share of valid runs is at least `v1`'s, and its `schema` failures are at most half of `v1`'s 20.                                                    | The point of the change. The first part guards against moving the failures elsewhere.                                         |
| C2  | No model that reached at least 95% validity with `v1` falls below it.                                                                                      | The change must not hurt the models that work.                                                                                |
| C3  | `gpt-5.4-nano` and `qwen3-coder-next` each reach at least their `v0` validity (14 and 10 of 20).                                                           | They were hurt by `v1`'s bindings; if the format is the cause they recover at least that far.                                 |
| C4  | Value leaks per valid zoom (D17) are at most `v0`'s 3.0.                                                                                                   | H17. `v1` was 5.3.                                                                                                            |
| C5  | What `v1` got right holds: concept count in range in at least 95% of valid zooms, plan coverage 100%, at least 14 of 16 valid compositions at the minimum. | `v2` must not lose the multi-concept gains. The 14 of 16 allows for the sample's noise.                                       |
| C6  | Bindings per valid zoom are at least 80% of `v1`'s.                                                                                                        | Dropping dropdowns and the one-block rule will cost some bindings; a large drop would be a regression in what users can edit. |
| C7  | Output tokens per run are within 20% of `v1`'s.                                                                                                            | A format that makes models write much more would cost more than it saves.                                                     |
| C8  | D28: the share of valid `v2` zooms with a split Semantic level is not above `v1`'s re-scored 23% (35 of 155). The aim, not a pass mark, is half of it.     | H18. The rule is the only change that targets it, and the metric was added after the screenshots, so this is a first measure. |

**Decision rule.** C1 to C3 met and C4 to C8 holding: `v2` is a candidate default, to be decided after a human has looked at its output (section 7, step 2). C1 failing: keep `v1`, and read the new failures by kind before changing anything. A single failed criterion among C4 to C8 is a finding to read, not an automatic verdict.

**Limits to state in the write-up.** One sample per cell, small L and XL cells (4 and 1 programs), and a difference of one or two runs is not a finding, so C1 to C3 are judged on totals and on whole models. Passing says the format is more reliable, not that the abstractions are better; nothing here measures whether a label is true, whether a behaviour was left out, or whether the concept count is what a reader wants.

### Outcome of the first full `v2` run (2026-11-07 to 08)

Write-up and numbers: `apps/evals/results/2026-11-07-v2-baseline.md` (200 runs, code `f6cd31d`, 47 minutes, $1.43). Against the criteria above: **C1 pass** (valid 169/200, 84.5%, against `v1`'s 155/200; schema failures 2 against 20), **C2 fail** (`gemini-3.5-flash-lite` 18/20), **C3 pass** (`gpt-5.4-nano` 16, `qwen3-coder-next` 16), **C4 fail** (8.01 value leaks per valid zoom, against `v1`'s 5.29; H17 not supported), **C5 fail on two of three parts** (concept count in range 94.7%, plan covers every stack once in 162 of 169, compositions 17 of 17), **C6 pass** (8.22 bindings per valid zoom against 8.20), **C7 pass** (0.82 of `v1`'s output tokens per run), **C8 pass** (split stacks 0.6% against 22.6%, H18 supported). By the decision rule, C2 means `v2` is **not yet a candidate default**.

What the failures were: C2 was two `gemini-3.5-flash-lite` runs on proxy strictness (an empty input list, an unused definition), not on the model. C4 is mostly a larger Semantic level (9.9 block definitions per zoom against 7.25; per definition the rate is 0.81 against 0.73, and 0.75 against 0.77 on the six reliable models), plus a noisy metric. C5 comes from `gpt-5.4-nano` and `qwen3-coder-next`, the models `v2` newly makes valid, whose plans and concept counts are poorer; on the six reliable models it is 116 of 117 and 117 of 117. Also found: 8 of 169 valid zooms do not load (against 1 for `v1`), four of them `controls_if` blocks with an else and no `extraState`; `gpt-oss-20b` is mostly unmeasured because 14 of its 20 runs hit an upstream rate limit; the Semantic level has 41% more blocks than `v1`'s, which only the pictures can judge.

What was done after it (commit `6bd6645`): an empty input list now means nothing inside it, an unused definition with references is dropped with a repair note, and the `v2` prompt tells the model to give a built-in block its `extraState`. Re-scoring the stored run with the code changes gives 172 of 200 and would pass C2; the prompt line cannot be replayed. **A full rerun of the fixed `v2` under a new run id (`2026-11-08-v2-baseline-2`) is next,** so that every cell has the same prompt. The same criteria apply, and the first run stays as it is.

## 7. Phase 1 work, in order

1. **Done in code:** the placeholder format, the stack-list format, `v2`, the connection checks, the wrapper repair, and the evals scorer reading `v2` (sections 4 and 5). Proxy and evals unit tests pass. Two smoke runs of `v2` were made (section 5, split stacks); stack lists and the `%N` repair came out of them.
2. **Looked** (done 2026-11-07; `apps/evals/results/2026-11-07-baseline-screenshots.md`). `pnpm baseline:screenshots` drew 5 programs (FizzBuzz, Dice game, Bank account, Three unrelated programs, Tic-tac-toe) on 5 models (`claude-haiku-5.5`, `gemini-3.5-flash-lite`, `glm-5.3-flash`, `gemma-4-26b-a4b-it`, `qwen3-coder-next`) under `v0` and `v1`: no overlaps in 92 drawn levels (D25), 2 levels the plugin cannot load, `v1` blocks all black and `v0` brown. The user's review: the Semantic levels look sensible; the colours are not fixed yet (step 7); some stacks are split apart (section 5, split stacks). The same views are made for `v2` after step 3 (`--prompts v0,v1,v2`).
3. **Smoke, then the `v2` run** (done once: section 6, outcome). The first full run led to fixes (commit `6bd6645`); a full rerun of the fixed `v2` is next, under run id `2026-11-08-v2-baseline-2`, with the user's go, the dry run first.
4. **Ablations (v2 section 7.1), on the better format.** If `v2` passes, ablate `v2` (`v2-noplan`, `v2-nooutline`, `v2-pretty`), not `v1`: H1a, H2 and H10. Each is a new frozen prompt id; costs about as much as one run per variant.
5. **Promote checks to blocking, by data (v2 section 7.2).** Candidates from this session: a label that shows a Detail value as plain text (D17), plan coverage, and a split Semantic stack (D28). Each becomes blocking when its failure rate says a retry is cheaper than shipping the zoom.
6. **The invalid-JSON failures** (`gpt-oss-20b`, `deepseek-v4.1-flash-1017`): structured output or a JSON mode where LiteLLM and the provider support it (H7). It needs a probe per model, as `2026-11-07-openrouter-params.md` did for reasoning, before a run.
7. **The remaining hypotheses** (v2 section 7.3: few-shot H3, retry with the failed output H12, two calls H4, trimming H11, per-model prompts, colour from the host's blocks H1b, bindable field types H13, using the plan in the UI H14, lazy per-level requests H15). Not started, not reordered; most are meaningful only on the format that wins in steps 3 and 4.
8. **Judge calibration and the human study (v2 sections 7.4 and 9.6 to 9.8).** The only way to answer "is it better". Phase 2 does not start before this has shown what a good Concept level looks like (v2 section 11).

Not done from the plan, still candidates: golden annotations (D9, D10, D24), the LLM judge, the human skim, the CI replay gate, the binding round trip (D7), stability over several samples (D19; the baseline is one sample), the hold-out set, per-model reasoning effort as a factor (probe results support it).

## 8. Open questions

Still open from v2 section 12.3: 1 (who reads the Concept level), 2 (which models must be supported, and which is the weakest), 3 (what a host profile holds), 5 to 9. New:

- Should the plugin resolve a Detail field's real kind and options, so dropdowns can be bound again, instead of the proxy guessing from a value?
- Should the plugin tell the proxy that a level failed to load, so it retries?
- Does `v2`'s "one block per type that shows a value" rule cost enough retries to need handling in code (for example by splitting a shared definition into one per block)? Answered by the `v2` run.

## 9. Risks

- **Overfitting to the baseline's failures.** The `v2` built-in-block rule rests on 5 cases, and the placeholder format on one baseline's error messages. The `v2` run on the same corpus cannot tell the two apart from real improvement; a hold-out set and fresh programs are still missing.
- **Comparing across formats.** `v0`, `v1` and `v2` ask for different things, so a difference in validity is a difference of bundles. Section 6 limits its claims to what the criteria say.
- **A reliable format hides a worse zoom.** If `v2` is valid more often because the model writes less of what users edit, C6 should show it, and screenshots and the human study decide the rest.
- **Cache churn and plugin pairing** (v2 section 12.2) are unchanged: `v2` is not the default, so nothing is invalidated until it becomes one.
