# Semantic zoom prompts: a phase-0 fix set, then evidence-driven improvement (v2)

Status: **phase 0a is implemented and committed (2026-11-06, branch `feat/fixset`); this document is now the plan for phase 0b and later.** Third version, written 2026-11-05 against branch `feat/plugindemo` and updated in place after phase 0a. It supersedes `prompt_evaluation_and_improvements.md` and `prompt_evaluation_and_improvements_v1.md`, which are left untouched. Section 3 describes the code as it was before phase 0a, sections 4 to 8 and the appendices are the design as proposed, and section 1 and 6.0 say what the implementation changed; the code and `apps/evals/results/` are the source of truth. Statements about the code were checked against the files named beside them. Anything about App Inventor internals, provider behaviour, thresholds or literature that was not checked is marked **(to verify)**.

## 1. Summary

**Where we are.** One static system prompt (`ZOOM_SYSTEM_PROMPT`, `apps/llm-proxy/src/zoom/zoom.ts`) is sent to every model with a user message that holds only the slug and the pretty-printed workspace. It asks for one JSON object with two levels, `semantic` and `concept`, for the whole program in a single call. It tells the model the Concept level is "usually ONE block" and that every zoom block has colour 30. Code around it (repair, schema, validation, three attempts) makes the JSON loadable. Nothing measures whether the abstraction is good.

**The position of this version.** Some defects are indefensible whatever the data says, and some things must exist before anything can be measured. Those form a **phase 0**: a small, deliberate set of changes, made before the baseline, producing a prompt called `v1`. The original is frozen as `v0`, and the baseline compares the two. Everything that is a design bet, where a reasonable person could argue the old way is better, waits for the baseline and goes to phase 1. The hierarchy redesign is phase 2.

**Phase 0 in one paragraph.** A versioned prompt registry (`v0` frozen, `v1`); compact JSON; a deterministic outline of the program in the user message; a `plan` that replaces the dead "Step 1" and stays internal; a size-aware multi-concept rule with a neutral output skeleton; the flat colour 30 constraint removed from the prompt (colour treated properly is phase 1); layout moved out of the model and into the plugin; explicit sampling parameters, an output cap and detection of truncation; per-attempt instrumentation; and a cache key that knows which prompt produced an entry. Phase 0 adds no new reason to retry and keeps the response shape.

**What the later phases get from it.** The outline is phase 2's parse stage. The plan is phase 2's cluster tree in miniature, and the mapping that phase 1's colour derivation will extend. The registry hosts the per-stage prompts of phase 2 and any per-host profile. Section 5.4 lists this in detail, and it is the main reason phase 0 is worth doing first.

**Host-neutral by design.** The plugin is for any Blockly host. App Inventor, where a workspace shows one screen at a time, is the first host we build for and the main driver of the multi-concept problem, so it appears as a case study (section 4.5) and a possible host profile (section 4.6, Appendix E), not as an assumption of the core. Whether a whole-app view is feasible is a separate study, run in parallel.

**Terms used in this document.**

- **Ablation:** taking one part out of a system and re-running the same evaluation, to see how much that part contributed. Here the parts are pieces of a prompt, such as the `plan` or the outline. In plain words, a with-and-without test. An _ablation variant_ is a prompt id with one part removed, for example `v1-noplan`. The `v0` against `v1` comparison is not an ablation: it compares the whole bundle of phase-0 changes. Ablations then split `v1` into its parts to find which ones matter (section 7.1).
- **Baseline:** the measurement of the current system that later changes are compared with. Here it covers `v0` (the original prompt) and `v1` (the phase-0 prompt).
- **Prompt id:** the name of a frozen, versioned prompt, such as `v0`, `v1` or `v1-noplan` (P0-1).
- **Tier:** a size band of programs in the evaluation corpus (S, M, L, XL, XXL; section 9.2).

**Where we are, and where to start (phase 0b).** Phase 0a is done: items P0-1 to P0-10 are implemented, tested and committed (branch `feat/fixset`), `v1` is frozen and is the default prompt, and the spike and the smoke check have run. Section 6.0 says what each item became, and the measurements are in `apps/evals/results/` (`2026-11-06-cap-and-temperature-spike.md` and `2026-11-06-smoke-check.md`, with 29 screenshots). Where this document and the code disagree, the code is right.

**What the implementation changed from the plan** (it matters for what comes next):

1. **Order.** Only the order of blocks inside one stack is real. The order of top-level stacks is the order they were created in (Blockly saves them that way, not by position), so it means nothing. The prompt and the outline now say so, and neither uses "program order" or "reading order" any more.
2. **Layout.** `cleanUp()` runs inside the loader, after a level loads and **before** its blocks are locked, because Blockly's `cleanUp` only moves movable blocks and the loader makes every block immovable. The view is also displayed before the level loads.
3. **Outline.** `describeOutline` has a generic default descriptor and an optional `describeBlock` hook a host can pass; nothing in it knows a block type. The host-profile mechanism itself is still not built.
4. **Output cap.** The shared `maxTokens` is 32768, not 8192. Both models tested reason before they answer, and the reasoning counts against the cap. One glm-5.3-flash zoom used 30,359 tokens (93% of the cap) for a program on which it used 5,856 in another run.
5. **Colour.** P0-6 did what it said, and the smoke check showed what it leaves: every zoom block renders **black**, because no model sets a colour and Blockly draws a block with no colour black. No model invented colours. Left as it is for now.
6. **Instrumentation.** Langfuse shows the tags `zoom` and `zoom-prompt:<id>`, not the metadata field itself. Streams report token usage.
7. **Smaller things.** `v1`'s retry text names the plan (the `v0` text would have told the model to drop it). The cache fingerprint also covers the sampling parameters. The `v1` freeze does not pin the parameters, which are shared with `v0`.

**Where to start phase 0b.**

1. **Decide first** (these change the baseline's conditions): the output cap against glm's outliers, or limits on reasoning per model; whether `temperature` stays in the shared parameters (both models accepted it, but reasoning models may ignore it); and which models the baseline covers. The spike and the smoke check used two OpenRouter models (`deepseek-v4.1-flash-1017` and `glm-5.3-flash`); the weakest supported model is still undecided, and local models were not tried.
2. **Build the harness in `apps/evals/`** (its own package; phase 0a's `apps/llm-proxy/checks/` moved there). It already holds scripts, dated results and a viewer (`pnpm report`) built around rows of model, prompt, size tier and numbers, so the baseline needs a script and an adapter that maps its records (Appendix D) to rows. `zoom()` in `cap-and-temperature-spike.ts` is a working example of what the runner does: it imports the registry, calls `buildZoomMessages` and `parseZoomResponse` directly, bypasses the cache, and the spike also records which model each alias resolves to (`/v1/model/info`).
3. **Corpus.** Start with about 20 programs. The five programs in `apps/dashboard/scripts/smoke-programs.ts` are a first few. Headless Blockly (without a browser, `new Blockly.Workspace()` under `tsx`) loads all five, so the loadability metric D5 can run without one; D7 (the binding round trip) needs fields edited programmatically and is still **(to verify)**. How the plugin could replay a stored result for human rating is also still **(to verify)**.
4. **Use the proxy's log.** Each attempt is logged as one record (prompt id, outcome, finish reason, usage, repairs, program size and the plan), which is enough to compute plan coverage and attempt counts. Plan coverage and label values are measured, not blocking.
5. **Repository rules** (`AGENTS.md`): ask before creating branches or committing; license header on source files; tests next to the code; `pnpm format` before finishing; the plugin and proxy ship together; checks that call models are never in `pnpm test`.

## 2. What changed from the earlier versions

### 2.1 From the first version to v1

- **Phase 0 exists,** between "understand the problem" and "improve the system". It holds defects and prerequisites only, and its output (`v1`) is baselined against the frozen original (`v0`).
- **Colour is category, not identity.** The first version proposed a distinct colour per concept, which treats colour as identification. In Blockly it marks the kind of block.
- **The prompt registry is phase 0,** not a phase 1 detail, because the `v0` versus `v1` comparison cannot run without it.
- **New findings from the code** (section 3): the cache key covers the system prompt text and the request data, but not the code that builds the user message (O18); the streaming path drops `finish_reason`, so truncation is invisible on the path the plugin uses (O2); the plugin has no layout step (O17); the `field_image` rule is redundant but enforced, not a gap (O19, a correction).
- **Phase 1 is organised around ablation (section 1),** and phase 2 explicitly reuses phase 0 (outline, plan, registry, layout).
- **The evaluation framework** separates metrics that apply to `v0` from those that need `v1`'s extra fields.

### 2.2 From v1 to this version

- **Host neutrality.** v1 leaned on App Inventor in several places: a fixed kind vocabulary (`event`, `procedure`, …), a hue table, App Inventor examples in the outline and the corpus tiers. The plugin is general, so App Inventor is now a case study and a possible host profile (sections 4.5 and 4.6), and the core is written in host-neutral terms.
- **Colour waits for phase 1.** The kind vocabulary is gone. The replacement design takes colour from the host's own Detail blocks through the plan (section 4.3), which needs the plan returned to the plugin and a plugin colour step. That is a feature with its own design questions, so phase 0 only removes the flat colour constraint (P0-6) and keeps the plan internal. The full treatment is scheduled in section 7.3.
- **Terms defined.** Section 1 now defines the terms that need it, ablation in particular.
- **Metrics.** D23 and D24 (colour derivation rate, anchor correctness) are phase 1 metrics. F13 is now "misleading colour", which also covers colours a model invents in phase 0. The corpus gains a custom-block-set slice, and H9 a host-neutrality check.
- **Appendix E** is now a sketch of host profiles instead of a kind table.

## 3. How the prompt works today

This section describes the code **before phase 0a** (as of 2026-11-05). The observations O1 to O20 below are the problems the fix set answered; section 6.0 says which item answered which, and what is different now.

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
14. **O14. Bindings can only expose number, text and dropdown fields** (`ZOOM_EDITABLE_FIELD_TYPES`). Checkbox, colour and component fields, common in some hosts such as App Inventor, cannot be exposed.
15. **O15. Zoomed blocks are display-only.** The loader makes them immovable and undeletable and enables only bound fields. There is no drill-down from Concept to Semantic to Detail.
16. **O16. The block registry is global.** `Blockly.common.defineBlocksWithJsonArray` registers types globally and the loader unregisters the previous level's first. Several levels visible at once would need unique types across levels.
17. **O17. The plugin has no layout step.** `ZoomLevelLoader.load` uses the model's `x`/`y`, and `ZoomView.show` only calls `scrollCenter`. With one block per level this never mattered. With several top-level blocks, every one placed at the example's `(20, 20)` would overlap.
18. **O18. The cache key does not cover how the user message is built.** The key is a hash of four things: the model, the slug, the canonical workspace, and `PROMPT_VERSION = sha256(ZOOM_SYSTEM_PROMPT)`. A request is a hit only when all four match. The slug and the workspace are in the key as data, and the system prompt is in it as text. What is not in it is the code that turns that data into the user message: the template wording (`buildZoomPrompt`), how the JSON is rendered, and the retry suffix. Changing any of these changes what the model sees without changing the key, so a change like compact JSON or the outline, which phase 0 makes, would not start a fresh set of cache entries. There is also no prompt id, so two variants cannot coexist.
19. **O19. The `field_image` rule is redundant, not a gap.** The prompt says never to use it; the schema enforces that by leaving it out of the arg-type enum. (The first version of this document called it a mismatch; it is enforced.)
20. **O20. Stale references.** The contracts, plugin and proxy cite `DECISIONS.md` (#7 to #11). It existed on another machine and was never committed, so it cannot be recovered; the root `AGENTS.md` records what the comments imply it said.

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
- **Colour fidelity:** a block looks like what it stands for, with the colour of the host's own block it summarises (section 4.3).
- **Parameter exposure and binding integrity:** the values a user wants to change are bound, and an edit changes exactly the intended Detail fields.
- **Stability:** the same program gives structurally similar output on repeated runs, and a small edit does not reshuffle everything.

### 4.2 Why "usually one block" fails, at both levels

For FizzBuzz, one Concept block ("FizzBuzz up to N") is right. For a program with several entry points it is not: an app with several event handlers, a script with several procedures and shared state, a typical App Inventor screen. Those are separate responsibilities. A reader scanning the Concept level wants a handful of items, not one and not forty. A model told "usually one block" complies even where one is wrong, so the prompt sets the ceiling.

The assumption is wider than the Concept rule. The format example, the Level 2 rules and the layout all imagine **one flow**: one block per level, one stack at Semantic, one position. A multi-handler program has several top-level stacks at every level. Fixing only the Concept sentence would leave the example anchoring a single block, the Semantic level without a rule for several stacks, and the plugin placing several blocks at the same coordinates. Phase 0 fixes these together (P0-3, P0-5, P0-7).

The Concept rule should depend on structure, and the model should be told the structure rather than infer it. Starting hypothesis (to calibrate against human ratings, not assume): one concept for a single-purpose program, otherwise one per distinct responsibility, usually 2 to 7, so that the level stays glanceable (a working-memory motivation, Miller 1956, **to verify** applicability). The numbers are provisional, and the baseline is what tests them.

### 4.3 Colour is category: take it from the host's own blocks

**Phasing.** Phase 0 only removes the flat colour constraint (P0-6). The derivation described here is the phase 1 design (section 7.3). It is written out now because it defines what good looks like, and because the plan's shape (P0-4) was chosen so that it can be extended to this.

In Blockly, colour is semantic. A host's blocks are coloured by category (core Blockly's loops, logic, math, text, lists, variables and procedures; App Inventor's events and component calls; a robotics or data-flow host's own categories), and a reader uses colour to tell what a block is before reading it. A flat colour 30 removes that and makes the two zoomed levels look identical. A distinct colour per concept would be wrong in a different way: colour would then identify instances, not categories.

Colour must also not depend on a vocabulary we maintain. The plugin is general. A fixed list of kinds (event, procedure, variable, …) fits one family of hosts, maps most blocks of any other host to "other", and has to be extended and reviewed for each new host. The one party that always knows what a host's blocks look like is the plugin, which holds the live Detail workspace.

**Design.**

1. The model says what each zoom block _stands for_, not what it looks like. The `plan` (P0-4) already lists each concept's top-level Detail blocks (`stacks`). Phase 1 extends it so that each operation also lists the Detail blocks it stands for (`covers`). The first entry of each list is the anchor.
2. The plan's ids are the ids of the blocks in the levels: concept `c1` is the block `c1` in the concept workspace, operation `s1` is the block `s1` in the semantic workspace. The plugin can map plan entries to zoom blocks with no extra data.
3. After loading a level, the plugin resolves each anchor in the live Detail workspace and gives the zoom block the same look: the anchor's style name if it has one (so theme and dark-mode changes can follow), otherwise its colour. An anchor that does not resolve leaves the neutral default colour, which the proxy sets when the model gives none.
4. The model is told not to set `colour`. Structural Blockly primitives kept in a Semantic workspace (`controls_for`, `controls_if`, `text_print`) keep their own colours, which already match the host's.
5. For mixed content the anchor decides: a concept takes the colour of the first stack it lists, an operation the colour of the first block it covers. This is a convention, tested by D24.

**Why this and not the alternatives.**

| Option                                                                             | Verdict                                                                                                                                                                       |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Closed `kind` vocabulary from the model, colour from a table (v1 of this document) | Host-specific. Fits core-like hosts, maps the rest to "other", and needs maintenance per host. Rejected.                                                                      |
| Per-host kind vocabulary supplied by a profile                                     | Works, but needs a vocabulary written and reviewed per host. Not needed for colour; may still appear in a profile for other reasons.                                          |
| Send each Detail block type's colour to the model, which copies it                 | No mapping in the plugin, but it changes the request contract, makes the cache key depend on the palette, and leaves the choice to the model with only a validator behind it. |
| The model picks hue numbers                                                        | Unverifiable, ignores the host's theme.                                                                                                                                       |
| Neutral colour only                                                                | Smallest scope; keeps the defect.                                                                                                                                             |
| **Plan-driven derivation in the plugin**                                           | **Chosen.** No vocabulary; works with any block set and theme; the model contributes only the mapping the plan needs anyway.                                                  |

**Consequences.**

- In phase 1 the plan becomes part of the response (optional, additive), so the contract gains one field and `restoreIds` extends to the plan's ids. The plan's shape changes (`covers`), so it is a new prompt id.
- The model's mapping must be right. A wrong anchor gives a wrong colour, so anchor correctness is measured (D24), and unresolved ids are counted (D23).
- Colour is not the only cue: labels still describe behaviour.
- Whether `getStyleName`/`setStyle` carry over to the view workspace's theme, or a hex colour must be copied, needs a spike **(to verify)**.

### 4.4 What a multi-concept result looks like

For a dice app with a Roll button, a score counter and a reset, the Concept level is three top-level blocks ("Roll a die and show it", "Keep a running score", "Reset the game"), mostly unconnected, because they are separate event-driven behaviours and not a sequence. In phase 1 their colours come from the Detail handlers they summarise. The Semantic level is several stacks, one per Detail stack, each following its own stack's order of blocks (there is no order between the stacks). The `plan` (P0-4) records which Detail stacks and Semantic blocks each concept covers, which gives the hierarchy explicitly.

### 4.5 A first application: App Inventor, one screen per workspace

App Inventor is the first host we build for, and a useful stress test; it is one host among several possible. There each screen has its own blocks workspace and the user sees one at a time **(to verify, including how blocks are stored and loaded)**.

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

### 4.6 Host neutrality, and what a host profile is

The plugin is for any Blockly host. App Inventor motivates much of this work, but nothing in the core may assume it. Concretely:

- **Generic in the core:** the prompt's concepts (top-level stacks, entry points, procedures, bound fields), the outline, the plan, validation, layout, colour derivation, the corpus tiers and the metrics. Examples in prompts and tests use core Blockly blocks.
- **Host-specific, kept out of the core:** domain notes ("a component event handler is usually a separate feature"), which field types a host wants bindable (checkbox, colour, component dropdown), size guidance, the default prompt and parameters per model, and a corpus slice.
- **Where host specifics live:** a _host profile_. In practice it is a prompt object in the registry (P0-1) plus configuration: a default prompt id and parameters per model, and a short "host notes" block appended to the system prompt. Each profile is a prompt id, so it is versioned, immutable once used, cached separately and evaluated on its own corpus slice. The proxy is already per site, so a site-level default is natural.
- **Phase 0 stance: design for profiles, do not build them.** Phase 0 keeps the core host-neutral and has no profile mechanism; the registry is all it needs. A profile mechanism is built when a second host, or App Inventor's own needs, justify it (phase 1; Appendix E sketches one).
- **A generality test is part of the evals.** The corpus includes programs in a small custom block set with its own categories and colours (section 9.2), and H9 checks that results are as good there as on core Blockly.

## 5. Phasing: the principle, the map, and what phase 0 buys

### 5.1 The principle

A change belongs in **phase 0** if either:

- **(defect)** the current behaviour is indefensible whatever the data says, and the fix has no plausible downside worth measuring; or
- **(prerequisite)** without it we cannot measure at all, or another phase-0 fix cannot work.

A change belongs in **phase 1** if a reasonable person could argue the old way is better, or if its benefit depends on the model. Those need the baseline. This matters because `v1` changes several things at once, and anything doubtful put into phase 0 becomes a confound that is hard to separate later.

Three rules follow:

1. **Phase 0 adds no new reason to retry.** The set of checks that can fail a response and trigger a retry stays what it is today. New checks (plan coverage, label value leaks, and so on) are computed as metrics on stored outputs, for both prompts, and promoted to blocking in phase 1 only if the baseline shows they matter. Otherwise `v1`'s attempts-per-success would rise for reasons unrelated to the model's quality.
2. **Phase 0 keeps the response contract.** The `{semantic, concept}` shape and `ZoomBlockDefSchema` stay. The proxy parses and logs the `plan` but does not return it.
3. **Prompts are immutable once they have produced recorded results.** While `v1` is being developed any edit is fine. Once it has been baselined or deployed, a change creates `v2`. This is what makes results comparable and cache entries trustworthy.

A fourth discipline keeps attribution clean: **minimal diff.** `v1` changes only what the phase-0 items require. The mechanical rules (block definitions, bindings, encoding) stay word for word, even where they could be shorter, because trimming them is a hypothesis (phase 1).

### 5.2 The phases

| Phase | Name                     | Holds                                                                                                                                                                                                                              | Ends with                                                               |
| ----- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 0a    | Fix set                  | Section 6: registry and `v1`, compact JSON, outline, plan (internal), multi-concept rule, flat colour constraint removed, layout, params and truncation, instrumentation, cache key.                                               | Tests green, smoke check passed, `v1` frozen.                           |
| 0b    | Harness and baseline     | Corpus, runner, deterministic metrics; run `v0` and `v1` on two or more models.                                                                                                                                                    | Baseline report by model and size tier. Answers H0 and H1.              |
| 1     | Improve from evidence    | Section 7: ablate `v1`'s bundle to find which parts matter; promote checks to blocking; few-shot, retry, two-call, per-model, trimming, colour from the host's blocks, host profiles, bindings; judge calibration and human study. | A prompt that beats `v1` on human-validated measures by tier and model. |
| 2     | Hierarchy                | Section 8: cluster, zoom per cluster, compose, N levels, incremental re-zoom.                                                                                                                                                      | A prototype that beats the best phase-1 prompt on large programs.       |
| A     | App Inventor feasibility | Section 4.5, parallel from 0b.                                                                                                                                                                                                     | A written feasibility result against four criteria.                     |

### 5.3 Dependencies inside phase 0

```
P0-1 registry ──► P0-2 compact JSON ─┐
                  P0-3 outline ──────┤
                  P0-4 plan ─────────┼──► v1 prompt text ──► P0-10 cache key (id + fingerprint)
                  P0-5 concept rule ─┤
                  P0-6 colour rule ──┘
P0-5 + P0-7 layout (plugin) ship together: the rule produces several blocks, the plugin must place them.
P0-8 params and truncation, P0-9 instrumentation: independent; both feed the baseline.
```

### 5.4 What phase 0 buys phases 1 and 2

| Phase-0 artefact                                | Phase 1 use                                                                                                          | Phase 2 use                                                                                                                                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt registry and ids                         | Ablation variants (`v1-noplan`, `v1-nooutline`), few-shot variants, per-model mapping, all side by side.             | Each stage (cluster, zoom, compose) is a prompt object with its own id and parameters.                                                                                            |
| Outline function                                | Size-aware rules and later size-based example selection. A metric input (size tiers).                                | **Stage 1 of the pipeline** (deterministic parse), already built and tested; extended with cluster hints.                                                                         |
| `plan` (concepts, operations, stacks), internal | Coverage and coherence metrics; the mapping that colour derivation extends (7.3); the basis for two-call generation. | The seed of the abstraction tree: concept, operation, stack is already three levels. Its schema is designed to be the clustering stage's output (P0-4), so the swap is invisible. |
| Layout in the plugin                            | Nothing further.                                                                                                     | Required: an N-level or drill-down view cannot rely on model-placed coordinates.                                                                                                  |
| Compact JSON, outline                           | Lower cost per request; tier-based token budgets.                                                                    | Per-cluster inputs stay small only if serialisation is compact.                                                                                                                   |
| Explicit params, caps, truncation               | Per-model parameter experiments start from a controlled baseline.                                                    | Cluster calls are short, so truncation mostly disappears, but the detection stays.                                                                                                |
| Per-attempt instrumentation                     | Retry and repair analysis from real traffic, and online signals.                                                     | Per-node attempt and repair records, so a bad cluster is visible.                                                                                                                 |
| Cache key with prompt id + fingerprint          | Safe iteration on prompts in a deployed system.                                                                      | Cluster-level cache keys use the same scheme.                                                                                                                                     |
| Frozen `v0` and `v1`, baseline                  | The comparison point for every change.                                                                               | The comparison point for the prototype.                                                                                                                                           |

## 6. Phase 0: the fix set

### 6.0 Status after phase 0a

All ten items are implemented and committed. The text of 6.1 below is the design as proposed; this table says where each item lives and what differed.

| Item                       | Where                                                           | What differed from the text below                                                                                                                            |
| -------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0-1 registry              | `apps/llm-proxy/src/zoom/prompts/`                              | `v0` and `v1` are both pinned by hash tests. `DEFAULT_PROMPT_ID` is now `v1`.                                                                                |
| P0-2 compact JSON          | `prompts/v1.ts`                                                 | The saving was not gated. `v1`'s input is about 10% larger than `v0`'s on a small program (the longer system text and the outline outweigh it).              |
| P0-3 outline               | `src/zoom/outline.ts`                                           | See "As built" under P0-3.                                                                                                                                   |
| P0-4 plan                  | `src/zoom/plan.ts`, `prompts/v1.ts`                             | Logged with each successful attempt. In the smoke check it covered every top-level stack in every logged run. The coverage metric (D11) is not computed yet. |
| P0-5 concept rule          | `prompts/v1.ts`                                                 | The order wording (see section 1), and a concept block shown in the output skeleton so models do not copy `zoom_slug_op` for concepts.                       |
| P0-6 colour                | `prompts/v1.ts`                                                 | Every zoom block renders black (see section 1).                                                                                                              |
| P0-7 layout                | `apps/blockly-szrs/src/zoom_level_loader.ts`, `zoom_view.ts`    | The call is before the blocks are locked, and the container is shown before loading (see "As built" under P0-7).                                             |
| P0-8 params and truncation | `prompts/params.ts`, `src/lib/litellm.ts`, `src/routes/zoom.ts` | The cap is 32768. A `length` finish fails at once with `invalid_model_output`, on both the plain and the streaming path.                                     |
| P0-9 instrumentation       | `src/zoom/attempt-log.ts`, `src/routes/zoom.ts`                 | Langfuse gets tags, not a metadata field. The record is the one in the proxy README.                                                                         |
| P0-10 cache key            | `src/zoom/cache-key.ts`                                         | The fingerprint also covers the sampling parameters. `KEY_VERSION` is `v2`.                                                                                  |

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
- **Risk.** Negligible. Compactness is tested for non-inferiority later (H10) by comparing against `v1` with pretty printing.

#### P0-3. Program outline in the user message (enabler for P0-5)

- **Problem.** O9: the size-aware rule needs the model to know the program's shape, and today it must infer it.
- **Change.** A deterministic function, `describeOutline(canonicalWorkspace)`, using `saved-blocks.ts` (`allBlocks`, `byId`) and the top-level list of `workspaceJson.blocks.blocks`:

  ```
  Program size: 42 blocks, 3 top-level stacks.
  Top-level stacks:
  - b1: procedures_defnoreturn, resetGame (18 blocks)
  - b19: controls_repeat_ext (9 blocks)
  - b28: variables_set, score (2 blocks)
  ```

  Each line: canonical id (when the block has one), block type, a short descriptor from the top block's own fields (an event name, a procedure name, a variable name; nothing when it has none), and the number of blocks in the stack. Placed between the slug lines and the JSON. The format is part of the prompt, so changing it creates a new prompt id.

- **Where.** `saved-blocks.ts` or a new `outline.ts`, and `v1.ts`.
- **Risk.** Low. Blocks without an id cannot be named in the plan; they are listed without one.
- **As built.** `src/zoom/outline.ts` has `describeOutline` (the text) and `buildOutline` (the data, used to log the program's size). The header says the stacks are listed in no meaningful order. The descriptor is generic: a `NAME` field, else the first text or dropdown value, else the variable a field refers to (resolved through the workspace's `variables` list, since the blocks hold only variable ids), else the string values of `extraState`. An optional `describeBlock` hook lets a host name its own blocks; the default knows no block type. A block saved without an id is listed as `(no id)`, which happens only if the caller saved with `saveIds: false` (the plugin does not).

#### P0-4. `plan`: give the analysis somewhere to go (defect, with a design choice)

- **Problem.** O4: "Step 1" has no output field. There are two resolutions: delete it (a pure defect fix) or give it a place. A `plan` is a bet: it costs output tokens and may help weaker models more than reasoning models. It goes into phase 0 anyway because it conditions what follows (it is generated first), it makes coverage measurable, and it is the seed of phase 2's cluster tree and of phase 1's colour derivation. It remains a hypothesis (H2), and phase 1 ablates it.
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

  The ids of concepts and operations are the ids of the blocks in the `concept` and `semantic` workspaces, so the plan lines up with the levels. The shape is deliberately what a clustering stage would produce in phase 2.

- **What happens to it.** `ZoomResponseSchema` is a plain `z.object`, which drops unknown keys, so the response and the plugin are unchanged. The proxy parses `plan` separately and tolerantly, and logs it with the attempt record; the eval runner stores it. Coverage (every top-level stack in exactly one concept, every operation under exactly one concept) is computed as a metric, **not enforced** (rule 1 of section 5.1). A malformed `plan` never causes a retry.
- **Where.** `v1.ts`, a small `plan.ts` for tolerant parsing, and the logging in P0-9. Streaming shows the plan first (it is the first key), which could later become a progress line; not in scope.
- **Risk.** Output grows by an estimated few hundred tokens (to measure). A model that ignores the plan costs nothing but tokens.

#### P0-5. Size-aware, multi-concept rule and a neutral skeleton (defect)

- **Problem.** O5, O6, and the single-flow assumption at Semantic (section 4.2).
- **Change.** In `v1`:
  - The Concept rule becomes: one block per distinct feature or responsibility; one concept for a single-purpose program or a single top-level stack; otherwise group stacks by responsibility, usually 2 to 7 concept blocks; never merge unrelated responsibilities only to reduce the count; never split one stack into several concepts; concept blocks are independent and need not connect; every top-level stack belongs to exactly one concept; do not set `x` or `y`.
  - The Semantic rule gains: keep the operations of one Detail stack together in one stack of zoom blocks, in the order of that stack's own blocks; a program with several top-level stacks yields several stacks; top-level stacks have no order between them, and the prompt says so and forbids sequencing words ("first", "then") between stacks or concepts; do not set `x` or `y`.
  - The output skeleton shows two entries per list with an explicit "as many as the program needs", so it no longer models "one block". The binding example is kept.
  - The Concept block type becomes `zoom_<snake_slug>_<name>_concept`, because several concepts need distinct types (the loader registers types globally, O16).
- **Where.** `v1.ts`. No validator changes: the count and structure are not blocking (rule 1).
- **Risk.** Without the outline (P0-3), the "2 to 7" guidance would be guesswork. A model may over-fragment; the baseline measures concept count against size (D14), and the numbers are provisional.

#### P0-6. Remove the flat colour constraint (defect)

- **Problem.** O7: every zoom block is told to be colour 30.
- **Change.** `v1` drops "Colour: 30 for all zoom blocks" from the Level 2 rules and `"colour": 30` from the output skeleton, and says nothing else about colour. Nothing in the proxy or the plugin changes. Colour handled properly (section 4.3: taken from the host's own blocks) is phase 1.
- **Result.** In the smoke check every zoom block renders black (Blockly's colour for a block definition with no `colour`), and no model set a colour of its own. Left as it is for now.
- **What to expect.** Block definitions without a colour use Blockly's default block colour **(to verify how that looks)**, and a model may add colours of its own. Both are acceptable for phase 0. The risk is a model inventing colours, which can mislead because colour suggests a category. The smoke check records what each model does (6.6). If a model invents colours, add a "do not set `colour`" line to `v1` before it is frozen; that is a one-line change and still inside this item.
- **Where.** `v1.ts` only.
- **Blocking?** No.
- **Risk.** Low. The only downside is arbitrary colours, which the smoke check watches for.

#### P0-7. Layout in the plugin (prerequisite of P0-5)

- **Problem.** O17: multiple top-level blocks and no layout step.
- **Change.** After loading a level, the plugin calls `cleanUp()` on the view workspace (Blockly 13.4 has `WorkspaceSvg.cleanUp()`, and `getTopBlocks(ordered)` sorts by position top to bottom), so every top-level block is stacked without overlap regardless of what coordinates, if any, the model gave. With no coordinates, ties are expected to keep the JSON order because the sort is stable **(to verify in a plugin test)**; the prompt says top-level order carries no meaning. The model stops emitting `x` and `y`, which also saves tokens and removes a failure class.
- **As built.** The call is `ZoomLevelLoader.arrange`, after the level loads and **before** its blocks are locked: `cleanUp()` only moves movable blocks and treats the others as obstacles, and the loader makes every block immovable, so a call after the lock would leave them all where they loaded. `ZoomView.show` also displays the container before loading, so the layout is measured on a visible workspace. Blockly saves top-level blocks in the order they were created, not by position, so that order means nothing; `cleanUp` sorts by position and keeps that order for ties. The mocha test fakes `cleanUp` (the plugin's tests run headless, without a browser) to check that it runs before the lock; the first check in a real browser was the smoke check, which found no overlapping block in any run.
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

| Candidate                                                                                                                              | Why it waits                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Few-shot examples                                                                                                                      | A bet with a token cost on every call; its value depends on the model (H3).                                                                                                           |
| Two-call generation (Concept from Semantic)                                                                                            | A latency and cost trade-off (H4); uses the plan, so it needs the plan's baseline first.                                                                                              |
| Per-model prompts, structured outputs                                                                                                  | Hypotheses (H7); the registry makes them cheap later.                                                                                                                                 |
| Retry with the previous output as an assistant turn                                                                                    | Probably a win, but it moves attempts-per-success, which phase 0 wants comparable.                                                                                                    |
| Blocking checks: plan coverage, concept bounds, Level 3 "only zoom blocks", unique ids, label value leaks, naming, binding consistency | Each could be right, and each adds failures that change retry rates. Measure first (rule 1), promote what the baseline justifies.                                                     |
| Trimming the mechanical rules or the redundant `field_image` line                                                                      | Removing a rule may raise error rates for weaker models; it is an ablation (H11).                                                                                                     |
| Host profiles (per-host notes, defaults, bindable field types)                                                                         | Design for them, keep the core prompt host-neutral, and build the mechanism when a second host or App Inventor needs it. The registry's prompt objects are the carrier (section 4.6). |
| Colour from the host's own blocks (section 4.3)                                                                                        | A feature with its own design questions: anchors, themes, a contract change (the plan returned to the plugin, with `covers` per operation) and a plugin colour step. Phase 1 (7.3).   |
| More bindable field types (checkbox, colour, component)                                                                                | Contract, validator, loader and editor changes (O14); important for App Inventor, but a feature, not a defect.                                                                        |
| Per-level (lazy) requests, N levels, drill-down                                                                                        | Contract and cache changes; phase 2.                                                                                                                                                  |

### 6.3 How `v1` is built: the diff against `v0`

`v1` is `v0` plus exactly these changes. Appendix A shows the full text of each changed section and marks the rest as unchanged.

| Section                       | `v0`                                                      | `v1`                                                                                                           | Item         |
| ----------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------ |
| User message                  | Slug lines + pretty JSON                                  | Slug lines + outline + compact JSON                                                                            | P0-2, P0-3   |
| Output format                 | `semantic`, `concept`; one block each; `colour`; `x`, `y` | `plan`, `semantic`, `concept`; two-entry skeleton with "as many as the program needs"; no `colour`, no `x`/`y` | P0-4 to P0-7 |
| Step 1                        | "Analyse" with no output field                            | "Plan": describes the `plan` field                                                                             | P0-4         |
| Level 2 rules                 | One block per operation; colour 30                        | Same, without the colour line; several stacks for several Detail stacks; no `x`/`y`                            | P0-5, P0-6   |
| Level 3 rules                 | "Usually ONE block"; one type `zoom_<slug>_concept`       | Size-aware multi-concept rule; independent blocks; type `zoom_<slug>_<name>_concept`                           | P0-5         |
| Colour                        | Colour 30 stated in the Level 2 rules and in the skeleton | The colour line and the skeleton colour are removed; the prompt says nothing about colour                      | P0-6         |
| Binding rules, encoding rules | —                                                         | Unchanged                                                                                                      | —            |
| Parameters                    | None passed                                               | Shared fixed `temperature` and `maxTokens`                                                                     | P0-8         |

### 6.4 Compatibility and rollout

- **Old cached results** (`v0`, with `x`/`y`) load as before; the new layout step re-arranges them. A flush is unnecessary because keys include the prompt id.
- **Deploy order.** Plugin (layout) first or together with the proxy.
- **Contracts.** Unchanged. The proxy parses and logs `plan` but does not return it, and the plugin needs no change apart from layout.
- **Dashboard.** No dashboard change is required; its forwarders are unaffected. If a dashboard change is added later (for example showing the prompt id in the demo runner), the dashboard's own rules apply, including Playwright e2e for new features.
- **Local development.** Unaffected by the cache. A developer's proxy with `CACHE_URL` unset simply does not cache.

### 6.5 Tests

Tests live next to the code, as the repository requires. Proxy:

- The registry resolves ids; an unknown id is an error; `DEFAULT_PROMPT_ID` is a registered id.
- `v0`'s system text and fingerprint are pinned.
- `v1.buildUser` is compact, contains the outline, and appends the retry text on retry.
- `describeOutline` on fixtures: a single stack, several stacks, blocks without ids, nested handlers.
- `plan` parsing is tolerant: absent, malformed and partial plans never throw and never cause a retry.
- The cache key differs across prompt ids and across fingerprint changes, and ignores layout-only differences as before.
- Truncation: a `length` finish reason on both the plain and streaming paths fails without a retry and with the clear message. Parameters are passed through to LiteLLM.

Plugin (mocha, as in `test/zoom_level_loader.mocha.js`): a level with several top-level blocks and no coordinates loads without overlap; a level from `v0` still loads.

### 6.6 The smoke check and the exit criteria for 0a

A small by-eye check, not an evaluation: six programs run in the dashboard's demo runner on at least two models.

1. FizzBuzz (one concept expected).
2. A countdown with a bound number.
3. A three-handler app (dice roll, score, reset): expect three concepts, laid out without overlap.
4. A program with a procedure that is called from another stack: expect a sensible Semantic structure.
5. A program with one value repeated in several Detail blocks (the multi-reference binding).
6. A program in a small custom block set (its own block types and colours), to confirm that the outline and the plan depend on no core Blockly block names.

Checks: every level loads in Blockly; concept count is sensible; blocks do not overlap; record what colours the zoom blocks get on each model (the flat constraint is gone, so models may invent their own); bindings edit the right Detail values; the token count of the input before and after (P0-2, P0-3); the plan appears first and is plausible.

**Outcome (2026-11-06).** The smoke check ran twice on two models through the real demo runner, with the programs in `apps/dashboard/scripts/smoke-programs.ts`: 12 of 12 zooms succeeded on the first attempt, no blocks overlapped, and the plan covered every stack. Two of the six programs above differ: program 4 is the dashboard's greeting-function sample, and program 6 (the custom block set) went straight to the proxy, because the runner registers only core Blockly blocks and cannot load it. Results, findings and 29 screenshots: `apps/evals/results/2026-11-06-smoke-check.md`.

**Exit criteria for 0a:** unit and mocha tests green (`pnpm test` equivalent in CI, including `pnpm format:check`); the smoke check passes on two models; the cap and parameter spike is written down per alias; `v1` is frozen (any later change is `v2`); `DEFAULT_PROMPT_ID` is switched to `v1` only when the plugin change is deployed with it.

### 6.7 Phase 0b: the baseline

With 0a done, 0b builds the harness (section 9.10) and a first corpus (section 9.2), runs `v0` and `v1` on two or more models under the same parameters, scores the stored outputs with the deterministic metrics (those that apply to both, section 9.4) and a light judge pass, and has a few people skim the outputs side by side. Its question is H0 (does the original have failures that small programs hide?) and H1 (is `v1` better than `v0`?). Its output is the report that phase 1's decisions rest on. Because outputs are stored raw, later validators can be applied to `v0` and `v1` outputs without new model calls.

## 7. Phase 1: improve from evidence

Phase 1 starts after the baseline. Compared to the first version of this document, several items moved out (the Concept rule, the plan, the removal of the flat colour, layout, params, instrumentation and the registry are now in phase 0; colour taken from the host's own blocks stays in phase 1), and the first job is new.

### 7.1 Ablate `v1`: which parts matter?

`v1` bundles several changes. If it beats `v0`, we do not yet know which parts matter. Because the registry makes variants cheap, run ablations on the same corpus: `v1-noplan` (no `plan`), `v1-nooutline` (no outline) and `v1-pretty` (pretty-printed JSON). Each is a separate prompt id. Measures: the same deterministic and judge metrics, by tier and model. Decisions: keep, drop or move each component per model. This tests H1a, H2 and H10.

### 7.2 Promote checks to blocking, by data

For every check that phase 0 only recorded, the baseline gives a failure rate by model and tier. A check becomes blocking (and so can trigger a retry with a specific message) when it is a correctness problem, or when its failure rate is high enough that retrying is cheaper than shipping a bad zoom. Candidates and their rationale:

| Check                                                                     | Likely rationale                                                                                                     |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Plan coverage and exact assignment                                        | Silent omission of a handler is a fidelity failure.                                                                  |
| Concept count bounds (at least 1, at most the number of top-level stacks) | Catches degenerate levels; upper bounds are softer.                                                                  |
| Level 3 uses only `zoom_` blocks; type naming; unique ids                 | Stated in the prompt and unchecked; duplicate ids hide bad bindings.                                                 |
| Labels without literal values (F7)                                        | A label like "repeat up to 10" goes stale on the first edit.                                                         |
| Binding consistency (O13)                                                 | The first edit silently overwrites other references.                                                                 |
| Plan id validity                                                          | Ids in the plan that are not Detail blocks; promote if frequent, and before colour derivation depends on them (7.3). |

### 7.3 Improvements that were always hypotheses

| Item                              | What and why                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Hypothesis |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Few-shot examples                 | Two or three worked examples: a one-concept program, a three-handler app, a program with a repeated value. Selected by program size (the outline supplies it). Targets the mistakes `repair.ts` fixes today.                                                                                                                                                                                                                                                                            | H3         |
| Retry with the previous output    | Send the failed output as an assistant turn, then the errors, asking to fix only those; better parse errors with position and surrounding text.                                                                                                                                                                                                                                                                                                                                         | H12        |
| One call or two                   | One call with plan (`v1`), or Semantic first and Concept generated from Semantic and the plan. The plan makes the second call small and keeps coherence by construction.                                                                                                                                                                                                                                                                                                                | H4         |
| Per-model prompts and params      | The seam is the registry: map a model alias to a prompt id and parameters; test structured output modes where supported; reasoning-model differences.                                                                                                                                                                                                                                                                                                                                   | H7         |
| Trimming                          | Ablate the mechanical rules the code already enforces (including the redundant `field_image` line). Fewer tokens, possibly worse weak-model validity.                                                                                                                                                                                                                                                                                                                                   | H11        |
| Host profiles                     | A per-host profile (default prompt id and params, domain notes, allowed bindable field types, size guidance) when a second host needs one; carried by the registry's prompt objects (section 4.6, Appendix E).                                                                                                                                                                                                                                                                          | H9         |
| Colour from the host's own blocks | The full treatment of section 4.3. Extend the plan with `covers` for each operation (a new prompt id); return the plan as an optional, leniently attached field with `restoreIds` extended; give block definitions without a colour a neutral default in the proxy; add a plugin step that copies the anchor's style or colour onto each zoom block. Without the plan there is no colour source, so test it as plan present with colour derivation on against off. Metrics D23 and D24. | H1b, H9    |
| Bindable field types              | Extend `ZOOM_EDITABLE_FIELD_TYPES` to checkbox, colour and component dropdown fields; contract, validator, loader and editor change. Important for App Inventor.                                                                                                                                                                                                                                                                                                                        | H13        |
| Using the plan in the UI          | Once the plan is returned (with colour derivation), use it for tooltips, a concept list or drill-down. A product decision.                                                                                                                                                                                                                                                                                                                                                              | H14        |
| Lazy per-level requests           | Ask only for the level the user opens. A cost question that changes the contract and the cache; decided with phase 2's shape in mind.                                                                                                                                                                                                                                                                                                                                                   | H15        |

### 7.4 Judge calibration and the human study

The first human study (section 9.7) belongs here: it decides the questions no automatic metric can, such as how many concepts feel right and whether colour taken from the host's blocks helps. It also calibrates the judge (section 9.8), after which cheap judged regression runs are trusted only for dimensions with adequate agreement.

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
| 3. Zoom each cluster  | One call per cluster: its Detail stacks in, its Semantic blocks and bindings out. Parallel; cacheable by cluster content hash.    | Uses the registry (a prompt per stage), compact JSON and the plan's coverage mapping.                  |
| 4. Compose            | Build each higher level from the one below, from labels and the Detail blocks each node covers rather than from whole blocks.     | Layout already in place; colour derivation (phase 1) extends to every node.                            |
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
- **Common-subset comparisons.** Some metrics need fields only `v1` produces (plan). Comparisons between `v0` and `v1` use the metrics both can be scored on; the extra ones describe `v1` and later prompts (section 9.4, column "v0").

### 9.2 Corpus

| Tier | Size (blocks)   | Source                                                                                                                                                 | Purpose                                                  |
| ---- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| S    | about 5 to 15   | Hand-written teaching programs (FizzBuzz, countdown, sum of a list, greeting).                                                                         | Fidelity and binding basics; where one concept is right. |
| M    | about 20 to 60  | Hand-written plus simplified real examples: games, calculators, quizzes.                                                                               | Multi-operation Semantic; first multi-concept cases.     |
| L    | about 60 to 200 | Real application programs from any host available, including App Inventor screens from tutorials and sample projects (check licences **(to verify)**). | The target regime for one realistic program.             |
| XL   | 200 and above   | The largest real screens available.                                                                                                                    | Scaling and context limits.                              |
| XXL  | whole apps      | Only if section 4.5's study finds it feasible.                                                                                                         | App-level node.                                          |

Construction:

- **Synthetic compositions:** concatenate k independent small programs; the expected concept count is at least k, with no annotation needed.
- **A host-neutrality slice:** a few programs in a small custom block set with its own categories and colours, so that nothing in the pipeline silently depends on core Blockly block names or a fixed vocabulary.
- **Mutations** for the metamorphic tests (section 9.5).
- **Golden annotations** on about 30 programs balanced by tier: an acceptable concept-count range, values that must be bound, behaviours that must be mentioned, and the Detail block each concept and operation should stand for (its anchor). Annotate where it will be used.
- **A hold-out third,** hidden from prompt iteration.
- **Provenance and privacy:** record the origin of every program; no student projects without consent.

Starting size: 40 to 60 programs across tiers is enough for the deterministic suite and a first human study; stability needs k = 5 runs per program, prompt and model. A first pass for 0b can be 20 programs.

### 9.3 Failure taxonomy

One vocabulary for automated tags, judge output and human flags:

| Code | Failure                   | Example                                                                                                                                                         |
| ---- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1   | Hallucinated behaviour    | A concept says "saves the score" where nothing saves anything.                                                                                                  |
| F2   | Omission                  | A handler is absent from every level.                                                                                                                           |
| F3   | Over-compression          | Ten behaviours merged into one vague block.                                                                                                                     |
| F4   | Under-compression         | Semantic is a re-drawing of Detail.                                                                                                                             |
| F5   | Wrong grouping            | Unrelated handlers in one concept; one feature split across two.                                                                                                |
| F6   | Misleading or vague label | "Do the thing".                                                                                                                                                 |
| F7   | Value leak in a label     | "Repeat up to 10".                                                                                                                                              |
| F8   | Missing or wrong binding  | The limit is not exposed, or editing it changes the wrong block.                                                                                                |
| F9   | Levels incoherent         | Concept does not summarise Semantic.                                                                                                                            |
| F10  | Structural failure        | Does not load; invalid JSON; truncated.                                                                                                                         |
| F11  | Redundant levels          | Semantic and Concept are essentially the same.                                                                                                                  |
| F12  | Wrong count of concepts   | One for a ten-handler app; seven for FizzBuzz.                                                                                                                  |
| F13  | Misleading colour         | A colour that suggests a category the block does not have, or colours that differ for no reason. In phase 1, also a derived colour taken from the wrong anchor. |
| F14  | Layout failure            | Blocks overlap or are off screen after loading.                                                                                                                 |

### 9.4 Automated evals, deterministic

All computed from stored outputs, so they re-run when a validator changes. "v0" says whether the metric can score a `v0` output (it needs no `plan`).

| ID  | Metric                               | How it is computed                                                                                                                                                       | Level   | v0  | Provisional target    |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | --- | --------------------- |
| D1  | Schema validity rate                 | Fraction whose final output passes `ZoomResponseSchema` and `checkZoomResult`.                                                                                           | both    | yes | at least 99%          |
| D2  | First-attempt validity               | Fraction valid on attempt 1, before repair and retry.                                                                                                                    | both    | yes | track, raise          |
| D3  | Attempts per success                 | Mean attempt number of the success.                                                                                                                                      | both    | yes | at most 1.2           |
| D4  | Repair rate by type                  | `repairs` per run, grouped by kind.                                                                                                                                      | both    | yes | falling               |
| D5  | Loadability                          | Load `blockDefs` and `workspaceJson` into a real Blockly workspace as `ZoomLevelLoader.load` does.                                                                       | both    | yes | 100% of valid outputs |
| D6  | Binding validity                     | Binding targets exist and have a compatible kind (as in `validate.ts`), reported as a rate.                                                                              | both    | yes | 100%                  |
| D7  | Binding round trip                   | Programmatically edit each bound field; check the intended Detail fields changed, nothing else did, and Detail still loads.                                              | both    | yes | 100%                  |
| D8  | Binding consistency                  | Multi-reference bindings whose references initially hold the same value (O13).                                                                                           | both    | yes | 100%                  |
| D9  | Binding recall (golden)              | Fraction of annotated "must be exposed" values reached by some binding.                                                                                                  | both    | yes | at least 80%          |
| D10 | Binding precision (golden)           | Fraction of bindings on values a person marked as sensible to expose.                                                                                                    | both    | yes | at least 90%          |
| D11 | Coverage                             | From `plan`: fraction of top-level Detail stacks in exactly one concept, and of operations under exactly one concept. For `v0`: binding reach only, plus the judge (J6). | concept | no  | 100%                  |
| D12 | Compression ratio                    | Blocks in the level divided by Detail blocks.                                                                                                                            | both    | yes | report                |
| D13 | Monotonicity                         | Detail > Semantic ≥ Concept in blocks, and Concept count ≤ Semantic count.                                                                                               | both    | yes | 100%                  |
| D14 | Concept count versus size            | Concept count against top-level stack count; compared with the golden range and the synthetic k.                                                                         | concept | yes | within golden range   |
| D15 | Synthetic composition recall         | Fraction of k-program compositions yielding at least k concepts.                                                                                                         | concept | yes | at least 90%          |
| D16 | Naming and style rules               | `zoom_<slug>_` prefix, snake case, Concept suffix, unique ids.                                                                                                           | both    | yes | 100%                  |
| D17 | Value leak                           | Labels, tooltips and messages containing a literal value present in Detail.                                                                                              | both    | yes | 0                     |
| D18 | Redundancy                           | Similarity of Semantic and Concept (type multiset or label overlap) above a threshold.                                                                                   | both    | yes | low                   |
| D19 | Stability across samples             | k runs: variance of block counts, Jaccard overlap of block types and binding targets, label-set edit distance.                                                           | both    | yes | track                 |
| D20 | Normalisation invariance             | Shuffle ids and positions in Detail (the proxy normalises them); the canonical result should be equivalent (per D19 for a model).                                        | both    | yes | no regression         |
| D21 | Latency, tokens, cost                | Wall-clock, input and output tokens, dollars (Langfuse already records them).                                                                                            | both    | yes | budget per tier       |
| D22 | Cache behaviour                      | Hit on identical request; miss on changed prompt id or fingerprint; hit after a layout-only edit.                                                                        | n/a     | yes | as designed           |
| D23 | Colour derivation rate (phase 1)     | Fraction of the zoom blocks named in the plan whose anchor id resolves to a Detail block, and whose colour was derived. Unresolved ids are counted.                      | both    | no  | at least 95%          |
| D24 | Anchor correctness (phase 1, golden) | Anchor of each concept and operation against the annotated Detail block, or judged by J1 and J6.                                                                         | both    | no  | at least 85%          |
| D25 | Layout overlap                       | After loading in the plugin (with `cleanUp`), the number of overlapping top-level blocks; run in the plugin's browser tests.                                             | both    | yes | 0                     |
| D26 | Truncation rate                      | Fraction of attempts ending with `finishReason = length`, by model and tier.                                                                                             | n/a     | yes | 0                     |
| D27 | Prompt size                          | Input tokens by tier for each prompt id (compact JSON and outline effects).                                                                                              | n/a     | yes | report                |

D5, D7 and D25 need a Blockly runtime. Blockly's headless `Workspace` (not the SVG one) should run in Node **(to verify in a short spike)**; D25 needs a rendered workspace and runs in the plugin's mocha tests.

### 9.5 Metamorphic and behavioural evals

Relations between outputs, with no reference answer needed.

| ID  | Transformation of the Detail program                   | Expected relation                                                                                                  |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| M1  | Change a numeric literal                               | Same structure; the bound field shows the new value; labels do not contain the old value.                          |
| M2  | Rename a variable                                      | Same structure; labels that mention it change consistently, or do not mention it.                                  |
| M3  | Add an independent handler                             | One more operation group and one more concept (or a stated merge); the rest unchanged.                             |
| M4  | Reorder top-level stacks                               | Equivalent output.                                                                                                 |
| M5  | Compose k independent programs                         | At least k concepts, each containing the original's description.                                                   |
| M6  | Delete a handler                                       | A concept disappears; nothing else is invented.                                                                    |
| M7  | Same program, different slug                           | Same structure, different type prefixes.                                                                           |
| M8  | Swap a block for one of a different category (phase 1) | The colour of the zoom block that summarises it changes to the new block's colour; nothing else of substance does. |

M3 and M5 directly test the multi-concept goal; M8 tests colour derivation.

### 9.6 Automated evals, LLM as judge

A judge is useful where deterministic checks cannot see: fidelity, granularity, label quality. It is biased and must be calibrated against humans (9.8) first.

**Inputs.** Detail in a compact textual form; a rendering of the level (labels, structure, colours, binding list); for the reference-based variant, the golden annotation. The judge never sees which prompt or model made the output.

| ID  | Judge                            | What it does                                                                                                                                                           | Notes                                                                                    |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| J1  | Rubric scoring, per level        | 1 to 5 on fidelity, completeness, abstraction, grouping, labels, controls, coherence between levels, colour fit; each with a one-line justification and failure codes. | Same dimensions as the human form so the two compare. Temperature 0.                     |
| J2  | Pairwise preference              | Picks the better of two outputs overall and per dimension; run in both orders; keep only consistent verdicts.                                                          | Controls position bias. Gives win rates and Bradley-Terry strengths.                     |
| J3  | Claim-level faithfulness         | Decomposes the level into atomic claims and checks each against Detail: supported, unsupported, contradicted.                                                          | A hallucination rate (F1), in the style of atomic-fact scoring. Costly; use on a sample. |
| J4  | Round-trip description           | A model that sees only the Concept level describes the program; compared with a description made from Detail.                                                          | Tests whether Concept preserves the gist. Sensitive to the describer; fix it.            |
| J5  | Question-answering probes        | Questions about the Detail program answered from each level alone, scored against answers from Detail, with credit for correct abstention.                             | Information retained per level; compression-fidelity curves.                             |
| J6  | Coverage judge (reference-based) | Checks which golden behaviours appear in Semantic and Concept.                                                                                                         | The only coverage measure for `v0`, which has no plan.                                   |
| J7  | Concept-count judge              | Says whether the number and grouping of concepts are reasonable and what it would change.                                                                              | Qualitative; explains disagreements with D14.                                            |

Controls: a different model family from the generator, at least two judges with their agreement reported, randomised order, hidden identities, fixed temperature and judge-prompt version, bias checks (position, length, self-preference), and hand-checked samples whenever the judge prompt changes. Drafts are in Appendix B.

### 9.7 Human validation: blind side-by-side ratings

The ground truth for "better" and the calibration set for the judge. It also answers design questions that no metric can, such as how many concepts feel right and whether colour from the host's blocks helps.

**What a reviewer sees.** For each item: the Detail program in the real Blockly rendering, then two or three candidates labelled A, B, C in random order, each shown in the plugin's own view at Semantic and Concept. No prompt, model or attempt count is shown. Rendering in the real view matters because layout, colour and shape affect readability. `ZoomSession` is built around an injectable requester function, so a replay requester returning a recorded `ZoomResponse` is a natural way to show stored outputs without calling a model **(to verify how plugin options expose it)**. The dashboard's demo runner already hosts the plugin and could host a rating mode.

**What a reviewer does.**

1. Rates each candidate 1 to 5 per dimension and level: faithful, complete, right level of abstraction, concept grouping (Concept only), labels, controls (exposed values), **colour: can you tell what each block is at a glance?**, useful overall.
2. Picks a preferred candidate (or tie) per level and an overall winner.
3. Flags failure types F1 to F14 and may comment.

A short **task-based probe** complements the ratings for the colour design: "which of these blocks is the event handler?" and "which one resets the score?", measured as accuracy and time, with and without derived colour. It tests whether colour helps rather than whether it looks nice.

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

| Gate                  | When                                        | What it runs                                                                                                          | Blocks a change if                                       |
| --------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Replay (cheap, in CI) | Every pull request                          | Deterministic metrics (D1, D5 to D8, D12 to D13, D16, D17) on a frozen set of recorded model outputs. No model calls. | A validator, repair or colour change breaks a recording. |
| Live deterministic    | On demand and before merging prompt changes | The corpus against chosen models with the candidate prompt; D1 to D27 and M1 to M8.                                   | D1, D3, D5 to D8 regress; stability collapses.           |
| LLM judge             | On demand and nightly                       | J1 and J2 on a sample; J3 and J5 on a smaller one.                                                                    | Win rate against the baseline significantly below 50%.   |
| Human study           | Per major design decision                   | Section 9.7.                                                                                                          | Decision rules in section 10.                            |

The replay gate fits the repository's CI (`.github/workflows/test.yml`; keep `pnpm test` and CI equivalent) because it needs no secrets and no network. Live and judged runs need keys and money, so they stay outside the default `pnpm test`.

**Where the harness lives.** `apps/evals/`, its own package (decided at the start of phase 0b). Phase 0a began it as `apps/llm-proxy/checks/` (scripts, dated results and the viewer `pnpm report`, built around rows of model, prompt, tier and numbers); it moved out because it needs Blockly and datasets, and the proxy must not depend on Blockly. It imports the proxy's prompt registry and parsing through the proxy's `exports` map:

- `corpus/`: programs (JSON), tier, provenance and optional golden annotations.
- The prompt registry itself (P0-1), imported, so evals test exactly what runs in production.
- A runner that, per program, prompt id and model, calls the model through the proxy's chat endpoint or LiteLLM using `buildZoomMessages` and `parseZoomResponse` directly (pure functions), **without the cache**, under the shared parameters, and stores a record (Appendix D).
- Metric modules (deterministic, metamorphic, judge) that read records; a report generator with intervals by model and tier; Langfuse datasets and scores.

Repository conventions apply: license header, exact dependency versions, `pnpm-lock.yaml` committed with any `package.json` change, tests beside code, new env variables in `turbo.json` `globalPassThroughEnv` and CI placeholders, secrets only in gitignored `.env` files.

## 10. Hypotheses and experiments

Each is stated so it can be rejected. Variants run on the same corpus with at least two models of different strength. Decision rules are provisional.

| ID  | Hypothesis                                                                                                                             | Variants                                                                                  | Primary measures                                                           | Decision rule                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| H0  | The original prompt has failures on M, L and XL programs that S programs hide.                                                         | `v0` only.                                                                                | D1 to D4, D14, J1, human ratings by tier.                                  | Establishes the problem; if absent, phase 1 is lower priority.                        |
| H1  | The phase-0 bundle (`v1`) is rated better than `v0`, mostly for grouping and abstraction, without lower fidelity.                      | `v0` against `v1`.                                                                        | Human preference, J1, D14, D15, F12 rate, fidelity.                        | Win rate above 50% with the interval excluding it on M and above; fidelity not lower. |
| H1a | The outline accounts for part of H1 (size-aware concept counts).                                                                       | `v1` against `v1-nooutline`.                                                              | D14, D15, F12.                                                             | Concept count tracks size better with the outline.                                    |
| H1b | Colour taken from the Detail blocks improves recognition of what a block is, and perceived readability (phase 1).                      | The phase-1 prompt with colour derivation on against off.                                 | Task accuracy and time, readability rating, F13.                           | Higher accuracy or speed, no lower readability.                                       |
| H2  | The plan improves coverage and coherence at acceptable token cost.                                                                     | `v1` against `v1-noplan`.                                                                 | D11, J1 coherence, F2 and F9, tokens.                                      | Coverage gain justifies the extra tokens.                                             |
| H3  | Few-shot examples reduce retries and repairs, most for weaker models.                                                                  | Zero-shot, 1 example, 3 examples.                                                         | D2 to D4, tokens, J1.                                                      | Gain on the weakest supported model, no loss on the strongest.                        |
| H4  | Generating Concept from Semantic and the plan improves coherence, at higher latency.                                                   | One call, two calls.                                                                      | J1 coherence, F9, F11, latency, cost.                                      | Coherence gain beyond what the plan gives.                                            |
| H5  | Per-cluster generation scales better in quality and latency than one call on large programs.                                           | Best phase-1 prompt, phase-2 prototype.                                                   | D1, D12, D19, J1 by tier, latency, cost per edit.                          | Better on L and XL; fall back to one call below a size threshold.                     |
| H6  | The LLM judge agrees with humans well enough to replace them for regression on some dimensions.                                        | J1 and J2 against human ratings.                                                          | Weighted kappa, pairwise agreement.                                        | Per-dimension agreement above the preset threshold.                                   |
| H7  | Low temperature and structured outputs improve stability and validity without hurting quality.                                         | Shared params, other temperatures, JSON-schema mode.                                      | D1, D2, D19, J1.                                                           | Better validity and stability with no quality drop.                                   |
| H8  | A whole-app level is rated more useful than per-screen zooming alone for multi-screen apps.                                            | Per-screen only, option A or B.                                                           | Human ratings on XXL items; feasibility criteria.                          | Only if the feasibility study passes.                                                 |
| H9  | The pipeline depends on no fixed block vocabulary: results are as good on a custom block set as on core Blockly.                       | `v1`, and later prompts, on core-Blockly programs against programs in a custom block set. | D1 to D4, D14, J1 on both sets; D23 and D24 once colour derivation exists. | No gap beyond noise between the sets.                                                 |
| H10 | Compact JSON does not lower quality.                                                                                                   | `v1` against `v1-pretty`.                                                                 | J1, D1 to D4 (non-inferiority), tokens.                                    | No worse beyond a small margin.                                                       |
| H11 | Trimming prompt text the code already enforces saves tokens without raising failures.                                                  | Full rules, trimmed rules.                                                                | D1 to D4, tokens, per model.                                               | Fewer tokens with no validity loss on the weakest model.                              |
| H12 | Sending the failed output back on retry raises the retry success rate.                                                                 | Current retry, assistant-turn retry.                                                      | Retry success rate, attempts per success.                                  | Higher retry success.                                                                 |
| H13 | Exposing checkbox, colour and component fields improves binding recall on programs that use such fields (App Inventor's, for example). | Current types, extended types.                                                            | D9, D10 on App Inventor items.                                             | Higher recall without lower precision.                                                |
| H14 | Surfacing the plan helps users (tooltips, drill-down) more than it costs in contract complexity.                                       | With and without.                                                                         | Human task probe, usage signals.                                           | Product decision.                                                                     |
| H15 | Asking only for the level the user opens lowers cost without hurting experience.                                                       | Both-levels call, per-level calls.                                                        | Cost, latency, switching delay.                                            | Lower cost, tolerable delay.                                                          |

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
| 0a    | P0-1 to P0-10: registry, `v1` (compact JSON, outline, plan, multi-concept rule, flat colour removed), plugin layout, params and truncation, instrumentation, cache key; tests; smoke check; cap spike.                         | Tests green; smoke check passed on two models; spike written; `v1` frozen.                             | M    | Plugin and proxy deploy ordering; output cap per model. |
| 0b    | Corpus (20, growing to 40 to 60), golden annotations on a subset, runner, deterministic metrics, headless Blockly spike, replay set for CI; baseline of `v0` and `v1` on two or more models; light judge; informal human skim. | Baseline report by model and tier; H0 and H1 answered; replay gate in CI.                              | M    | Corpus effort; headless Blockly may not work.           |
| 1     | Ablations (7.1); promote checks (7.2); few-shot, retry, two-call, per-model, trimming, colour from the host's blocks, host profiles, bindings (7.3); judge calibration and the human study (7.4).                              | A prompt per model beating `v1` on human-validated measures by tier; blocking checks chosen from data. | L    | Overfitting to the corpus; reviewer recruitment.        |
| 2     | Pipeline prototype behind a flag, shape A, with M1 to M8 and incremental re-zoom.                                                                                                                                              | H5 answered on L and XL; size threshold for the fallback chosen.                                       | L    | Contract and plugin changes; complexity.                |
| A     | App Inventor feasibility (4.5): reading other screens, serialisation, sizes, scoping, option A prototype; what an App Inventor host profile would hold.                                                                        | A written result against the four criteria; H8 if it passes.                                           | M    | Needs access to App Inventor internals.                 |

Phase A can start as soon as 0a lands. Phase 2 should not begin until phase 1's human study has shown what a good multi-concept Concept level looks like, because otherwise phase 2 optimises against an untested target.

## 12. Risks and open questions

### 12.1 Decisions this draft makes that need your confirmation

**Status: all nine were confirmed on 2026-11-06 and implemented.** Notes: item 5 (the shared `temperature` and cap) was accepted knowing that reasoning models may ignore `temperature`, and the cap became 32768 (section 1); items 1 and 2 held (colour only removed, plan internal).

1. **Colour in phase 0 is only the removal of the flat constraint** (P0-6). The full treatment, derivation from the host's own blocks through the plan, is phase 1 (sections 4.3 and 7.3). Risk: models may invent colours in the meantime; the smoke check watches for it, and a one-line "do not set `colour`" fallback is available.
2. **`plan` stays internal in phase 0:** parsed tolerantly, logged and scored, not returned. It is returned in phase 1 together with colour derivation.
3. **One small plugin change in phase 0:** layout (`cleanUp`, P0-7). The model no longer places blocks.
4. **No new blocking checks in phase 0.** New checks are metrics first.
5. **Shared fixed `temperature` (proposal 0.2) and an explicit `maxTokens` for both prompts in the baseline,** `v0` included, instead of "unset".
6. **Truncation fails fast without a retry,** on the existing `invalid_model_output` code.
7. **`v1` is frozen once baselined or deployed;** any later change is `v2`.
8. **The `v0` and `v1` comparison measures the bundle;** the ablations are phase 1's first job.
9. **Host neutrality:** App Inventor is a case study and a possible host profile, with no host-specific vocabulary in the core. Profiles are designed for, not built, in phase 0.

### 12.2 Risks

- **Overfitting to a small corpus:** hold-out set, varied sources, fresh programs for each human study.
- **Judge bias and drift:** calibrate against humans, several judges, recalibrate on any change.
- **Cost:** multi-sample, multi-model, judged runs multiply quickly. Tier the gates, sample the expensive judges, cache model outputs in the eval store.
- **Cache churn:** every prompt or template change invalidates production entries. Evals bypass the cache; batch production changes.
- **Contract churn:** phase 2 touches the shared contracts package and the plugin; keep the old shape working during migration.
- **Colour as a false cue:** in phase 0 a model may invent colours that suggest a category a block does not have; in phase 1 a wrong anchor gives a block the wrong colour. Either misleads more than a neutral colour. Hence F13, the smoke check, D23 and D24, and promoting plan id checks if unresolved ids are frequent.
- **Prompt and code drift:** prefer enforcing a rule in code and keeping the prompt short, after phase 1 trimming data.
- **Host lock-in:** App Inventor is the main driver but not the only host. Keep the core host-neutral and put host specifics in profiles.

### 12.3 Open questions

**Status 2026-11-06.** Question 2 is partly answered: two OpenRouter models were tested and the weakest supported one is still undecided. Question 4 is answered: both models accepted `temperature` 0.2 and caps up to 131072. Question 10 is answered (below). Questions 1, 3, 5 and 6 to 9 are still open.

1. Who is the intended reader of the Concept level: a learner, a teacher, a maintainer? It changes what good grouping means and who should rate.
2. Which models must be supported, and which is the weakest? It sets how far per-model prompts must go and which models the baseline covers.
3. What should a host profile hold, and how is it supplied: a plugin option, proxy configuration per site, or both? Needed when a second host appears; to design in phase 1.
4. What output cap suits each model alias, and does each accept a fixed `temperature` through LiteLLM?
5. (Phase 1) Do style names carry over to the view workspace's theme, or must the plugin copy a hex colour? Does the derived colour need to follow dark mode?
6. Should `plan` eventually be stored and shown to the user?
7. Is a per-level (lazy) request acceptable if it lowers cost, given the contract and cache change?
8. Which App Inventor projects may legally and ethically go into the corpus?
9. Which Blockly version and serialisation does App Inventor's editor use, and does it match what the plugin assumes?
10. `DECISIONS.md` is referenced by the contracts, plugin and proxy but does not exist. Should the decisions it refers to (#8, #10, #11) be written down, since this work depends on them? **Answered 2026-11-06:** the file existed on another machine and was never committed. `AGENTS.md` (Known documentation drift) lists what the source comments say each cited decision was; the original wording is lost, so write down new decisions as they are made, in the code or the docs, and do not cite the old numbers in new comments.

## Appendix A: `v1` system and user prompts (draft)

**Superseded by the implementation:** the frozen text is `apps/llm-proxy/src/zoom/prompts/v1.ts`. It differs from this draft in the order wording (below), a concept block in the output skeleton, and a paragraph in the Plan step saying that top-level stacks have no order. This appendix is kept as the proposal. A draft for review, not a tested prompt. Changed text is shown in full. Sections marked **unchanged from `v0`** keep the current wording word for word (section 5.1, minimal diff).

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
      {
        "id": "c1",
        "name": "<short feature name>",
        "stacks": ["<id of a top-level Detail block>", ...],
        "operations": ["s1", ...]
      },
      ...
    ]
  },
  "semantic": {
    "blockDefs": [
      { "type": "zoom_slug_op", "message0": "do something up to %1", "args0": [{ "type": "field_number", "name": "LIMIT", "value": 0 }], "tooltip": "...", "previousStatement": null, "nextStatement": null },
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
2. "concepts": the distinct features or responsibilities of the program. Each has an "id" (c1, c2, ...; also the id of its block in the concept workspace), "stacks" (the ids of the top-level Detail blocks, listed in the user message, that belong to it) and "operations" (the ids of the Semantic blocks that describe it).
Every top-level Detail block belongs to exactly one concept. Write the levels so that they agree with the plan.

## Level 2 (Semantic) rules

- One zoom block per logical operation (hiding implementation detail)
- Keep the operations of one Detail stack together, as one stack of zoom blocks, in the order of that stack's own blocks. A program with several top-level stacks gives several stacks.
- Block types: zoom_<snake_slug>_<operation_in_snake_case>
  (convert slug hyphens to underscores: fizz-buzz-n → fizz_buzz_n)
- The workspace may keep structural Blockly primitives (controls_for, controls_if, text_print) where semantically meaningful
- Do not set "x" or "y"

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

## Block definition rules

[unchanged from v0 (the colour instruction lived in the Level 2 rules and is replaced there)]

## Binding rules

[unchanged from v0]

## JSON encoding rules

[unchanged from v0]
```

### A.3 Notes on the draft

- The skeleton uses `...` and an explicit "as many as the program needs", so it no longer models one block.
- The plan's ids are the ids of the blocks in the levels (`c1`, `s1`), so the plan lines up with the levels: for coverage metrics now, and for colour derivation in phase 1 (section 4.3).
- The skeleton has no `colour` field and the prompt says nothing about colour (P0-6).
- There is no host-specific wording. A host profile may append a short "host notes" block (Appendix E).
- The rules about "usually 2 to 7" and about merging are provisional and tested by H1 and D14.

## Appendix B: Judge prompt (draft, rubric scoring J1)

```text
You are evaluating a "semantic zoom": a higher-level description of a Blockly program, made for learners.

You will be given:
1. DETAIL: the program, as Blockly JSON.
2. LEVEL: either "semantic" or "concept", shown as a list of blocks with their labels, colours and the values they expose.
3. (optional) GOLD: notes by a person on what a good zoom must contain.

Score each item from 1 (very poor) to 5 (excellent). Justify each in one sentence that points to specific blocks or labels.
- fidelity: says only what the program does; no invented behaviour, no wrong values or conditions.
- completeness: nothing important in the program is missing at this level.
- abstraction: the right level of detail for LEVEL (semantic: operations; concept: features), neither too detailed nor too vague.
- grouping: the number of blocks and how they group the program is sensible.
- labels: clear, specific, consistent, no literal values in them.
- controls: the exposed values are the ones a user would want to change.
- colour: any colours the blocks have do not suggest a category the block does not have.

Then list failure codes that apply: F1 hallucinated behaviour, F2 omission, F3 over-compression, F4 under-compression, F5 wrong grouping, F6 vague label, F7 value in label, F8 missing or wrong binding, F11 redundant with the other level, F12 wrong number of concepts, F13 misleading colour.

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
| Colour                     | 1 to 5: can you tell what each block is at a glance? |
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

As built, the proxy's own per-attempt log record is smaller: prompt id, model alias, attempt, outcome, finish reason, usage, repairs, program size and the plan. It does not keep the raw text of an attempt, so the baseline runner stores the fuller record above itself.

## Appendix E: Host profiles (design sketch, not built in phase 0)

The core stays host-neutral (section 4.6). A **host profile** collects what is true of one host and not of Blockly in general. It is carried by the prompt registry (P0-1), so it inherits versioning, immutability, cache separation and evaluation.

| Part of a profile             | What it holds                                                                                                     | Example (App Inventor, illustrative and unverified)                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Default prompt id and params  | Which registered prompt and sampling parameters each model alias uses for this host.                              | A prompt id built from `v1` plus the host notes below.                                          |
| Host notes                    | A short block appended to the system prompt with domain knowledge the core cannot have.                           | "An event handler is usually a separate feature. Component blocks refer to components by name." |
| Size guidance                 | Overrides of the "usually 2 to 7 concepts" rule when the host's programs differ.                                  | None needed at first.                                                                           |
| Bindable field types          | Extra editable field kinds a host wants exposed (needs the contract, validator, loader and editor change in 7.3). | Checkbox, colour, component dropdown.                                                           |
| Corpus slice and golden notes | The host's programs in the eval corpus, with their annotations.                                                   | App Inventor screens from tutorials and samples.                                                |

**How it is supplied (open, 12.3).** Likely a site-level setting in the proxy, since each site runs its own proxy and LiteLLM: a profile id mapped to a registered prompt id and parameters per model. The plugin does not need to know about profiles.

**Rules.**

- A profile is a prompt id, so editing a profile after it has produced recorded results creates a new id.
- Evaluate each profile on its own corpus slice, and keep the host-neutrality slice (custom block set) in every run so that a profile cannot quietly break the core.
- Build the mechanism only when a second host, or App Inventor's own needs, justify it. Until then the registry and `DEFAULT_PROMPT_ID` are enough.

## Appendix F: Phase 0 implementation checklist by file

**Done in phase 0a.** This list was a starting point; the files as built are in 6.0 and in the Architecture notes of `apps/llm-proxy/README.md`. Beyond it, phase 0a added `prompts/params.ts`, `prompts/slug.ts`, `attempt-log.ts`, `outline.ts` (its own file), `apps/evals/` and `apps/dashboard/scripts/smoke-*.ts`. The list below is kept as proposed.

| Path                                                      | Change                                                                                                           | Item          |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------- |
| `apps/llm-proxy/src/zoom/prompts/{v0,v1,index}.ts`        | New registry; `v0` verbatim and frozen; `v1` per Appendix A                                                      | P0-1 to P0-6  |
| `apps/llm-proxy/src/zoom/zoom.ts`                         | `buildZoomMessages` takes a prompt id; re-export of the old constant; `plan` parse alongside `parseZoomResponse` | P0-1, P0-4    |
| `apps/llm-proxy/src/zoom/saved-blocks.ts` or `outline.ts` | `describeOutline`                                                                                                | P0-3          |
| `apps/llm-proxy/src/zoom/plan.ts`                         | Tolerant parsing of `plan`, logged with the attempt record                                                       | P0-4          |
| `apps/llm-proxy/src/zoom/cache-key.ts`                    | Key from prompt id and fingerprint                                                                               | P0-10         |
| `apps/llm-proxy/src/routes/zoom.ts`                       | Pass prompt params; handle `length`; per-attempt records; prompt id as trace metadata                            | P0-8, P0-9    |
| `apps/llm-proxy/src/lib/litellm.ts`                       | Capture `finish_reason` (and usage, if available) on the streaming path                                          | P0-8, P0-9    |
| `apps/blockly-szrs/src/zoom_view.ts` (or the loader)      | `cleanUp()` after loading a level                                                                                | P0-7          |
| `apps/blockly-szrs/test/*.mocha.js`                       | Layout without overlap; `v0` result loads                                                                        | P0-7          |
| `apps/llm-proxy/test/unit/**`                             | Registry, pinned `v0`, outline, plan tolerance, cache key, truncation, params                                    | P0-1 to P0-10 |
| `apps/llm-proxy/README.md`                                | Document prompt ids and the cache-key scheme; fix the stale pnpm version and `DECISIONS.md` reference            | P0-1, P0-10   |
