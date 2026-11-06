# Semantic zoom prompts: a phase-0 fix set, then evidence-driven improvement (v1)

Status: proposal and study plan, second version. Written 2026-11-05 against branch `feat/plugindemo`. It supersedes `prompt_evaluation_and_improvements.md`, which is left untouched. Nothing here has been implemented. Statements about the code were checked against the files named beside them. Anything about App Inventor internals, provider behaviour, thresholds or literature that was not checked is marked **(to verify)**.

## 1. Summary

**Where we are.** One static system prompt (`ZOOM_SYSTEM_PROMPT`, `apps/llm-proxy/src/zoom/zoom.ts`) is sent to every model with a user message that holds only the slug and the pretty-printed workspace. It asks for one JSON object with two levels, `semantic` and `concept`, for the whole program in a single call. It tells the model the Concept level is "usually ONE block" and that every zoom block has colour 30. Code around it (repair, schema, validation, three attempts) makes the JSON loadable. Nothing measures whether the abstraction is good.

**The position of this version.** Some defects are indefensible whatever the data says, and some things must exist before anything can be measured. Those form a **phase 0**: a small, deliberate set of changes, made before the baseline, producing a prompt called `v1`. The original is frozen as `v0`, and the baseline compares the two. Everything that is a design bet, where a reasonable person could argue the old way is better, waits for the baseline and goes to phase 1. The hierarchy redesign is phase 2.

**Phase 0 in one paragraph.** A versioned prompt registry (`v0` frozen, `v1`); compact JSON; a deterministic outline of the program in the user message; a `plan` that replaces the dead "Step 1"; a size-aware multi-concept rule with a neutral output skeleton; a `kind` on every zoom block (event, procedure, variable, and so on) from which the proxy derives the colour, because in Blockly colour is category and not identity; layout moved out of the model and into the plugin; explicit sampling parameters, an output cap and detection of truncation; per-attempt instrumentation; and a cache key that knows which prompt produced an entry. Phase 0 adds no new reason to retry and keeps the response shape.

**What the later phases get from it.** The outline is phase 2's parse stage. The plan is phase 2's cluster tree in miniature. The kind vocabulary becomes the node kind at every level. The registry hosts the per-stage prompts. Section 5.4 lists this in detail, and it is the main reason phase 0 is worth doing first.

**The domain is App Inventor,** where a Blockly workspace shows one screen at a time. Per-screen zoom is the unit. Whether a whole-app view is feasible is a separate feasibility study (section 4.5), run in parallel and not a prerequisite for anything else.

## 2. What changed from the first version

- **Phase 0 exists,** between "understand the problem" and "improve the system". It holds defects and prerequisites only, and its output (`v1`) is baselined against the frozen original (`v0`).
- **Colour is category, not identity.** The first version proposed a distinct colour per concept. That treats colour as identification, which is wrong for Blockly, where colour marks the kind of block. The model now emits a closed-vocabulary `kind`, and the proxy derives the colour from it (section 4.3, P0-6).
- **The prompt registry is phase 0,** not a phase 1 detail, because the v0 versus v1 comparison cannot run without it.
- **New findings from the code** (section 3): the cache key hashes only the system prompt, so changing the user message would not invalidate it (O18); the streaming path drops `finish_reason`, so truncation is invisible on the path the plugin uses (O2); the plugin has no layout step, so several model-placed blocks can overlap (O17); the `field_image` rule is redundant but enforced, not a gap (O19, a correction).
- **Phase 1 is reorganised around ablation.** `v1` changes several things at once, so phase 1 starts by attributing its effect, then promotes checks to blocking, then tests the remaining hypotheses.
- **Phase 2 explicitly reuses phase 0.** The outline, plan, kind vocabulary, registry and layout are the first stages and plumbing of the hierarchy.
- **The evaluation framework** now separates metrics that apply to `v0` from those that need `v1`'s extra fields, and adds metrics for the new pieces (kind, plan, truncation, layout, prompt size).

## 3. How the prompt works today

### 3.1 Request path

| Step | Where                                | What happens                                                                                                                                                                                                                                                           |
| ---- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Plugin `semantic_zoom_plugin.ts`     | On first leaving Detail, saves the workspace with `Blockly.serialization.workspaces.save` and sends `{model, slug, workspaceJson}`. The user chooses the model; `getSlug` gives the slug. The plugin shows `result[level]`, so one response serves both zoomed levels. |
| 2    | Plugin `zoom_session.ts`             | Keeps each model's result for the last workspace; one request in flight; a repeat joins it, a different request aborts it.                                                                                                                                             |
| 3    | Proxy `routes/zoom.ts`               | `normalizeWorkspace` renames blocks to `b1…bn`, variables to `v1…vn`, drops `x`/`y`. Cache lookup by `zoomCacheKey` (only when `CACHE_URL` is set).                                                                                                                    |
| 4    | `zoom.ts` `buildZoomMessages`        | Two messages: the constant system prompt, and a user message with the slug, the snake slug and `JSON.stringify(workspaceJson, null, 2)`. On a retry the previous error text is appended to the user message.                                                           |
| 5    | `lib/litellm.ts`                     | POST to LiteLLM `/v1/chat/completions` with `model`, `messages`, `temperature` and `max_tokens`. The zoom route passes neither parameter, so both are omitted. Non-streaming returns `finishReason`; the streaming parser returns only text tokens.                    |
| 6    | `parseZoomResponse`                  | Strips code fences and leading prose, parses, runs `repairZoomResult`, validates with `ZoomResponseSchema` (Zod, which drops unknown keys) and `checkZoomResult`.                                                                                                      |
| 7    | Retry                                | Up to `MAX_ATTEMPTS = 3`. The error text goes into the next user message; the previous output is not sent back.                                                                                                                                                        |
| 8    | Cache write                          | Key = `KEY_VERSION`, model, slug, `sha256(ZOOM_SYSTEM_PROMPT)`, canonical workspace. The result is stored in canonical ids; `restoreIds` maps binding ids back per caller.                                                                                             |
| 9    | Plugin loader `zoom_level_loader.ts` | Registers each level's `blockDefs` globally (removing the previous level's), loads its `workspaceJson` with the model's `x`/`y`, sets each bound field to Detail's current value, and makes every block immovable and undeletable with only bound fields enabled.      |

`/v1/zoom/stream` runs the same loop and emits `attempt`, `token`, `done` and `error` events.

### 3.2 Prompt anatomy

| Section                  | Purpose                                                                                                                            | Enforced in code?                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Role                     | Describe the program at two higher levels; never write code.                                                                       | No.                                                                                                                              |
| Output format            | JSON only; `semantic` and `concept`, each with `blockDefs`, `workspaceJson`, `bindings`. The example shows one block per level.    | Shape: yes (Zod). "JSON only": fence and prose stripping.                                                                        |
| Step 1, analyse          | Four questions to think through.                                                                                                   | No, and the format has no field for the answer.                                                                                  |
| Level 2 (Semantic) rules | One block per logical operation; type `zoom_<snake_slug>_<op>`; colour 30; structural Blockly primitives allowed.                  | Only the `zoom_` prefix and that used types are defined. Slug part, colour and "one per operation" are prompt-only.              |
| Level 3 (Concept) rules  | "Usually ONE block"; type `zoom_<slug>_concept`; few essential fields; statement block; only zoom blocks.                          | Nothing: not the count, the suffix, nor "only zoom blocks".                                                                      |
| Block definition rules   | `zoom_` + `[a-z0-9_]`; allowed arg types; no extensions, mutator, `helpUrl`, `field_image`; labels never hold current values; ids. | Mostly: `ZoomBlockDefSchema` (forbidden keys, arg-type enum, `%N` placeholders). Prompt-only: labels free of values, unique ids. |
| Binding rules            | Which fields, how to reference Detail ids, nested holders, multiple refs.                                                          | Largely: `validate.ts` (existing ids and fields, value kind) and `repair.ts` (moves a binding to the single nested holder).      |
| JSON encoding rules      | Escaping, no literal newlines, no fences.                                                                                          | Fence stripping only.                                                                                                            |

### 3.3 Observations

Numbered `O1…O20` so later sections can cite them.

1. **O1. One prompt for all models.** No per-model prompt, parameters or output mode.
2. **O2. No sampling control, no output cap, and truncation is invisible on the streaming path.** `temperature` and `maxTokens` are accepted by the chat contract but never passed for zoom, so provider defaults apply and run-to-run variance is unknown. A provider's default output limit can truncate a large result into invalid JSON, producing a bare parse error and a retry that will be truncated again. The non-streaming call returns `finishReason` but the zoom route ignores it; the streaming call, which is the one the plugin uses, does not return it at all.
3. **O3. Both levels in one call.** A user who asks for Semantic pays for Concept in tokens and latency, and in exchange switching levels afterwards is free. Never measured.
4. **O4. Analysis has nowhere to go.** "Step 1" tells the model to analyse, then "output ONLY the JSON". A non-reasoning model skips it; a reasoning model does it out of sight. Either way it cannot be inspected or scored.
5. **O5. The format example anchors the result.** It shows exactly one block per level (`s1`), at `x:20, y:20`, with a `LIMIT` field and the wording "do something up to %1". Models copy example shapes. The same single-flow assumption applies to Semantic: the example, and the rules, imagine one stack.
6. **O6. "Usually ONE block" for Concept.** Section 4.2.
7. **O7. All zoom blocks have colour 30.** Section 4.3. In Blockly colour is how a reader tells an event from a procedure from a variable. A flat colour removes that, and makes the two zoomed levels visually identical.
8. **O8. The whole workspace is sent pretty-printed** (`JSON.stringify(…, null, 2)`). Indentation adds tokens for no gain.
9. **O9. The model gets no structure hint.** It must discover the number of top-level stacks, which handlers exist and how big the program is by reading raw JSON.
10. **O10. Retries start from scratch.** The model gets the error text but not its own previous output. A JSON parse error says nothing about where the problem is.
11. **O11. Repair and retry hide weakness.** A repaired output counts as a success; `repairs` are only logged and attempts are only shown in the plugin's info line. Nothing aggregates them.
12. **O12. Prompt-only rules are never checked:** the Concept block count, "only zoom blocks" at Level 3, the type-name suffix and slug part, labels containing current values, unique ids (`byId` silently keeps one block when ids repeat).
13. **O13. A binding with several Detail references is checked per reference, not for consistency.** The loader and editor display the first reference's value (`const [source] = binding.detail`) and write an edit to all of them. If the references differ, the first edit silently overwrites the others.
14. **O14. Bindings can only expose number, text and dropdown fields** (`ZOOM_EDITABLE_FIELD_TYPES`). Checkbox, colour and component fields, common in App Inventor, cannot be exposed.
15. **O15. Zoomed blocks are display-only.** The loader makes them immovable and undeletable and enables only bound fields. There is no drill-down from Concept to Semantic to Detail.
16. **O16. The block registry is global.** `Blockly.common.defineBlocksWithJsonArray` registers types globally and the loader unregisters the previous level's first. Several levels visible at once would need unique types across levels.
17. **O17. The plugin has no layout step.** `ZoomLevelLoader.load` uses the model's `x`/`y`, and `ZoomView.show` only calls `scrollCenter`. With one block per level this never mattered. With several top-level blocks, every one placed at the example's `(20, 20)` would overlap.
18. **O18. The cache key hashes only the system prompt.** `PROMPT_VERSION = sha256(ZOOM_SYSTEM_PROMPT)`. The user-message template (`buildZoomPrompt`, the retry suffix) is not part of it, so changing how the user message is built, which phase 0 does, would not start a fresh set of cache entries. There is also no prompt id, so two variants cannot coexist.
19. **O19. The `field_image` rule is redundant, not a gap.** The prompt says never to use it; the schema enforces that by leaving it out of the arg-type enum. (The first version of this document called it a mismatch; it is enforced.)
20. **O20. Stale references.** The contracts, plugin and proxy cite `DECISIONS.md` (#8, #10, #11), which does not exist.

## 4. What "better" means

### 4.1 The levels, defined by purpose

| Level    | Reader question                                   | Content                                                                                         | Typical unit                                              |
| -------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Detail   | How exactly does it do it?                        | Every block.                                                                                    | A block.                                                  |
| Semantic | What does each step do, and what can I tune?      | One block per logical operation; implementation hidden; tunable values exposed as bound fields. | An operation (a loop that sums, a check, a handler step). |
| Concept  | What is this program for, and what are its parts? | The program's responsibilities or features; only the most important values exposed.             | A feature, or a screen-level responsibility.              |

Properties of a good level, each becoming a metric in section 9:

- **Fidelity:** nothing claimed that the Detail program does not do.
- **Coverage:** everything the Detail program does is accounted for, at least down to its top-level stacks.
- **Compression and monotonicity:** each level is smaller than the one below, and Concept is a grouping of Semantic, not an independent description.
- **Appropriate granularity:** the count of units fits the program.
- **Label quality:** behavioural, specific, consistent in verb style, never containing current values.
- **Kind fidelity:** a block looks like what it stands for (section 4.3).
- **Parameter exposure and binding integrity:** the values a user wants to change are bound, and an edit changes exactly the intended Detail fields.
- **Stability:** the same program gives structurally similar output on repeated runs, and a small edit does not reshuffle everything.

### 4.2 Why "usually one block" fails, at both levels

For FizzBuzz, one Concept block ("FizzBuzz up to N") is right. For a mobile app it is not. An App Inventor screen has several event handlers, procedures and globals, which are separate responsibilities. A reader scanning the Concept level wants a handful of items, not one and not forty. A model told "usually one block" complies even where one is wrong, so the prompt sets the ceiling.

The assumption is wider than the Concept rule. The format example, the Level 2 rules and the layout all imagine **one flow**: one block per level, one stack at Semantic, one position. A multi-handler program has several top-level stacks at every level. Fixing only the Concept sentence would leave the example anchoring a single block, the Semantic level without a rule for several stacks, and the plugin placing several blocks at the same coordinates. Phase 0 fixes these together (P0-3, P0-5, P0-7).

The Concept rule should depend on structure, and the model should be told the structure rather than infer it. Starting hypothesis (to calibrate against human ratings, not assume): one concept for a single-purpose program, otherwise one per distinct responsibility, usually 2 to 7, so that the level stays glanceable (a working-memory motivation, Miller 1956, **to verify** applicability). The numbers are provisional, and the baseline is what tests them.

### 4.3 Colour is category: the `kind` design

In Blockly, colour is semantic. Loops, logic, math, text, lists, variables and procedures each have a colour, and a reader uses it to tell what a block is before reading it. App Inventor leans on this more: event handlers, component calls, variables and procedures are visually distinct **(to verify the exact palette)**. A zoom block that stands for an event handler should look like an event. One that stands for a procedure should look like a procedure. A flat colour 30 removes this and also makes Semantic and Concept indistinguishable. The first version's proposal of a distinct colour per concept would have been wrong in a different way: colour would then identify instances, not kinds.

**Design.**

1. The model labels every block definition with a `kind` from a small closed vocabulary (Appendix E): `event`, `procedure`, `variable`, `control`, `logic`, `math`, `text`, `list`, `other`. The kind is the category of what the block stands for. For a block that summarises a stack, it is the kind of the top-level block that anchors the stack (a handler is `event`, a procedure definition is `procedure`).
2. The model no longer chooses colours. The proxy derives `colour` from `kind` using a default table, deterministically, after repair.
3. `kind` stays in the block definition (the schema allows extra keys). A later phase lets the plugin override colours from `kind` using the host's palette (App Inventor's own, or a Blockly theme), without a new model call.

**Why this and not the alternatives.**

| Option                                                                | Verdict                                                                                                                                                                                 |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt tells the model to "use the Detail block's colour"             | The Detail JSON has block types but no colours, and App Inventor's palette differs from core Blockly. The model would guess hues that nothing checks.                                   |
| Model picks hue numbers from a table in the prompt                    | Workable, but puts a palette in every prompt, cannot follow a host's palette or dark mode, and is an unverifiable free choice.                                                          |
| Plugin derives colour from the live Detail blocks a zoom block covers | The most faithful, and needs a per-block mapping to Detail ids (more output, more validation). Kept as a later refinement; the `plan` supplies part of the data.                        |
| Closed `kind` from the model, colour derived deterministically        | A small, easily validated classification the model does well; the colour policy lives in code and can follow the host. **Chosen.**                                                      |
| Blockly theme `style` names (`loop_blocks`, …)                        | Follows the host theme including dark mode, but core Blockly has no event style and App Inventor's theme may not define these names **(to verify)**. A candidate for the host override. |

**Consequences.** A kind is not the only cue: labels still describe behaviour, so colour is not the sole carrier of meaning. The vocabulary needs review with the App Inventor team (component calls and properties, dictionaries, colours are not covered). Default hues are placeholders in Appendix E.

### 4.4 What a multi-concept result looks like

For a dice app with a Roll button, a score counter and a reset, the Concept level is three top-level blocks ("Roll a die and show it", "Keep a running score", "Reset the game"), mostly unconnected, because they are separate event-driven behaviours and not a sequence. Their kinds follow what they summarise (probably all `event` here). The Semantic level is several stacks, one per Detail stack, each in program order. The `plan` (P0-4) records which Detail stacks and Semantic blocks each concept covers, which gives the hierarchy explicitly.

### 4.5 App Inventor: one screen per workspace

The target is App Inventor, where each screen has its own blocks workspace and the user sees one at a time **(to verify, including how blocks are stored and loaded)**.

- **Per-screen zoom is the natural unit.** The multi-concept problem is first a per-screen problem: a busy screen has many handlers.
- **Cross-screen behaviour is invisible** to a per-screen zoom: switching screens, start values, shared storage.
- **Names are per screen.** Component names and globals are scoped to a screen.
- **The plugin depends on Blockly JSON serialisation** (`Blockly.serialization.workspaces.save`/`load`). Whether App Inventor's Blockly version supports it is a prerequisite question **(to verify)**.

A whole-app view would add a level above the screens. Three options, in order of reuse:

| Option                          | Idea                                                                                                                                            | Risks and questions                                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| A. Compose from screen concepts | Zoom each screen separately; generate an app-level node from the per-screen Concept levels plus a deterministic list of screens and components. | Can the plugin read other screens' blocks without opening them? Staleness when a screen changes.                       |
| B. Merged read-only workspace   | Serialise all screens into one workspace (ids and names namespaced by screen) and zoom that.                                                    | Serialisation support; id and name collisions; context size; presenting a workspace that does not exist in the editor. |
| C. Static app map only          | Deterministic summary of screens, components, events and cross-screen calls, with no LLM.                                                       | Cheap and exact but not semantic. Useful as input to A.                                                                |

**Feasibility study (track A, parallel to everything else).** Acceptance criteria: (1) the plugin, running in App Inventor, can obtain every screen's blocks in the needed serialisation at a measured cost; (2) the largest realistic projects fit a model context with room for the answer; (3) ids and names can be made unambiguous; (4) a human study rates app-level descriptions above the best per-screen baseline. Recommendation: evaluate A first. It reuses the per-screen pipeline, and in the hierarchical design (phase 2) it is a new root node rather than a new mechanism.

## 5. Phasing: the principle, the map, and what phase 0 buys

### 5.1 The principle

A change belongs in **phase 0** if either:

- **(defect)** the current behaviour is indefensible whatever the data says, and the fix has no plausible downside worth measuring; or
- **(prerequisite)** without it we cannot measure at all, or another phase-0 fix cannot work.

A change belongs in **phase 1** if a reasonable person could argue the old way is better, or if its benefit depends on the model. Those need the baseline. This matters because `v1` changes several things at once, and anything doubtful put into phase 0 becomes a confound that is hard to separate later.

Three rules follow:

1. **Phase 0 adds no new reason to retry.** The set of checks that can fail a response and trigger a retry stays what it is today. New checks (plan coverage, kind validity and agreement, label value leaks, and so on) are computed as metrics on stored outputs, for both prompts, and promoted to blocking in phase 1 only if the baseline shows they matter. Otherwise `v1`'s attempts-per-success would rise for reasons unrelated to the model's quality.
2. **Phase 0 keeps the response contract.** The `{semantic, concept}` shape and `ZoomBlockDefSchema` stay. `kind` is an extra key on block definitions, which the schema already allows, and the shared contracts package gains only constants.
3. **Prompts are immutable once they have produced recorded results.** While `v1` is being developed any edit is fine. Once it has been baselined or deployed, a change creates `v2`. This is what makes results comparable and cache entries trustworthy.

A fourth discipline keeps attribution clean: **minimal diff.** `v1` changes only what the phase-0 items require. The mechanical rules (block definitions, bindings, encoding) stay word for word, even where they could be shorter, because trimming them is a hypothesis (phase 1).

### 5.2 The phases

| Phase | Name                     | Holds                                                                                                                                                                                  | Ends with                                                               |
| ----- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 0a    | Fix set                  | Section 6: registry and `v1`, compact JSON, outline, plan, multi-concept rule, kind and colour, layout, params and truncation, instrumentation, cache key.                             | Tests green, smoke check passed, `v1` frozen.                           |
| 0b    | Harness and baseline     | Corpus, runner, deterministic metrics; run `v0` and `v1` on two or more models.                                                                                                        | Baseline report by model and size tier. Answers H0 and H1.              |
| 1     | Improve from evidence    | Section 7: attribute `v1`'s bundle by ablation; promote checks to blocking; few-shot, retry, two-call, per-model, trimming, bindings, host palette; judge calibration and human study. | A prompt that beats `v1` on human-validated measures by tier and model. |
| 2     | Hierarchy                | Section 8: cluster, zoom per cluster, compose, N levels, incremental re-zoom.                                                                                                          | A prototype that beats the best phase-1 prompt on large programs.       |
| A     | App Inventor feasibility | Section 4.5, parallel from 0b.                                                                                                                                                         | A written feasibility result against four criteria.                     |

### 5.3 Dependencies inside phase 0

```
P0-1 registry ──► P0-2 compact JSON ─┐
                  P0-3 outline ──────┤
                  P0-4 plan ─────────┼──► v1 prompt text ──► P0-10 cache key (id + fingerprint)
                  P0-5 concept rule ─┤
                  P0-6 kind/colour ──┘
P0-5 + P0-7 layout (plugin) ship together: the rule produces several blocks, the plugin must place them.
P0-8 params and truncation, P0-9 instrumentation: independent; both feed the baseline.
```

### 5.4 What phase 0 buys phases 1 and 2

| Phase-0 artefact                       | Phase 1 use                                                                                      | Phase 2 use                                                                                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt registry and ids                | Ablations (`v1-noplan`, `v1-nooutline`), few-shot variants, per-model mapping, all side by side. | Each stage (cluster, zoom, compose) is a prompt object with its own id and parameters.                                                                                                        |
| Outline function                       | Size-aware rules and later size-based example selection. A metric input (size tiers).            | **Stage 1 of the pipeline** (deterministic parse), already built and tested; extended with cluster hints.                                                                                     |
| `plan` (concepts, operations, stacks)  | Coverage and coherence metrics; the basis for two-call generation; optional per-block coverage.  | The seed of the abstraction tree: concept, operation, stack is already three levels. Its schema is designed to be the clustering stage's output (section 6.1, P0-4) so the swap is invisible. |
| `kind` vocabulary and default table    | Kind-agreement metric; host palette override in the plugin; vocabulary review with App Inventor. | Every node of every level carries a kind, so a hierarchy of N levels looks consistent for free.                                                                                               |
| Layout in the plugin                   | Nothing further.                                                                                 | Required: an N-level or drill-down view cannot rely on model-placed coordinates.                                                                                                              |
| Compact JSON, outline                  | Lower cost per request; tier-based token budgets.                                                | Per-cluster inputs stay small only if serialisation is compact.                                                                                                                               |
| Explicit params, caps, truncation      | Per-model parameter experiments start from a controlled baseline.                                | Cluster calls are short, so truncation mostly disappears, but the detection stays.                                                                                                            |
| Per-attempt instrumentation            | Retry and repair analysis from real traffic, and online signals.                                 | Per-node attempt and repair records, so a bad cluster is visible.                                                                                                                             |
| Cache key with prompt id + fingerprint | Safe iteration on prompts in a deployed system.                                                  | Cluster-level cache keys use the same scheme.                                                                                                                                                 |
| Frozen `v0` and `v1`, baseline         | The comparison point for every change.                                                           | The comparison point for the prototype.                                                                                                                                                       |

## 6. Phase 0: the fix set

### 6.1 The items

Each item gives the problem it answers, the change, where it lands, the risk, and what it does later. "Blocking" means it can fail a response and trigger a retry.

#### P0-1. Prompt registry (prerequisite)

- **Problem.** There is one prompt constant, so `v0` and `v1` cannot coexist, runs cannot name the prompt they used, and the cache key cannot tell variants apart (O1, O18).
- **Change.** `apps/llm-proxy/src/zoom/prompts/` with `v0.ts` (the current system text, the current `buildZoomPrompt` and retry suffix, copied verbatim, never edited again), `v1.ts`, and `index.ts` (registry plus `DEFAULT_PROMPT_ID = 'v1'`). Each exports `{ id, system, buildUser, params }`. `buildZoomMessages` takes a prompt id (defaulting to the registry's). `v0` includes its own user-message builder, because the original behaviour includes the pretty-printed JSON and the retry text. A unit test pins `sha256(v0.system)` and the probe fingerprint (P0-10) of `v0` so an accidental edit fails CI. `ZOOM_SYSTEM_PROMPT` and `buildZoomMessages` are re-exported from `zoom.ts` to keep the diff small.
- **Where.** Proxy only. Existing imports in `cache-key.ts` and `zoom.test.ts` are updated.
- **Blocking?** No behaviour change by itself.
- **Risk.** Low. Production starts using `v1` once the rest lands; the registry can ship earlier with `DEFAULT_PROMPT_ID = 'v0'`.

#### P0-2. Compact JSON (defect)

- **Problem.** O8: pretty-printing adds tokens.
- **Change.** `JSON.stringify(workspaceJson)` in `v1`'s user builder. Measure the token difference on the smoke set and record it, but do not gate on it: tokenisers often merge runs of spaces, so the saving is likely smaller than the character count suggests.
- **Where.** `v1.ts`. `v0` keeps the pretty print.
- **Risk.** Negligible. Compactness is tested for non-inferiority later (H10) by running `v1` with pretty printing as an ablation.

#### P0-3. Program outline in the user message (enabler for P0-5)

- **Problem.** O9: the size-aware rule needs the model to know the program's shape, and today it must infer it.
- **Change.** A deterministic function, `describeOutline(canonicalWorkspace)`, using `saved-blocks.ts` (`allBlocks`, `byId`) and the top-level list of `workspaceJson.blocks.blocks`:

  ```
  Program size: 42 blocks, 3 top-level stacks.
  Top-level stacks:
  - b1: component_event, Button1.Click (18 blocks)
  - b19: procedures_defnoreturn, resetGame (9 blocks)
  - b28: global_declaration, score (2 blocks)
  ```

  Each line: canonical id (when the block has one), block type, a short descriptor from the top block's own fields (an event name, a procedure name, a variable name; nothing when it has none), and the number of blocks in the stack. Placed between the slug lines and the JSON. The format is part of the prompt, so changing it creates a new prompt id.

- **Where.** `saved-blocks.ts` or a new `outline.ts`, and `v1.ts`.
- **Risk.** Low. Blocks without an id cannot be named in the plan; they are listed without one.

#### P0-4. `plan`: give the analysis somewhere to go (defect, with a design choice)

- **Problem.** O4: "Step 1" has no output field. There are two resolutions: delete it, or give it a place. Deleting is a pure defect fix. Adding a `plan` is a bet (it costs output tokens and may help weaker models more than reasoning models). It goes into phase 0 anyway because it carries the mapping that coverage metrics, the kind-agreement metric and phase 2 all need, and because it is generated first, so it conditions what follows. It remains a hypothesis (H2) and phase 1 ablates it.
- **Change.** `plan` is the first key of the output:

  ```json
  {
  	"plan": {
  		"purpose": "<one sentence: what the whole program is for>",
  		"concepts": [
  			{
  				"id": "c1",
  				"name": "<short feature name>",
  				"stacks": ["<id of a top-level Detail block>"],
  				"operations": ["s1", "s2"]
  			}
  		]
  	}
  }
  ```

  The shape is deliberately the same as what a clustering stage would produce in phase 2: concepts that own Detail stacks and Semantic operations.

- **What happens to it.** `ZoomResponseSchema` is a plain `z.object`, which drops unknown keys, so the response and the plugin are unchanged. The proxy parses `plan` separately and logs it with the attempt record; the eval runner stores it. Coverage (every top-level stack in exactly one concept, every operation under exactly one concept) is computed as a metric, **not enforced** (rule 1 of section 5.1). A malformed `plan` never causes a retry.
- **Where.** `v1.ts`, a small `plan.ts` for tolerant parsing, the logging in P0-9. Streaming shows the plan first (it is the first key), which could later become a progress line; not in scope.
- **Risk.** Output grows by an estimated few hundred tokens (to measure). A model that ignores the plan costs nothing but tokens.

#### P0-5. Size-aware, multi-concept rule and a neutral skeleton (defect)

- **Problem.** O5, O6, and the single-flow assumption at Semantic (section 4.2).
- **Change.** In `v1`:
  - The Concept rule becomes: one block per distinct feature or responsibility; one concept for a single-purpose program or a single top-level stack; otherwise group stacks by responsibility, usually 2 to 7 concept blocks; never merge unrelated responsibilities only to reduce the count; never split one stack into several concepts; concept blocks are independent and need not connect; every top-level stack belongs to exactly one concept; do not set `x` or `y`.
  - The Semantic rule gains: keep the operations of one Detail stack together in one stack of zoom blocks, in program order; a program with several top-level stacks yields several stacks; do not set `x` or `y`.
  - The output skeleton shows two entries per list with an explicit "as many as the program needs", so it no longer models "one block". The binding example is kept.
  - The Concept block type becomes `zoom_<snake_slug>_<name>_concept`, because several concepts need distinct types (the loader registers types globally, O16).
- **Where.** `v1.ts`. No validator changes: the count and structure are not blocking (rule 1).
- **Risk.** Without the outline (P0-3), the "2 to 7" guidance would be guesswork. A model may over-fragment; the baseline measures concept count against size (D14), and the numbers are provisional.

#### P0-6. `kind` and derived colour (defect)

- **Problem.** O7 and section 4.3.
- **Change.**
  - `v1` drops "Colour: 30 for all zoom blocks", adds the `kind` rule with the vocabulary of Appendix E, and tells the model not to set `colour`.
  - `packages/llm-proxy-contracts` gains constants: `ZOOM_KINDS` and `DEFAULT_KIND_COLOURS` (additive; schemas unchanged, so the plugin and proxy stay compatible).
  - The proxy applies, after `repairZoomResult` and before validation, a deterministic step: for each block definition with a valid `kind`, set `colour` from the table; for a missing or unknown `kind`, repair it to `other` and record the repair (a degrade, not a retry). A `colour` the model set anyway is overwritten when a `kind` is present. Results from `v0` have no `kind`, are untouched, and cached `v0` entries load as before.
  - `kind` remains in the definition, so a later phase can override colours in the plugin per host. Blockly's handling of an unknown definition key must be confirmed in a short spike **(to verify; the plugin's mocha tests can check that `jsonInit` tolerates it)**. If it warns, the proxy strips `kind` after deriving the colour in phase 0 and a side field carries it later.
- **Where.** `v1.ts`, contracts constants, `repair.ts` (or a sibling step), the zoom route's parse path.
- **Blocking?** No.
- **Risk.** Low. The default hues are placeholders to be reviewed with App Inventor (Appendix E).

#### P0-7. Layout in the plugin (prerequisite of P0-5)

- **Problem.** O17: multiple top-level blocks and no layout step.
- **Change.** After loading a level, the plugin calls `cleanUp()` on the view workspace (Blockly 13.4 has `WorkspaceSvg.cleanUp()`, and `getTopBlocks(ordered)` sorts by position top to bottom), so every top-level block is stacked without overlap regardless of what coordinates, if any, the model gave. With no coordinates, ties are expected to keep the JSON order because the sort is stable **(to verify in a plugin test)**; the prompt asks for blocks in reading order for that reason. The model stops emitting `x` and `y`, which also saves tokens and removes a failure class.
- **Where.** `apps/blockly-szrs/src/zoom_view.ts` or the loader, one call plus a mocha test in the existing test style.
- **Risk.** `v0` results loaded from the cache are re-laid-out as well, a minor visual change. The plugin must ship with, or before, the proxy change; an old plugin with a `v1` proxy would overlap blocks. The plugin is hosted in the dashboard's demo runner, so they deploy together.

#### P0-8. Explicit parameters, an output cap and truncation detection (prerequisite and defect)

- **Problem.** O2. A baseline cannot be reproduced if sampling floats at provider defaults, and a truncated response is reported as a parse error.
- **Change.**
  - The prompt object's `params` carries `temperature` and `maxTokens`, passed on every zoom call (the chat contract already accepts both). The baseline uses one fixed set for both prompts, recorded per run: a low fixed temperature (proposal: 0.2) and an explicit cap. `v0` runs under the same shared parameters in the baseline, not "unset", because unset is not reproducible across providers; production behaviour of the original is not a condition worth running. Providers that reject `temperature` get it dropped, with the choice recorded per model **(to verify LiteLLM's behaviour)**.
  - The cap needs a short per-alias spike: what each model supports, and what size is enough for a plan plus two levels. Too large a request can itself be rejected by a provider with a lower output limit.
  - `finishReason` is captured on the streaming path (the parser currently yields only text), and the zoom loops treat `length` as a distinct failure with a clear message ("output was cut off at N tokens") and **no retry**, since a retry of the same request truncates the same way. The error uses the existing `invalid_model_output` code; no new contract code.
- **Where.** `lib/litellm.ts` (stream parser), `routes/zoom.ts`, the prompt objects.
- **Risk.** A cap that is too small turns working outputs into failures; too large may be rejected. Hence the spike.

#### P0-9. Per-attempt instrumentation (prerequisite)

- **Problem.** O11: attempts, repairs and token use are invisible in aggregate.
- **Change.** One structured log record per attempt: prompt id, model alias, attempt number, finish reason, token usage, repair kinds, error class (parse, schema, validation, truncation), outline size and latency. The prompt id is also sent as trace metadata to LiteLLM so Langfuse traces can be filtered by prompt version **(to verify the metadata path)**. Optionally the plugin's info line can show the prompt id for demo-runner comparisons, which needs a small stream-event field and is not required. Token usage on the streaming path may need LiteLLM's usage-in-stream option **(to verify)**; otherwise Langfuse is the source.
- **Where.** `routes/zoom.ts`, `lib/litellm.ts`.
- **Risk.** None for behaviour.

#### P0-10. Cache key with prompt id and a content fingerprint (prerequisite)

- **Problem.** O18.
- **Change.** The key replaces the single prompt hash by `promptId` plus a **fingerprint** of the prompt object: `sha256` of the system text plus the user message built for a fixed probe workspace (with and without a retry error). This catches edits to either the system text or the user template without relying on anyone bumping a string. Together with rule 3 (immutability) it makes cache entries trustworthy. `KEY_VERSION` stays for changes that are not in a prompt (repair or validation rules, and now the colour table).
- **Where.** `zoom/cache-key.ts`.
- **Risk.** The first zoom of every program after deploy is a miss, as with any prompt change.

### 6.2 Deliberately not in phase 0

| Candidate                                                                                                                              | Why it waits                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Few-shot examples                                                                                                                      | A bet with a token cost on every call; its value depends on the model (H3).                                                       |
| Two-call generation (Concept from Semantic)                                                                                            | A latency and cost trade-off (H4); uses the plan, so it needs the plan's baseline first.                                          |
| Per-model prompts, structured outputs                                                                                                  | Hypotheses (H7); the registry makes them cheap later.                                                                             |
| Retry with the previous output as an assistant turn                                                                                    | Probably a win, but it moves attempts-per-success, which phase 0 wants comparable.                                                |
| Blocking checks: plan coverage, concept bounds, Level 3 "only zoom blocks", unique ids, label value leaks, naming, binding consistency | Each could be right, and each adds failures that change retry rates. Measure first (rule 1), promote what the baseline justifies. |
| Trimming the mechanical rules or the redundant `field_image` line                                                                      | Removing a rule may raise error rates for weaker models; it is an ablation (H11).                                                 |
| Surfacing `plan` in the response; per-block coverage                                                                                   | A contract change with a product decision attached; phase 1 if the plugin needs it.                                               |
| Host palette override in the plugin                                                                                                    | Needs the App Inventor palette and a plugin option; defaults in the proxy are enough to be correct for core Blockly now.          |
| More bindable field types (checkbox, colour, component)                                                                                | Contract, validator, loader and editor changes (O14); important for App Inventor, but a feature, not a defect.                    |
| Per-level (lazy) requests, N levels, drill-down                                                                                        | Contract and cache changes; phase 2.                                                                                              |

### 6.3 How `v1` is built: the diff against `v0`

`v1` is `v0` plus exactly these changes. Appendix A shows the full text of each changed section and marks the rest as unchanged.

| Section                       | `v0`                                                      | `v1`                                                                                                        | Item         |
| ----------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------ |
| User message                  | Slug lines + pretty JSON                                  | Slug lines + outline + compact JSON                                                                         | P0-2, P0-3   |
| Output format                 | `semantic`, `concept`; one block each; `colour`; `x`, `y` | `plan`, `semantic`, `concept`; two-entry skeleton with "as many as needed"; `kind`, no `colour`, no `x`/`y` | P0-4 to P0-7 |
| Step 1                        | "Analyse" with no output field                            | "Plan": describes the `plan` field                                                                          | P0-4         |
| Level 2 rules                 | One block per operation; colour 30                        | Same; adds `kind`; several stacks for several Detail stacks; no `x`/`y`                                     | P0-5, P0-6   |
| Level 3 rules                 | "Usually ONE block"; one type `zoom_<slug>_concept`       | Size-aware multi-concept rule; independent blocks; type `zoom_<slug>_<name>_concept`                        | P0-5         |
| Colour and kinds              | Colour 30 stated in the Level 2 rules                     | New "Block kinds" section; the Level 2 rules carry the `kind` line and "do not set `colour`"                | P0-6         |
| Binding rules, encoding rules | —                                                         | Unchanged                                                                                                   | —            |
| Parameters                    | None passed                                               | Shared fixed `temperature` and `maxTokens`                                                                  | P0-8         |

### 6.4 Compatibility and rollout

- **Old cached results** (`v0`, no `kind`, with `x`/`y`) load as before; the new layout step re-arranges them. A flush is unnecessary because keys include the prompt id.
- **Deploy order.** Plugin (layout) first or together with the proxy.
- **Contracts.** Constants only. The proxy's response shape is unchanged, so older plugin versions keep working apart from layout.
- **Dashboard.** No dashboard change is required; its forwarders are unaffected. If a dashboard change is added later (for example showing the prompt id in the demo runner), the dashboard's own rules apply, including Playwright e2e for new features.
- **Local development.** Unaffected by the cache. A developer's proxy with `CACHE_URL` unset simply does not cache.

### 6.5 Tests

Tests live next to the code, as the repository requires. Proxy:

- The registry resolves ids; an unknown id is an error; `DEFAULT_PROMPT_ID` is a registered id.
- `v0`'s system text and fingerprint are pinned.
- `v1.buildUser` is compact, contains the outline, and appends the retry text on retry.
- `describeOutline` on fixtures: a single stack, several stacks, blocks without ids, nested handlers.
- The kind step: valid kinds set the colour; missing and unknown kinds are repaired to `other`; a model-set `colour` is overwritten; a result without any kind is left alone.
- `plan` parsing is tolerant: absent, malformed and partial plans never throw.
- The cache key differs across prompt ids and across fingerprint changes, and ignores layout-only differences as before.
- Truncation: a `length` finish reason on both the plain and streaming paths fails without a retry and with the clear message. Parameters are passed through to LiteLLM.

Plugin (mocha, as in `test/zoom_level_loader.mocha.js`): a level with several top-level blocks and no coordinates loads without overlap; a definition with an extra `kind` key loads; a level from `v0` still loads.

### 6.6 The smoke check and the exit criteria for 0a

A small by-eye check, not an evaluation: five programs run in the dashboard's demo runner on at least two models.

1. FizzBuzz (one concept expected).
2. A countdown with a bound number.
3. A three-handler app (dice roll, score, reset): expect three concepts, laid out without overlap.
4. A program with a procedure and an event that calls it: expect distinct kinds and colours.
5. A program with one value repeated in several Detail blocks (the multi-reference binding).

Checks: every level loads in Blockly; concept count is sensible; blocks do not overlap; colours follow kind; bindings edit the right Detail values; the token count of the input before and after (P0-2, P0-3); the plan appears first and is plausible.

**Exit criteria for 0a:** unit and mocha tests green (`pnpm test` equivalent in CI, including `pnpm format:check`); the smoke check passes on two models; the cap and parameter spike is written down per alias; `v1` is frozen (any later change is `v2`); `DEFAULT_PROMPT_ID` is switched to `v1` only when the plugin change is deployed with it.

### 6.7 Phase 0b: the baseline

With 0a done, 0b builds the harness (section 9.10) and a first corpus (section 9.2), runs `v0` and `v1` on two or more models under the same parameters, scores the stored outputs with the deterministic metrics (those that apply to both, section 9.4) and a light judge pass, and has a few people skim the outputs side by side. Its question is H0 (does the original have failures that small programs hide?) and H1 (is `v1` better than `v0`?). Its output is the report that phase 1's decisions rest on. Because outputs are stored raw, later validators can be applied to `v0` and `v1` outputs without new model calls.

## 7. Phase 1: improve from evidence

Phase 1 starts after the baseline. Compared to the first version of this document, several items moved out (the Concept rule, the plan, colour, layout, params, instrumentation, the registry are now in phase 0), and the first job is new.

### 7.1 Attribute `v1`'s effect (ablation)

`v1` bundles several changes. If it beats `v0`, we do not yet know which parts matter. Because the registry makes variants cheap, run: `v1-noplan` (no `plan`), `v1-nooutline` (no outline), `v1-pretty` (pretty JSON), and, where the baseline suggests, kind-only versus plan-only. Each is a separate prompt id. Measures: the same deterministic and judge metrics, by tier and model. Decisions: keep, drop or move each component per model. This is H1a, H1b, H2 and H10.

### 7.2 Promote checks to blocking, by data

For every check that phase 0 only recorded, the baseline gives a failure rate by model and tier. A check becomes blocking (and so can trigger a retry with a specific message) when it is a correctness problem, or when its failure rate is high enough that retrying is cheaper than shipping a bad zoom. Candidates and their rationale:

| Check                                                                     | Likely rationale                                                     |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Plan coverage and exact assignment                                        | Silent omission of a handler is a fidelity failure.                  |
| Concept count bounds (at least 1, at most the number of top-level stacks) | Catches degenerate levels; upper bounds are softer.                  |
| Level 3 uses only `zoom_` blocks; type naming; unique ids                 | Stated in the prompt and unchecked; duplicate ids hide bad bindings. |
| Labels without literal values (F7)                                        | A label like "repeat up to 10" goes stale on the first edit.         |
| Binding consistency (O13)                                                 | The first edit silently overwrites other references.                 |
| Kind validity                                                             | Currently repaired to `other`; promote only if repairs are frequent. |

### 7.3 Improvements that were always hypotheses

| Item                           | What and why                                                                                                                                                                                                 | Hypothesis |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| Few-shot examples              | Two or three worked examples: a one-concept program, a three-handler app, a program with a repeated value. Selected by program size (the outline supplies it). Targets the mistakes `repair.ts` fixes today. | H3         |
| Retry with the previous output | Send the failed output as an assistant turn, then the errors, asking to fix only those; better parse errors with position and surrounding text.                                                              | H12        |
| One call or two                | One call with plan (`v1`), or Semantic first and Concept generated from Semantic and the plan. The plan makes the second call small and keeps coherence by construction.                                     | H4         |
| Per-model prompts and params   | The seam is the registry: map a model alias to a prompt id and parameters; test structured output modes where supported; reasoning-model differences.                                                        | H7         |
| Trimming                       | Ablate the mechanical rules the code already enforces (including the redundant `field_image` line). Fewer tokens, possibly worse weak-model validity.                                                        | H11        |
| Host palette override          | A plugin option mapping kinds to the host's colours (App Inventor's palette, a Blockly theme, dark mode), using the `kind` already in the definitions. Needs the App Inventor palette and vocabulary review. | H9         |
| Kind agreement                 | Check each zoom block's kind against the Detail blocks it covers (from the plan) using a deterministic table of block type to kind. A metric first, a validator later.                                       | H9         |
| Bindable field types           | Extend `ZOOM_EDITABLE_FIELD_TYPES` to checkbox, colour and component dropdown fields; contract, validator, loader and editor change. Important for App Inventor.                                             | H13        |
| Surfacing the plan             | Return `plan` (or per-block coverage) to the plugin if the product wants tooltips or drill-down; a contract change with `restoreIds` extended to plan ids.                                                   | H14        |
| Lazy per-level requests        | Ask only for the level the user opens. A cost question that changes the contract and the cache; decided with phase 2's shape in mind.                                                                        | H15        |

### 7.4 Judge calibration and the human study

The first human study (section 9.7) belongs here: it decides the questions no automatic metric can, such as how many concepts feel right and whether colour-by-kind helps. It also calibrates the judge (section 9.8), after which cheap judged regression runs are trusted only for dimensions with adequate agreement.

### 7.5 Exit

A prompt, per model, that beats `v1` on human-validated measures by size tier, with the checks that matter blocking and the rest recorded. Phase 1 results also set the size threshold below which the one-call path stays preferable to phase 2 (section 8.4).

## 8. Phase 2: hierarchy

A single call for a whole program degrades as programs grow. Output length and latency grow with the program, the model must hold everything in view to group it, and one bad part fails the whole result. Phase 2 changes the structure.

### 8.1 The tree of abstractions

Leaves are Detail stacks; internal nodes describe their children. Level 0 is Detail, level 1 is Semantic (an operation: one or more consecutive blocks or a handler body), and higher levels group the level below, recursively, until the top has a glanceable number of nodes (about seven). Depth adapts to size: FizzBuzz has one grouping level; a multi-handler screen has features containing operations; a whole project adds a root above screens (section 4.5). Phase 0 already produces three levels of this tree in miniature: `plan.concepts` own `operations`, which own `stacks`.

### 8.2 Pipeline, and which stage already exists

| Stage                 | How                                                                                                                               | Status after phase 0                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1. Parse              | Deterministic: top-level stacks, handlers, procedures, globals, components used, sizes.                                           | **Built** as `describeOutline` (P0-3); extend with sizes, shared-variable hints and called procedures. |
| 2. Cluster            | Partition stacks into concepts: deterministic hints plus an LLM call to name and merge, from the outline rather than the program. | The `plan` schema (P0-4) is this stage's output format; today it is produced inside the big call.      |
| 3. Zoom each cluster  | One call per cluster: its Detail stacks in, its Semantic blocks and bindings out. Parallel; cacheable by cluster content hash.    | Uses the registry (a prompt per stage), compact JSON and the kind vocabulary.                          |
| 4. Compose            | Build each higher level from the one below, from labels and kinds rather than blocks.                                             | Kind vocabulary and layout already in place.                                                           |
| 5. Assemble and check | Merge nodes, run validators (coverage, uniqueness, binding integrity), repair per node, retry only the failing node.              | Validators promoted in phase 1; per-attempt records (P0-9) become per-node.                            |

Consequences: incremental re-zoom (editing one handler re-zooms one cluster and its ancestors; today any structural edit changes the whole-workspace key), parallelism and per-node streaming, no size ceiling from the context window, and a different model per stage.

### 8.3 Contract and plugin

Today `ZoomResponse` is `{semantic, concept}` and the plugin's `ZoomLevel` is `'detail' | 'semantic' | 'concept'`.

| Shape                   | Contract                                                                                | Plugin                                                                 | When                                           |
| ----------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------- |
| A. N levels             | `levels: ZoomLevel[]` ordered from Detail upwards, each a flat set of top-level blocks. | The level control gets N stops; `ZoomView.show` stays per level.       | First. Smallest change that removes the pair.  |
| B. Tree with drill-down | Nodes with `children` and `covers` (Detail ids); a view shows a chosen frontier.        | Expand and collapse a concept into its children; mixed levels at once. | Later. Needs unique types across levels (O16). |

Compatibility: keep `semantic` and `concept` as aliases for the second and last levels of shape A. Streaming events gain a node id and a partial result. Layout in the plugin (P0-7) is already there; drill-down additionally needs a policy for what clicking a concept does, since zoomed blocks are read-only today (O15).

### 8.4 Cost and latency (to measure, not assume)

| Quantity               | Phase 1 (one call)       | Phase 2 (clusters)                     |
| ---------------------- | ------------------------ | -------------------------------------- |
| Output tokens per call | O(program), both levels  | O(cluster)                             |
| Wall-clock             | Grows with output length | About the slowest cluster plus compose |
| Cost of a local edit   | The whole call           | One cluster and its ancestors          |
| Cost of a retry        | The whole call           | One node                               |
| Number of calls        | 1 to 3                   | Clusters plus composes: more, smaller  |

Phase 2 pays off only if it improves quality or latency on large programs (H5). On small programs it is probably slower and dearer, so it falls back to the phase-1 path below a size threshold chosen from data.

### 8.5 Migration

1. `v0` and `v1` baseline, then phase 1 (above).
2. Prototype the pipeline behind a flag or a separate route producing shape A, keeping `/v1/zoom` and `/v1/zoom/stream` for current clients.
3. Choose shape B and the App Inventor whole-app option from the studies.

## 9. Evaluation framework

### 9.1 Principles

- **Evaluate before changing,** and compare every later claim with a baseline. The first comparison is `v0` and `v1`.
- **Freeze, version and record.** Corpus, prompt ids, model aliases, parameters, judge prompt and rubric are versioned. Every run stores the raw text of every attempt, so metrics can be recomputed when a validator changes and `v0` outputs can be scored by checks that did not exist when they were made.
- **Report by model and by size tier,** never one average.
- **Quality, cost and latency together:** attempts, repairs, tokens, dollars and wall-clock next to quality.
- **Cheap everywhere, expensive on demand:** deterministic checks on every change; judged runs on demand or nightly; the human study per major decision.
- **No test-set tuning:** a hold-out set that prompt authors do not see.
- **Common-subset comparisons.** Some metrics need fields only `v1` produces (plan, kind). Comparisons between `v0` and `v1` use the metrics both can be scored on; the extra ones describe `v1` and later prompts (section 9.4, column "v0").

### 9.2 Corpus

| Tier | Size (blocks)   | Source                                                                                    | Purpose                                                  |
| ---- | --------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| S    | about 5 to 15   | Hand-written teaching programs (FizzBuzz, countdown, sum of a list, greeting).            | Fidelity and binding basics; where one concept is right. |
| M    | about 20 to 60  | Hand-written plus simplified real examples: games, calculators, quizzes.                  | Multi-operation Semantic; first multi-concept cases.     |
| L    | about 60 to 200 | App Inventor screens from tutorials and sample projects (check licences **(to verify)**). | The target regime for one screen.                        |
| XL   | 200 and above   | The largest real screens available.                                                       | Scaling and context limits.                              |
| XXL  | whole apps      | Only if section 4.5's study finds it feasible.                                            | App-level node.                                          |

Construction:

- **Synthetic compositions:** concatenate k independent small programs; the expected concept count is at least k, with no annotation needed.
- **Mutations** for the metamorphic tests (section 9.5).
- **Golden annotations** on about 30 programs balanced by tier: an acceptable concept-count range, values that must be bound, behaviours that must be mentioned, and the expected kind of each top-level stack. Annotate where it will be used.
- **A hold-out third,** hidden from prompt iteration.
- **Provenance and privacy:** record the origin of every program; no student projects without consent.

Starting size: 40 to 60 programs across tiers is enough for the deterministic suite and a first human study; stability needs k = 5 runs per program, prompt and model. A first pass for 0b can be 20 programs.

### 9.3 Failure taxonomy

One vocabulary for automated tags, judge output and human flags:

| Code | Failure                   | Example                                                               |
| ---- | ------------------------- | --------------------------------------------------------------------- |
| F1   | Hallucinated behaviour    | A concept says "saves the score" where nothing saves anything.        |
| F2   | Omission                  | A handler is absent from every level.                                 |
| F3   | Over-compression          | Ten behaviours merged into one vague block.                           |
| F4   | Under-compression         | Semantic is a re-drawing of Detail.                                   |
| F5   | Wrong grouping            | Unrelated handlers in one concept; one feature split across two.      |
| F6   | Misleading or vague label | "Do the thing".                                                       |
| F7   | Value leak in a label     | "Repeat up to 10".                                                    |
| F8   | Missing or wrong binding  | The limit is not exposed, or editing it changes the wrong block.      |
| F9   | Levels incoherent         | Concept does not summarise Semantic.                                  |
| F10  | Structural failure        | Does not load; invalid JSON; truncated.                               |
| F11  | Redundant levels          | Semantic and Concept are essentially the same.                        |
| F12  | Wrong count of concepts   | One for a ten-handler app; seven for FizzBuzz.                        |
| F13  | Wrong kind or colour      | A procedure summary shown as an event; kind unrelated to its content. |
| F14  | Layout failure            | Blocks overlap or are off screen after loading.                       |

### 9.4 Automated evals, deterministic

All computed from stored outputs, so they re-run when a validator changes. "v0" says whether the metric can score a `v0` output (it needs no `plan`, no `kind`).

| ID  | Metric                       | How it is computed                                                                                                                                                       | Level   | v0  | Provisional target    |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | --- | --------------------- |
| D1  | Schema validity rate         | Fraction whose final output passes `ZoomResponseSchema` and `checkZoomResult`.                                                                                           | both    | yes | at least 99%          |
| D2  | First-attempt validity       | Fraction valid on attempt 1, before repair and retry.                                                                                                                    | both    | yes | track, raise          |
| D3  | Attempts per success         | Mean attempt number of the success.                                                                                                                                      | both    | yes | at most 1.2           |
| D4  | Repair rate by type          | `repairs` per run, grouped by kind (including the new kind repair).                                                                                                      | both    | yes | falling               |
| D5  | Loadability                  | Load `blockDefs` and `workspaceJson` into a real Blockly workspace as `ZoomLevelLoader.load` does.                                                                       | both    | yes | 100% of valid outputs |
| D6  | Binding validity             | Binding targets exist and have a compatible kind (as in `validate.ts`), reported as a rate.                                                                              | both    | yes | 100%                  |
| D7  | Binding round trip           | Programmatically edit each bound field; check the intended Detail fields changed, nothing else did, and Detail still loads.                                              | both    | yes | 100%                  |
| D8  | Binding consistency          | Multi-reference bindings whose references initially hold the same value (O13).                                                                                           | both    | yes | 100%                  |
| D9  | Binding recall (golden)      | Fraction of annotated "must be exposed" values reached by some binding.                                                                                                  | both    | yes | at least 80%          |
| D10 | Binding precision (golden)   | Fraction of bindings on values a person marked as sensible to expose.                                                                                                    | both    | yes | at least 90%          |
| D11 | Coverage                     | From `plan`: fraction of top-level Detail stacks in exactly one concept, and of operations under exactly one concept. For `v0`: binding reach only, plus the judge (J6). | concept | no  | 100%                  |
| D12 | Compression ratio            | Blocks in the level divided by Detail blocks.                                                                                                                            | both    | yes | report                |
| D13 | Monotonicity                 | Detail > Semantic ≥ Concept in blocks, and Concept count ≤ Semantic count.                                                                                               | both    | yes | 100%                  |
| D14 | Concept count versus size    | Concept count against top-level stack count; compared with the golden range and the synthetic k.                                                                         | concept | yes | within golden range   |
| D15 | Synthetic composition recall | Fraction of k-program compositions yielding at least k concepts.                                                                                                         | concept | yes | at least 90%          |
| D16 | Naming and style rules       | `zoom_<slug>_` prefix, snake case, Concept suffix, unique ids.                                                                                                           | both    | yes | 100%                  |
| D17 | Value leak                   | Labels, tooltips and messages containing a literal value present in Detail.                                                                                              | both    | yes | 0                     |
| D18 | Redundancy                   | Similarity of Semantic and Concept (type multiset or label overlap) above a threshold.                                                                                   | both    | yes | low                   |
| D19 | Stability across samples     | k runs: variance of block counts, Jaccard overlap of block types and binding targets, label-set edit distance.                                                           | both    | yes | track                 |
| D20 | Normalisation invariance     | Shuffle ids and positions in Detail (the proxy normalises them); the canonical result should be equivalent (per D19 for a model).                                        | both    | yes | no regression         |
| D21 | Latency, tokens, cost        | Wall-clock, input and output tokens, dollars (Langfuse already records them).                                                                                            | both    | yes | budget per tier       |
| D22 | Cache behaviour              | Hit on identical request; miss on changed prompt id or fingerprint; hit after a layout-only edit.                                                                        | n/a     | yes | as designed           |
| D23 | Kind validity                | Fraction of block definitions with a valid `kind` before repair, and the repair rate to `other`.                                                                         | both    | no  | at least 95% valid    |
| D24 | Kind agreement (golden)      | Kind of each top-level concept or operation against the annotated kind, or against a deterministic table from covered Detail block types (needs the plan).               | both    | no  | at least 85%          |
| D25 | Layout overlap               | After loading in the plugin (with `cleanUp`), the number of overlapping top-level blocks; run in the plugin's browser tests.                                             | both    | yes | 0                     |
| D26 | Truncation rate              | Fraction of attempts ending with `finishReason = length`, by model and tier.                                                                                             | n/a     | yes | 0                     |
| D27 | Prompt size                  | Input tokens by tier for each prompt id (compact JSON and outline effects).                                                                                              | n/a     | yes | report                |

D5, D7 and D25 need a Blockly runtime. Blockly's headless `Workspace` (not the SVG one) should run in Node **(to verify in a short spike)**; D25 needs a rendered workspace and runs in the plugin's mocha tests.

### 9.5 Metamorphic and behavioural evals

Relations between outputs, with no reference answer needed.

| ID  | Transformation of the Detail program | Expected relation                                                                                      |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| M1  | Change a numeric literal             | Same structure; the bound field shows the new value; labels do not contain the old value.              |
| M2  | Rename a variable                    | Same structure; labels that mention it change consistently, or do not mention it.                      |
| M3  | Add an independent handler           | One more operation group and one more concept (or a stated merge); the rest unchanged.                 |
| M4  | Reorder top-level stacks             | Equivalent output.                                                                                     |
| M5  | Compose k independent programs       | At least k concepts, each containing the original's description.                                       |
| M6  | Delete a handler                     | A concept disappears; nothing else is invented.                                                        |
| M7  | Same program, different slug         | Same structure, different type prefixes.                                                               |
| M8  | Change a handler into a procedure    | The corresponding block's kind changes from `event` to `procedure` and nothing else of substance does. |

M3 and M5 directly test the multi-concept goal; M8 tests the kind design.

### 9.6 Automated evals, LLM as judge

A judge is useful where deterministic checks cannot see: fidelity, granularity, label quality. It is biased and must be calibrated against humans (9.8) first.

**Inputs.** Detail in a compact textual form; a rendering of the level (labels, structure, kinds, binding list); for the reference-based variant, the golden annotation. The judge never sees which prompt or model made the output.

| ID  | Judge                            | What it does                                                                                                                                                                    | Notes                                                                                    |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| J1  | Rubric scoring, per level        | 1 to 5 on fidelity, completeness, abstraction, grouping, labels, controls, coherence between levels, kind and colour fit; each with a one-line justification and failure codes. | Same dimensions as the human form so the two compare. Temperature 0.                     |
| J2  | Pairwise preference              | Picks the better of two outputs overall and per dimension; run in both orders; keep only consistent verdicts.                                                                   | Controls position bias. Gives win rates and Bradley-Terry strengths.                     |
| J3  | Claim-level faithfulness         | Decomposes the level into atomic claims and checks each against Detail: supported, unsupported, contradicted.                                                                   | A hallucination rate (F1), in the style of atomic-fact scoring. Costly; use on a sample. |
| J4  | Round-trip description           | A model that sees only the Concept level describes the program; compared with a description made from Detail.                                                                   | Tests whether Concept preserves the gist. Sensitive to the describer; fix it.            |
| J5  | Question-answering probes        | Questions about the Detail program answered from each level alone, scored against answers from Detail, with credit for correct abstention.                                      | Information retained per level; compression-fidelity curves.                             |
| J6  | Coverage judge (reference-based) | Checks which golden behaviours appear in Semantic and Concept.                                                                                                                  | The only coverage measure for `v0`, which has no plan.                                   |
| J7  | Concept-count judge              | Says whether the number and grouping of concepts are reasonable and what it would change.                                                                                       | Qualitative; explains disagreements with D14.                                            |

Controls: a different model family from the generator, at least two judges with their agreement reported, randomised order, hidden identities, fixed temperature and judge-prompt version, bias checks (position, length, self-preference), and hand-checked samples whenever the judge prompt changes. Drafts are in Appendix B.

### 9.7 Human validation: blind side-by-side ratings

The ground truth for "better" and the calibration set for the judge. It also answers design questions that no metric can, such as how many concepts feel right and whether colour by kind helps.

**What a reviewer sees.** For each item: the Detail program in the real Blockly rendering, then two or three candidates labelled A, B, C in random order, each shown in the plugin's own view at Semantic and Concept. No prompt, model, attempt count or kind label is shown. Rendering in the real view matters because layout, colour and shape affect readability. `ZoomSession` is built around an injectable requester function, so a replay requester returning a recorded `ZoomResponse` is a natural way to show stored outputs without calling a model **(to verify how plugin options expose it)**. The dashboard's demo runner already hosts the plugin and could host a rating mode.

**What a reviewer does.**

1. Rates each candidate 1 to 5 per dimension and level: faithful, complete, right level of abstraction, concept grouping (Concept only), labels, controls (exposed values), **colour and kind: can you tell what each block is at a glance?**, useful overall.
2. Picks a preferred candidate (or tie) per level and an overall winner.
3. Flags failure types F1 to F14 and may comment.

A short **task-based probe** complements the ratings for the colour design: "which of these blocks is the event handler?" and "which one resets the score?", measured as accuracy and time, with and without colour by kind. It tests whether colour helps rather than whether it looks nice.

**Design.**

- **Items:** 60 programs (for example 20 S, 20 M, 15 L, 5 XL), 2 to 3 variants each (the baseline and the variants being decided).
- **Assignment:** at least three reviewers per item; variants and presentation order balanced (round robin or Latin square); each reviewer sees a mix of tiers.
- **Reviewers:** teachers, experienced students and novices; record experience; analyse by group; include some who have not seen the project.
- **Quality control:** three warm-up items with known answers (one broken, one good), about 10% repeated items for intra-rater consistency, attention checks.
- **Workload (estimate):** about 5 minutes per item for 2 to 3 candidates; 60 items by 3 raters is 180 item-views, about 15 hours, so six reviewers at about 2.5 hours each.
- **Sample size for a preference:** detecting a 60/40 win rate with 80% power at the 5% level takes about 200 independent comparisons; ratings cluster by program, so plan for more or use a mixed model. A planning estimate, not a guarantee.
- **Analysis:** Bradley-Terry (or Elo) strengths for pairwise outcomes with bootstrap intervals; ordinal or mixed-effects models for ratings (random effects for reviewer and program); Krippendorff's alpha; breakdowns by tier and experience; effect sizes with intervals.
- **Ethics:** reviewer consent; no personal data in programs; ratings stored without names under a reviewer code.

**Tooling sketch.** A rating page in `apps/dashboard` backed by its Postgres (reviewer code, item, variant ids, ratings, flags, comments, timestamps) with CSV and JSON export. Out of scope to build here, and it must follow `apps/dashboard/AGENTS.md`.

### 9.8 Calibrating the judge

1. Run the judge on the items humans rated.
2. Compute agreement per dimension (Spearman or weighted kappa for scores; accuracy and kappa for pairwise verdicts; agreement between judges).
3. Dimensions above a threshold fixed in advance (for example weighted kappa of at least 0.6, provisional) are used for cheap regression runs; the rest are not, or only flag items for human review.
4. Recalibrate when the judge prompt, judge model or output format changes.

### 9.9 Online and product signals

Once deployed, the plugin knows several useful events without a rating form: a zoom shown, reverted ("Zoom failed") or abandoned within seconds; attempts and cache hits (already in `ZoomInfo`); whether bound fields are edited; whether the user zooms the same program again; an optional thumbs up or down with the prompt id. Attach these as scores to Langfuse traces, and filter by the prompt-version metadata from P0-9, so offline and online measures sit side by side. Do not log program contents without consent.

### 9.10 Gates, and where the harness lives

| Gate                  | When                                        | What it runs                                                                                                               | Blocks a change if                                       |
| --------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Replay (cheap, in CI) | Every pull request                          | Deterministic metrics (D1, D5 to D8, D12 to D13, D16, D17, D23) on a frozen set of recorded model outputs. No model calls. | A validator, repair or colour change breaks a recording. |
| Live deterministic    | On demand and before merging prompt changes | The corpus against chosen models with the candidate prompt; D1 to D27 and M1 to M8.                                        | D1, D3, D5 to D8 regress; stability collapses.           |
| LLM judge             | On demand and nightly                       | J1 and J2 on a sample; J3 and J5 on a smaller one.                                                                         | Win rate against the baseline significantly below 50%.   |
| Human study           | Per major design decision                   | Section 9.7.                                                                                                               | Decision rules in section 10.                            |

The replay gate fits the repository's CI (`.github/workflows/test.yml`; keep `pnpm test` and CI equivalent) because it needs no secrets and no network. Live and judged runs need keys and money, so they stay outside the default `pnpm test`.

**Where the harness lives.** `apps/llm-proxy/evals/`, or a new `apps/evals` package if it grows (it needs Blockly and datasets):

- `corpus/`: programs (JSON), tier, provenance and optional golden annotations.
- The prompt registry itself (P0-1), imported, so evals test exactly what runs in production.
- A runner that, per program, prompt id and model, calls the model through the proxy's chat endpoint or LiteLLM using `buildZoomMessages` and `parseZoomResponse` directly (pure functions), **without the cache**, under the shared parameters, and stores a record (Appendix D).
- Metric modules (deterministic, metamorphic, judge) that read records; a report generator with intervals by model and tier; Langfuse datasets and scores.

Repository conventions apply: license header, exact dependency versions, `pnpm-lock.yaml` committed with any `package.json` change, tests beside code, new env variables in `turbo.json` `globalPassThroughEnv` and CI placeholders, secrets only in gitignored `.env` files.

## 10. Hypotheses and experiments

Each is stated so it can be rejected. Variants run on the same corpus with at least two models of different strength. Decision rules are provisional.

| ID  | Hypothesis                                                                                                        | Variants                                             | Primary measures                                    | Decision rule                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| H0  | The original prompt has failures on M, L and XL programs that S programs hide.                                    | `v0` only.                                           | D1 to D4, D14, J1, human ratings by tier.           | Establishes the problem; if absent, phase 1 is lower priority.                        |
| H1  | The phase-0 bundle (`v1`) is rated better than `v0`, mostly for grouping and abstraction, without lower fidelity. | `v0` against `v1`.                                   | Human preference, J1, D14, D15, F12 rate, fidelity. | Win rate above 50% with the interval excluding it on M and above; fidelity not lower. |
| H1a | The outline accounts for part of H1 (size-aware concept counts).                                                  | `v1` against `v1-nooutline`.                         | D14, D15, F12.                                      | Concept count tracks size better with the outline.                                    |
| H1b | Kind-derived colour improves recognition of what a block is, and perceived readability.                           | `v1` against `v1` with a flat colour.                | Task accuracy and time, readability rating, F13.    | Higher accuracy or speed, no lower readability.                                       |
| H2  | The plan improves coverage and coherence at acceptable token cost.                                                | `v1` against `v1-noplan`.                            | D11, J1 coherence, F2 and F9, tokens.               | Coverage gain justifies the extra tokens.                                             |
| H3  | Few-shot examples reduce retries and repairs, most for weaker models.                                             | Zero-shot, 1 example, 3 examples.                    | D2 to D4, tokens, J1.                               | Gain on the weakest supported model, no loss on the strongest.                        |
| H4  | Generating Concept from Semantic and the plan improves coherence, at higher latency.                              | One call, two calls.                                 | J1 coherence, F9, F11, latency, cost.               | Coherence gain beyond what the plan gives.                                            |
| H5  | Per-cluster generation scales better in quality and latency than one call on large programs.                      | Best phase-1 prompt, phase-2 prototype.              | D1, D12, D19, J1 by tier, latency, cost per edit.   | Better on L and XL; fall back to one call below a size threshold.                     |
| H6  | The LLM judge agrees with humans well enough to replace them for regression on some dimensions.                   | J1 and J2 against human ratings.                     | Weighted kappa, pairwise agreement.                 | Per-dimension agreement above the preset threshold.                                   |
| H7  | Low temperature and structured outputs improve stability and validity without hurting quality.                    | Shared params, other temperatures, JSON-schema mode. | D1, D2, D19, J1.                                    | Better validity and stability with no quality drop.                                   |
| H8  | A whole-app level is rated more useful than per-screen zooming alone for multi-screen apps.                       | Per-screen only, option A or B.                      | Human ratings on XXL items; feasibility criteria.   | Only if the feasibility study passes.                                                 |
| H9  | A host-palette override and kind agreement checks make colour more trustworthy in App Inventor.                   | Default hues, host palette.                          | D24, human recognition task, F13.                   | Agreement and recognition at least match the default table.                           |
| H10 | Compact JSON does not lower quality.                                                                              | `v1` against `v1-pretty`.                            | J1, D1 to D4 (non-inferiority), tokens.             | No worse beyond a small margin.                                                       |
| H11 | Trimming prompt text the code already enforces saves tokens without raising failures.                             | Full rules, trimmed rules.                           | D1 to D4, tokens, per model.                        | Fewer tokens with no validity loss on the weakest model.                              |
| H12 | Sending the failed output back on retry raises the retry success rate.                                            | Current retry, assistant-turn retry.                 | Retry success rate, attempts per success.           | Higher retry success.                                                                 |
| H13 | Exposing checkbox, colour and component fields improves binding recall on App Inventor programs.                  | Current types, extended types.                       | D9, D10 on App Inventor items.                      | Higher recall without lower precision.                                                |
| H14 | Surfacing the plan helps users (tooltips, drill-down) more than it costs in contract complexity.                  | With and without.                                    | Human task probe, usage signals.                    | Product decision.                                                                     |
| H15 | Asking only for the level the user opens lowers cost without hurting experience.                                  | Both-levels call, per-level calls.                   | Cost, latency, switching delay.                     | Lower cost, tolerable delay.                                                          |

### Related work (pointers to verify before any publication)

- Cognitive Dimensions of Notations (Green and Petre, 1996): the _abstraction gradient_ and _hidden dependencies_ frame what a level should hide and what it must not.
- Program comprehension, top-down and bottom-up (Brooks 1983; Soloway and Ehrlich 1984; Pennington 1987): readers form hypotheses about purpose and verify them in detail.
- Semantic zooming in interfaces (Perlin and Fox, 1993, Pad): different representations at different scales, not geometric scaling.
- Colour coding and categories in visual programming languages, including Blockly's category colours (the Blockly documentation and design guidance, **to locate**).
- LLM-as-judge and its biases (Zheng et al., 2023; Liu et al., 2023, G-Eval); pairwise preference with Elo or Bradley-Terry (Chatbot Arena).
- Faithfulness evaluation of generated text: atomic-claim scoring (FActScore, Min et al., 2023) and question-answering consistency checks (QAGS, Wang et al., 2020).
- Inter-rater reliability: Krippendorff's alpha, Cohen's kappa.

## 11. Roadmap

| Phase | Work                                                                                                                                                                                                                           | Exit criteria                                                                                          | Size | Main risk                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ---- | ------------------------------------------------------- |
| 0a    | P0-1 to P0-10: registry, `v1` (compact JSON, outline, plan, multi-concept rule, kind and colour), plugin layout, params and truncation, instrumentation, cache key; tests; smoke check; cap spike.                             | Tests green; smoke check passed on two models; spike written; `v1` frozen.                             | M    | Plugin and proxy deploy ordering; output cap per model. |
| 0b    | Corpus (20, growing to 40 to 60), golden annotations on a subset, runner, deterministic metrics, headless Blockly spike, replay set for CI; baseline of `v0` and `v1` on two or more models; light judge; informal human skim. | Baseline report by model and tier; H0 and H1 answered; replay gate in CI.                              | M    | Corpus effort; headless Blockly may not work.           |
| 1     | Ablations (7.1); promote checks (7.2); few-shot, retry, two-call, per-model, trimming, host palette, bindings (7.3); judge calibration and the human study (7.4).                                                              | A prompt per model beating `v1` on human-validated measures by tier; blocking checks chosen from data. | L    | Overfitting to the corpus; reviewer recruitment.        |
| 2     | Pipeline prototype behind a flag, shape A, with M1 to M8 and incremental re-zoom.                                                                                                                                              | H5 answered on L and XL; size threshold for the fallback chosen.                                       | L    | Contract and plugin changes; complexity.                |
| A     | App Inventor feasibility (4.5): reading other screens, serialisation, sizes, scoping, option A prototype; palette and vocabulary review for kinds.                                                                             | A written result against the four criteria; H8 if it passes.                                           | M    | Needs access to App Inventor internals.                 |

Phase A can start as soon as 0a lands, since the vocabulary review feeds P0-6's table. Phase 2 should not begin until phase 1's human study has shown what a good multi-concept Concept level looks like, because otherwise phase 2 optimises against an untested target.

## 12. Risks and open questions

### 12.1 Decisions this draft makes that need your confirmation

1. **`kind` from the model, colour derived in the proxy** (P0-6, section 4.3), with the vocabulary and default hues of Appendix E as placeholders. Alternative: derive colour in the plugin from the live Detail blocks.
2. **A small plugin change in phase 0** (layout with `cleanUp`, P0-7), and the model no longer placing blocks. Alternative: prompt-only spacing, which is fragile.
3. **`plan` is internal in phase 0** (logged and scored, not returned or enforced). Alternative: return it now.
4. **No new blocking checks in phase 0.** New checks are metrics first.
5. **Shared fixed `temperature` (proposal 0.2) and an explicit `maxTokens` for both prompts in the baseline,** `v0` included, instead of "unset".
6. **Truncation fails fast without a retry,** on the existing `invalid_model_output` code.
7. **`v1` is frozen once baselined or deployed;** any later change is `v2`.
8. **The `v0` and `v1` comparison measures the bundle;** attribution is phase 1's first job.

### 12.2 Risks

- **Overfitting to a small corpus:** hold-out set, varied sources, fresh programs for each human study.
- **Judge bias and drift:** calibrate against humans, several judges, recalibrate on any change.
- **Cost:** multi-sample, multi-model, judged runs multiply quickly. Tier the gates, sample the expensive judges, cache model outputs in the eval store.
- **Cache churn:** every prompt or template change invalidates production entries. Evals bypass the cache; batch production changes.
- **Contract churn:** phase 2 touches the shared contracts package and the plugin; keep the old shape working during migration.
- **Colour as a false cue:** a wrong `kind` is more misleading than a flat colour. Hence D23, D24 and F13, and the plan to promote kind checks if repairs are frequent.
- **Prompt and code drift:** prefer enforcing a rule in code and keeping the prompt short, after phase 1 trimming data.
- **Scope creep from the App Inventor goal:** keep the whole-app question separate from per-screen quality.

### 12.3 Open questions

1. Who is the intended reader of the Concept level: a learner, a teacher, a maintainer? It changes what good grouping means and who should rate.
2. Which models must be supported, and which is the weakest? It sets how far per-model prompts must go and which models the baseline covers.
3. What is the kind vocabulary for App Inventor? Component method and property blocks, dictionaries, colours and "any component" blocks are not in Appendix E. What are App Inventor's actual category colours?
4. What output cap suits each model alias, and does each accept a fixed `temperature` through LiteLLM?
5. Does Blockly tolerate an unknown `kind` key in a block definition (`jsonInit`)? If not, the proxy strips it in phase 0.
6. Should `plan` eventually be stored and shown to the user?
7. Is a per-level (lazy) request acceptable if it lowers cost, given the contract and cache change?
8. Which App Inventor projects may legally and ethically go into the corpus?
9. Which Blockly version and serialisation does App Inventor's editor use, and does it match what the plugin assumes?
10. `DECISIONS.md` is referenced by the contracts, plugin and proxy but does not exist. Should the decisions it refers to (#8, #10, #11) be written down, since this work depends on them?

## Appendix A: `v1` system and user prompts (draft)

A draft for review, not a tested prompt. Changed text is shown in full. Sections marked **unchanged from `v0`** keep the current wording word for word (section 5.1, minimal diff).

### A.1 User message

```text
Slug: <slug>
Snake slug (use this as prefix in block names): <snake_slug>

Program size: <N> blocks, <M> top-level stacks.
Top-level stacks:
- <id>: <block type>, <short descriptor> (<n> blocks)
- …

Detail workspace JSON:
<compact JSON>
```

On a retry, the `v0` suffix is appended unchanged ("Your previous attempt was invalid: …").

### A.2 System prompt

```text
You are the Semantic Zoom AI. You take a Blockly workspace JSON (the Detail level) and a slug, and describe the same program at two higher levels of abstraction. Your output is only ever displayed: the program always runs from the Detail blocks, so you never write code.

## Output format

Respond with ONLY a valid JSON object — no prose, no markdown fences, no text before or after. Use the keys "plan", "semantic" and "concept", in that order. "..." below means "as many as the program needs".

{
  "plan": {
    "purpose": "<one sentence: what the whole program is for>",
    "concepts": [
      { "id": "c1", "name": "<short feature name>", "stacks": ["<id of a top-level Detail block>", ...], "operations": ["s1", ...] },
      ...
    ]
  },
  "semantic": {
    "blockDefs": [
      { "type": "zoom_slug_op", "kind": "control", "message0": "do something up to %1", "args0": [{ "type": "field_number", "name": "LIMIT", "value": 0 }], "tooltip": "...", "previousStatement": null, "nextStatement": null },
      ...
    ],
    "workspaceJson": { "blocks": { "languageVersion": 0, "blocks": [{ "type": "zoom_slug_op", "id": "s1" }, ...] } },
    "bindings": [
      { "block": "s1", "field": "LIMIT", "detail": [{ "block": "<id of a Detail block>", "field": "NUM" }] }
    ]
  },
  "concept": {
    "blockDefs": [...],
    "workspaceJson": { "blocks": { "languageVersion": 0, "blocks": [...] } },
    "bindings": [...]
  }
}

## Step 1 — Plan

Before writing the levels, fill in "plan":
1. "purpose": what the program is for, in one sentence.
2. "concepts": the distinct features or responsibilities of the program. For each one, the ids of the top-level Detail blocks (listed in the user message) that belong to it, and the ids of the Semantic blocks that describe its operations.
Every top-level Detail block belongs to exactly one concept. Write the levels so that they agree with the plan.

## Level 2 (Semantic) rules

- One zoom block per logical operation (hiding implementation detail)
- Keep the operations of one Detail stack together, in program order, as one stack of zoom blocks. A program with several top-level stacks gives several stacks.
- Block types: zoom_<snake_slug>_<operation_in_snake_case>
  (convert slug hyphens to underscores: fizz-buzz-n → fizz_buzz_n)
- Every block definition has a "kind" (see Block kinds). Do not set "colour"; it is chosen from the kind.
- The workspace may keep structural Blockly primitives (controls_for, controls_if, text_print) where semantically meaningful
- Do not set "x" or "y"; list top-level blocks in reading order.

## Level 3 (Concept) rules

- The Concept level shows what the program is for: one zoom block per distinct feature or responsibility.
- The user message gives the number of blocks and the top-level stacks. Use them to decide how many concept blocks there are:
  - A single-purpose program, or one with a single top-level stack: one concept block.
  - Several top-level stacks: group them by responsibility, usually 2 to 7 concept blocks. Stacks that serve one feature belong to one concept. Never merge unrelated responsibilities only to reduce the count, and never split one stack into several concepts.
- Concept blocks are independent top-level blocks. They do not need to connect to each other.
- Block types: zoom_<snake_slug>_<concept_name_in_snake_case>_concept
- Expose only the most essential value(s) of each concept as fields
- The workspace uses ONLY zoom blocks
- Do not set "x" or "y"

## Block kinds

Every block definition has "kind": the category of what the block stands for. For a block that summarises a stack, use the kind of the top-level block of that stack.
- event: an event handler (something happens, then ...)
- procedure: a procedure or function definition or call
- variable: creating or changing stored values
- control: loops and repetition
- logic: conditions and decisions
- math: calculations
- text: text handling and showing text
- list: working with lists
- other: anything else

## Block definition rules

[unchanged from v0 (the colour instruction lived in the Level 2 rules and is replaced there)]

## Binding rules

[unchanged from v0]

## JSON encoding rules

[unchanged from v0]
```

### A.3 Notes on the draft

- The skeleton uses `...` and an explicit "as many as the program needs" so it no longer models one block.
- The kind definitions are short on purpose. Appendix E has the table with typical Detail block types, and the vocabulary review for App Inventor is open (12.3).
- The `kind` line in Level 2 applies to Level 3 as well through "Every block definition".
- The rules about "usually 2 to 7" and about merging are provisional and tested by H1 and D14.

## Appendix B: Judge prompt (draft, rubric scoring J1)

```text
You are evaluating a "semantic zoom": a higher-level description of a Blockly program, made for learners.

You will be given:
1. DETAIL: the program, as Blockly JSON.
2. LEVEL: either "semantic" or "concept", shown as a list of blocks with their labels, kinds and the values they expose.
3. (optional) GOLD: notes by a person on what a good zoom must contain.

Score each item from 1 (very poor) to 5 (excellent). Justify each in one sentence that points to specific blocks or labels.
- fidelity: says only what the program does; no invented behaviour, no wrong values or conditions.
- completeness: nothing important in the program is missing at this level.
- abstraction: the right level of detail for LEVEL (semantic: operations; concept: features), neither too detailed nor too vague.
- grouping: the number of blocks and how they group the program is sensible.
- labels: clear, specific, consistent, no literal values in them.
- controls: the exposed values are the ones a user would want to change.
- kind: each block's kind matches what it stands for (event handler, procedure, variable, loop, ...).

Then list failure codes that apply: F1 hallucinated behaviour, F2 omission, F3 over-compression, F4 under-compression, F5 wrong grouping, F6 vague label, F7 value in label, F8 missing or wrong binding, F11 redundant with the other level, F12 wrong number of concepts, F13 wrong kind.

Do not reward length. Do not assume a block is correct because it sounds plausible; check it against DETAIL. Return JSON only: {"scores": {...}, "justifications": {...}, "failures": [...]}
```

For pairwise judging (J2), the same dimensions are used with two outputs, shown in both orders in separate calls; only verdicts that agree across orders count.

## Appendix C: Human rating form

Per item, per candidate (A, B, C), per level (Semantic, Concept):

| Field                      | Type                                                 |
| -------------------------- | ---------------------------------------------------- |
| Faithful                   | 1 to 5                                               |
| Complete                   | 1 to 5                                               |
| Right level of abstraction | 1 to 5                                               |
| Concept grouping           | 1 to 5 (Concept level only)                          |
| Labels                     | 1 to 5                                               |
| Controls (exposed values)  | 1 to 5                                               |
| Colour and kind            | 1 to 5: can you tell what each block is at a glance? |
| Useful overall             | 1 to 5                                               |
| Failure flags              | multi-select F1 to F14                               |
| Comment                    | free text, optional                                  |

Per item: preferred candidate at Semantic, preferred at Concept, overall winner (each may be "tie"), confidence (low, medium, high), time spent (recorded automatically). Optional task probe per item: "which block is the event handler?" and "which block does X?", answered by clicking, with accuracy and time recorded. Per reviewer, once: experience with Blockly or App Inventor and role (teacher, student, developer, other).

## Appendix D: Eval record (one per program, prompt, model and sample)

```json
{
	"runId": "2026-11-12-baseline",
	"program": { "id": "m-017", "tier": "M", "blocks": 42, "topLevelStacks": 3 },
	"prompt": { "id": "v1", "fingerprint": "…" },
	"model": { "alias": "openrouter", "params": { "temperature": 0.2, "maxTokens": 8192 } },
	"sample": 1,
	"attempts": [
		{
			"n": 1,
			"rawText": "…",
			"finishReason": "stop",
			"usage": { "promptTokens": 0, "completionTokens": 0 },
			"latencyMs": 0,
			"repairs": [],
			"errors": []
		}
	],
	"plan": { "purpose": "…", "concepts": [] },
	"result": { "semantic": {}, "concept": {} },
	"metrics": { "D1": true, "D3": 1, "D12": { "semantic": 0.3, "concept": 0.05 } },
	"judge": { "J1": { "scores": {}, "failures": [] } },
	"trace": { "langfuseTraceId": "…" }
}
```

Storing the raw text of every attempt, and the finish reason, lets validators and repair rules be re-evaluated later, and `v0` outputs be scored by checks that did not exist when they were produced, without new model calls.

## Appendix E: Kind vocabulary and default colours (placeholders)

The vocabulary is small and closed on purpose. Hues are Blockly colour hues (0 to 360) or a hex string. The values below follow the long-standing core Blockly category hues where core Blockly has a category; the event hue and the grey are proposals. **All to be reviewed against the Blockly version in use and, for App Inventor, its own palette.**

| Kind        | Stands for                                               | Typical Detail blocks (core Blockly; App Inventor **to verify**)                                       | Default colour (placeholder) |
| ----------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------- |
| `event`     | An event handler: something happens, then steps run.     | App Inventor component events and screen initialise; core Blockly has no event category.               | hue 45                       |
| `procedure` | A procedure or function, definition or call.             | `procedures_*`; App Inventor procedure blocks.                                                         | hue 290                      |
| `variable`  | Creating or changing stored values.                      | `variables_*`, `math_change`; App Inventor global and local variable blocks.                           | hue 330                      |
| `control`   | Loops and repetition.                                    | `controls_*` loop blocks.                                                                              | hue 120                      |
| `logic`     | Conditions and decisions.                                | `logic_*`, `controls_if`.                                                                              | hue 210                      |
| `math`      | Calculations.                                            | `math_*`.                                                                                              | hue 230                      |
| `text`      | Text handling and showing text.                          | `text_*`, `text_print`.                                                                                | hue 160                      |
| `list`      | Working with lists.                                      | `lists_*`.                                                                                             | hue 260                      |
| `other`     | Anything else; also the repair value for a missing kind. | Component calls and properties, dictionaries, colours, anything not above, until the vocabulary grows. | grey (`#888888`)             |

Open: whether `component` (calls and property changes on components), `dictionary` and `colour` kinds are needed for App Inventor, and whether `control` should be split (loops versus decisions, which here map to `control` and `logic`). Any change to the vocabulary is a prompt change and so a new prompt id (rule 3), plus a contracts constants change.

## Appendix F: Phase 0 implementation checklist by file

A starting list for the implementation, not a specification.

| Path                                                      | Change                                                                                                           | Item          |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------- |
| `apps/llm-proxy/src/zoom/prompts/{v0,v1,index}.ts`        | New registry; `v0` verbatim and frozen; `v1` per Appendix A                                                      | P0-1 to P0-6  |
| `apps/llm-proxy/src/zoom/zoom.ts`                         | `buildZoomMessages` takes a prompt id; re-export of the old constant; `plan` parse alongside `parseZoomResponse` | P0-1, P0-4    |
| `apps/llm-proxy/src/zoom/saved-blocks.ts` or `outline.ts` | `describeOutline`                                                                                                | P0-3          |
| `apps/llm-proxy/src/zoom/repair.ts` (or a sibling)        | Kind repair to `other`; derive `colour` from `kind`                                                              | P0-6          |
| `apps/llm-proxy/src/zoom/cache-key.ts`                    | Key from prompt id and fingerprint                                                                               | P0-10         |
| `apps/llm-proxy/src/routes/zoom.ts`                       | Pass prompt params; handle `length`; per-attempt records; prompt id as trace metadata                            | P0-8, P0-9    |
| `apps/llm-proxy/src/lib/litellm.ts`                       | Capture `finish_reason` (and usage, if available) on the streaming path                                          | P0-8, P0-9    |
| `packages/llm-proxy-contracts/src/zoom.ts`                | `ZOOM_KINDS`, `DEFAULT_KIND_COLOURS` constants only; schemas unchanged                                           | P0-6          |
| `apps/blockly-szrs/src/zoom_view.ts` (or the loader)      | `cleanUp()` after loading a level                                                                                | P0-7          |
| `apps/blockly-szrs/test/*.mocha.js`                       | Layout without overlap; extra `kind` key loads; `v0` result loads                                                | P0-6, P0-7    |
| `apps/llm-proxy/test/unit/**`                             | Registry, pinned `v0`, outline, kind step, plan tolerance, cache key, truncation, params                         | P0-1 to P0-10 |
| `apps/llm-proxy/README.md`                                | Document prompt ids and the cache-key scheme; fix the stale pnpm version and `DECISIONS.md` reference            | P0-1, P0-10   |
