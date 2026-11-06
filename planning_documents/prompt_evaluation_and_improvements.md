# Semantic zoom prompts: current state, improvements, and how to evaluate them

Status: proposal and study plan. Written 2026-11-04 against branch `feat/plugindemo`. Nothing in this document has been implemented. Statements about the code were checked against the files named next to them; statements about App Inventor internals, thresholds and literature are marked **(to verify)** where they were not checked.

## 1. Summary

**Where we are.** One static system prompt (`ZOOM_SYSTEM_PROMPT` in `apps/llm-proxy/src/zoom/zoom.ts`) is sent to every model. It asks for a single JSON object holding two abstraction levels, `semantic` and `concept`, for the whole Blockly workspace in one call. The prompt tells the model that the Concept level is "usually ONE block for the entire program". Everything else (repair, schema, validation, three attempts) exists to make the model's JSON loadable in Blockly. Nothing measures whether the abstraction is _good_.

**What is wrong.**

1. The Concept rule does not scale. A mobile app has several screens, features and event handlers. One block erases the structure a reader needs, and the instruction anchors every model towards it.
2. The prompt asks for analysis ("Step 1") but gives the model nowhere to write it, so the analysis is either inert or hidden.
3. Many prompt rules are not enforced by code, and nothing checks the properties that matter most: that nothing is invented, nothing is dropped, and that the levels are coherent with each other.
4. Quality is unmeasured. Prompt edits are judged by eye on a few programs, and the cache hides run-to-run variance.

**What we propose.**

- **Phase 1** keeps the contract (Detail, Semantic, Concept) and the plugin unchanged, and fixes the prompt: level definitions by purpose, a size-aware multi-concept Concept level, a plan step that makes coverage checkable, few-shot examples, per-model parameters, a better retry, and new validators.
- **Phase 2** replaces the fixed pair of levels with a hierarchy built bottom-up from clusters of the program, so cost, latency and quality scale with program size, and an edit re-zooms only what changed.
- **Evals come first.** Section 6 defines a corpus graded by size, a set of automated checks (deterministic, metamorphic and LLM-as-judge), and a blind side-by-side human study that also calibrates the judge. Each design change is a hypothesis (section 7) accepted or rejected by those measurements.

**The target domain is App Inventor.** A Blockly workspace in App Inventor shows one screen at a time, so "one program" is one screen. Whether a whole-app view is feasible is an open technical question (section 3.4), treated as a feasibility study with acceptance criteria rather than a decision.

## 2. How the prompt works today

### 2.1 Request path

| Step | Where                            | What happens                                                                                                                                                                                               |
| ---- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Plugin `semantic_zoom_plugin.ts` | Saves the workspace with `Blockly.serialization.workspaces.save` the first time the user leaves Detail, and sends `{model, slug, workspaceJson}`. The user picks the model; the slug comes from `getSlug`. |
| 2    | Plugin `zoom_session.ts`         | Keeps each model's result for the last workspace. One request in flight at a time. The plugin shows `result[level]`, so one response serves both zoomed levels.                                            |
| 3    | Dashboard (demo runner only)     | Forwards to the proxy. Not relevant to prompting.                                                                                                                                                          |
| 4    | Proxy `routes/zoom.ts`           | `normalizeWorkspace` rewrites ids to `b1…bn`, variables to `v1…vn`, and drops positions. Cache lookup by `zoomCacheKey`.                                                                                   |
| 5    | `zoom.ts` `buildZoomMessages`    | Two messages: the static system prompt, and a user message with the slug, the snake-case slug and `JSON.stringify(workspaceJson, null, 2)`.                                                                |
| 6    | LiteLLM                          | Alias resolves to a provider. The zoom route passes no `temperature` or `maxTokens`, although the chat contract accepts both.                                                                              |
| 7    | `parseZoomResponse`              | Strips code fences and leading prose, parses, runs `repairZoomResult`, validates with `ZoomResponseSchema`, then `checkZoomResult`.                                                                        |
| 8    | Retry                            | Up to `MAX_ATTEMPTS = 3`. On failure the error text is appended to the user message. The previous output is not sent back.                                                                                 |
| 9    | Cache                            | Key = `KEY_VERSION`, model, slug, `sha256(ZOOM_SYSTEM_PROMPT)`, canonical workspace. Any prompt edit invalidates everything. The result is stored in canonical ids and `restoreIds` maps bindings back.    |

The streaming route (`/v1/zoom/stream`) runs the same loop and emits `attempt`, `token`, `done` and `error` events.

### 2.2 Prompt anatomy

| Section                  | Purpose                                                                                                                               | Also enforced in code?                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Role                     | "You describe the same program at two higher levels. You never write code."                                                           | No.                                                                                                                                         |
| Output format            | JSON-only, `semantic` and `concept`, each with `blockDefs`, `workspaceJson`, `bindings`. The example shows one block per level.       | Shape: yes (Zod). "JSON only": handled by fence and prose stripping.                                                                        |
| Step 1, analyse          | Four questions to think through.                                                                                                      | No, and the output format has no field for the answer.                                                                                      |
| Level 2 (Semantic) rules | One block per logical operation; type `zoom_<snake_slug>_<op>`; colour 30; structural Blockly primitives allowed where meaningful.    | Only the `zoom_` prefix and that each used type is defined. The slug part of the type, the colour, and "one per operation" are prompt-only. |
| Level 3 (Concept) rules  | "Usually ONE block"; type `zoom_<slug>_concept`; few essential fields; statement block; workspace uses only zoom blocks.              | Not enforced: neither the block count, nor the suffix, nor "only zoom blocks".                                                              |
| Block definition rules   | `zoom_` + `[a-z0-9_]`; allowed arg types; no extensions, mutator, `helpUrl`, `field_image`; labels never contain current values; ids. | Mostly: `ZoomBlockDefSchema` (forbidden keys, arg types, `%N` placeholders). Prompt-only: labels free of values, unique ids, id naming.     |
| Binding rules            | Which fields can be bound, how to reference Detail ids, nested holders, multiple refs.                                                | Largely: `validate.ts` (existing ids, field names, value kind) and `repair.ts` (moves a binding to the single nested holder).               |
| JSON encoding rules      | Escaping, no literal newlines, no fences.                                                                                             | Fence stripping only.                                                                                                                       |

### 2.3 Observations

These are grounded in the code and are the starting point for the improvement list.

1. **One prompt for all models.** No per-model prompt, parameters or output mode. A small local model and a frontier model get the same 80-line instruction and the same absent `temperature`.
2. **No sampling control.** `temperature` and `maxTokens` are not passed, so provider defaults apply. Run-to-run variance is unknown. A low default `max_tokens` on some provider routes would truncate large outputs, and the resulting retry message would be a bare JSON parse error (see 4.7).
3. **Both levels in one call.** A user who asks for Semantic pays for Concept in tokens and latency; in exchange, switching levels afterwards is free. This trade-off has never been measured.
4. **Analysis has nowhere to go.** "Step 1" tells the model to analyse and then "output ONLY the JSON". A non-reasoning model skips the step; a reasoning model does it out of sight. Either way it can't be inspected or scored.
5. **The example anchors the result.** The format example has a single block in `workspaceJson` per level (`s1`), a `LIMIT` field, and the wording "do something up to %1". Models copy shapes from examples, and this one models "one block, one number".
6. **"Usually ONE block" for Concept** is the core scalability defect (section 3.2).
7. **All zoom blocks have colour 30.** Semantic and Concept blocks look the same, and several concepts in one view would be indistinguishable.
8. **The whole workspace is sent, pretty-printed.** Indentation inflates the input for no gain; positions are dropped (good for caching), but this also drops the spatial grouping a user may have used to organise the program.
9. **Retries start from scratch.** The model gets the error message but not its own previous output, so it has to regenerate everything and may reintroduce the same mistake. A JSON parse error says nothing about where the problem is.
10. **Repair and retry hide weakness.** A repaired output counts as a success; the attempt count is shown in the plugin's info line but nothing aggregates it. The repairs list (`repairs`) is only logged.
11. **Prompt-only rules are never checked.** Colour, type-name prefix, Concept block count, "workspace uses only zoom blocks" at Level 3, labels containing current values, unique ids (`byId` silently keeps one when ids repeat).
12. **A binding with several Detail references is checked per reference but not for consistency.** `zoom_level_loader.ts` and `zoom_view_editor.ts` display the value of the first reference (`const [source] = binding.detail`) and write an edit to all of them. If the references hold different values, the first edit silently overwrites the others. No validator or prompt rule prevents this.
13. **Bindings can only expose number, text and dropdown fields** (`ZOOM_EDITABLE_FIELD_TYPES`). Checkbox, colour and component-dropdown fields, common in App Inventor, can't be exposed.
14. **Zoomed blocks are display-only.** The loader makes every block immovable and undeletable and disables all fields except bound ones. A zoom level is a read-only description with a few knobs; there is no drill-down from Concept to Semantic to Detail.
15. **The block registry is global.** `Blockly.common.defineBlocksWithJsonArray` registers types globally; the loader unregisters the previous level's types first. Any design with several levels visible at once (Phase 2 drill-down) needs unique types across levels, which the slug prefix and level suffix only partly provide.
16. **Stale references.** The contracts and plugin cite `DECISIONS.md` (#8, #10, #11), which does not exist.

## 3. What "better" means: abstraction levels as a construct

### 3.1 Definitions with measurable properties

The three levels answer different reader questions. Defining each by purpose, not by block count, makes it possible to judge whether a model has done the right thing.

| Level    | Reader question                                   | Content                                                                                         | Typical unit                                                   |
| -------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Detail   | How exactly does it do it?                        | Every block.                                                                                    | A block.                                                       |
| Semantic | What does each step do, and what can I tune?      | One block per logical operation; implementation hidden; tunable values exposed as bound fields. | An operation (a loop that sums, a check, a handler step).      |
| Concept  | What is this program for, and what are its parts? | The program's responsibilities or features; only the most important values exposed.             | A feature, screen-level responsibility or top-level behaviour. |

Properties of a good level, each of which becomes a metric in section 6:

- **Fidelity.** Nothing is claimed that the Detail program does not do (no hallucinated behaviour, no wrong conditions or values).
- **Coverage.** Everything the Detail program does is accounted for at that level (no silent omission), at least down to its top-level stacks.
- **Compression.** The level is smaller than the one below it, by an amount that makes it readable at a glance.
- **Monotonicity.** Detail > Semantic > Concept in size, and the Concept level is a grouping of the Semantic one, not an independent description.
- **Appropriate granularity.** The count of units fits the program: neither one block for a 10-handler app, nor one concept per block.
- **Label quality.** Labels describe behaviour, are specific, are consistent in verb style, and never contain current values.
- **Parameter exposure.** The values a user would want to change are bound, and only values that exist in Detail are bound.
- **Binding integrity.** Editing a bound field changes exactly the intended Detail field(s), and the Detail program still loads and runs.
- **Stability.** The same program gives structurally similar output on repeated runs, and an unrelated edit does not reshuffle the whole result.

### 3.2 Why "usually one block" fails

The Concept level is meant to be the top of the zoom. For a FizzBuzz program, one block is right: "FizzBuzz up to N". For a mobile app it is not:

- An App Inventor screen typically has several event handlers (for example a button click, a screen initialisation, a clock timer, a sensor change), some procedures and some global variables. These are separate responsibilities. Collapsing them into "the app" tells the reader nothing the slug did not.
- The unit of understanding of an app is its list of features. A reader scanning the Concept level wants three to seven items, not one and not forty.
- An LLM told "usually one block" will comply, even on a program where one block is wrong. The prompt, not the model, sets the ceiling.

The rule should be size-aware and structural. A starting hypothesis, to calibrate against human ratings rather than assume: the number of Concept blocks grows slowly with the number of top-level stacks and is bounded so the level stays glanceable (a working-memory motivation, Miller 1956, **to verify** applicability). For example, 1 for programs with a single top-level stack, then roughly one per distinct feature, rarely more than 7 to 9.

### 3.3 What a multi-concept Concept level looks like

For a dice app with a Roll button, a score counter and a reset: the Concept level is three top-level blocks ("Roll a die and show it", "Keep a running score", "Reset the game"), mostly unconnected, because they are separate event-driven behaviours and not a sequence. This differs from the current assumption in two ways:

1. The Concept workspace is a _set_ of top-level blocks, not a stack. The validator must allow that (it does today; the prompt must say it).
2. Each concept needs to be traceable to the Semantic blocks it summarises, so that the hierarchy is explicit (the `plan` field in section 4).

### 3.4 App Inventor: one screen per workspace

The ultimate goal is App Inventor, where each screen has its own blocks workspace and the user only sees one at a time **(to verify, including how App Inventor stores and loads each screen's blocks)**. Consequences:

- **Per-screen zoom is the natural unit.** The plugin sees the visible workspace only, so "the program" is a screen. The multi-concept problem is a per-screen problem first: a busy screen has many handlers.
- **Cross-screen behaviour is invisible** to a per-screen zoom: screen switching, start values passed between screens, shared storage. A Concept level for one screen cannot say what the whole app does.
- **Names are per screen.** Component names (`Button1`) and global variables are scoped to a screen. Two screens can have the same names for different things.

A whole-app view would add a level above the screens ("App: Screen1 = Menu, Screen2 = Game, Screen3 = Scores"). Three ways to get there, in order of how much they reuse:

| Option                          | Idea                                                                                                                                                 | Main risks and questions                                                                                                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Compose from screen concepts | Zoom each screen separately; an app-level node is generated from the per-screen Concept levels (and a deterministic list of screens and components). | Needs the other screens' blocks or their cached concepts. Whether the plugin can read other screens' blocks without opening them. Staleness when a screen changes.                            |
| B. Merged read-only workspace   | Serialise all screens into one Blockly JSON (ids and component names namespaced by screen) and zoom that.                                            | Does App Inventor's Blockly version support JSON serialisation (the plugin relies on it)? Id and name collisions. Context size. How to present a workspace that does not exist in the editor. |
| C. Static app map only          | Deterministic summary (screens, components, events, cross-screen calls) with no LLM, shown above the per-screen levels.                              | Cheap and exact, but not a semantic description. Useful as input to A.                                                                                                                        |

**Feasibility study (see roadmap phase 4).** Acceptance criteria: (1) the plugin, running inside App Inventor, can obtain every screen's blocks in the serialisation it needs, with a measured cost; (2) the token size of the largest realistic projects fits a model context with room for the answer; (3) ids and names can be made unambiguous; (4) a human study shows app-level descriptions are rated better than the best per-screen-only baseline. Recommendation: evaluate A first, since it reuses the per-screen pipeline and a hierarchical design (Phase 2) makes it a root node rather than a new mechanism.

## 4. Phase 1: improve the current design

Goal: better outputs with the same contract, same plugin, same three levels. Each item names the hypothesis it tests (section 7).

### 4.1 Restructure the prompt

Order sections by what the model needs to decide first: role, then what each level is for, then size guidance, then the output format, then the mechanical rules. Move rules that code already enforces into short bullet form (they are the error messages' job on retry), and keep the long text for the semantic judgement that only the prompt can carry: what to group, what to hide, what to expose.

A draft is in Appendix A.

### 4.2 Replace "usually one block" with a size-aware multi-concept rule

- The user message states computed structure: the number of blocks, the number of top-level stacks, and a one-line list of the top-level stacks (type and, for event handlers, the event). This is computed deterministically and gives the model what it needs to choose how many concepts there should be.
- The system prompt describes Concept as "the program's features", with an explicit size rule (for example one block for a single-stack program, otherwise one per distinct responsibility, up to about seven) and says Concept blocks may be independent top-level blocks.
- Distinct colours per concept (a small palette of hues, or a colour per concept index) so several concepts are distinguishable. Semantic and Concept levels use different hue families so the level is recognisable. The plugin could instead assign colours itself, which removes the rule from the prompt; whichever is chosen, it must not be left to chance.

### 4.3 Give the analysis somewhere to go: a `plan`

Add a first key, `plan`, to the response:

```json
{
	"plan": {
		"concepts": [
			{
				"id": "c1",
				"summary": "Roll a die and show the result",
				"operations": ["s1", "s2"],
				"detailStacks": ["b1", "b9"]
			}
		],
		"unassigned": []
	},
	"semantic": {},
	"concept": {}
}
```

- It turns "Step 1" into output that is generated before the levels (so it conditions them, a chain-of-thought effect) and into data the validators can check: every top-level Detail stack appears in some concept (coverage), every Semantic block appears under exactly one concept (coherence), `unassigned` is empty or justified.
- `ZoomResponseSchema` is a plain `z.object`, which drops unknown keys when parsing, so adding `plan` does not break the contract: the plugin never sees it. For evals the runner parses it separately. Keeping it in the stored result (an optional field) would allow showing it as a tooltip later; that is a product decision.
- Cost: a few hundred output tokens. Hypothesis H2 tests whether it pays for itself.

### 4.4 Few-shot examples

Two or three short examples, chosen to differ from each other, and none should look like a single-block answer:

1. A small teaching program (loop and a condition): one concept, three semantic blocks, two bindings.
2. An app-like program with three independent handlers: three concepts.
3. A program with a repeated constant, to show a binding with several Detail references.

Examples can be selected by program size (small programs get example 1 and 3, larger ones 2). Examples cost tokens on every request and shift the cache key, so H3 compares them to zero-shot per model. A reason to expect they help on weaker models: the current failures that `repair.ts` fixes (missing `nextStatement`, missing `%N`, binding on the wrong nested block) are exactly the mistakes a worked example demonstrates correctly.

### 4.5 One call or two

| Variant                                         | Idea                                                | Pros                                                        | Cons                                                                |
| ----------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------- |
| Current: one call, both levels                  | Semantic and Concept written together.              | One round trip; the levels are generated in context.        | Concept is free to disagree with Semantic; one failure fails both.  |
| One call with `plan` (4.3)                      | Plan, then both levels.                             | Explicit hierarchy; checkable coverage.                     | Longer output.                                                      |
| Two calls: Semantic, then Concept from Semantic | Concept sees only the Semantic result and the plan. | Coherence by construction; Concept call is small and cheap. | Two round trips; Concept can inherit Semantic's mistakes.           |
| Lazy: only the level asked for                  | The plugin asks for one level.                      | Lower cost per request when a user stops at Semantic.       | The contract and cache change (key per level); switching is slower. |

H4 compares the first three. The fourth is a product question and a contract change; it is relevant to Phase 2.

### 4.6 Per-model prompts and parameters

The seam is `buildZoomMessages`: give it the model and let it return the messages and the request parameters. Proposed changes:

- Prompts as versioned objects: `{ id, system, buildUser, params }`, with the id recorded in logs, Langfuse traces and eval results. A model alias maps to a prompt id with a default.
- `temperature` low (for example 0 to 0.2) for zoom unless the model rejects it. Use LiteLLM's parameter dropping where a provider does not accept it **(to verify)**.
- An explicit `maxTokens` sized from the input, so truncation is a clear error and not a confusing parse failure.
- A structured-output mode (JSON schema or JSON mode) for models that support it, with the existing parser as the fallback. This is an experiment: strict schemas can restrict models that would otherwise reason well, and the schema has to express the `%N` and binding rules that Zod enforces today.
- Include the prompt id in the cache key instead of hashing a single constant.

### 4.7 A better retry

- Send the previous output back as an assistant turn, followed by a user turn with the errors and an instruction to fix _only_ those. This keeps what was right and makes the correction local.
- Improve parse errors: report the character position and the surrounding text, and detect truncation (the output ends mid-string) separately from invalid JSON.
- Record per attempt: the error classes, the number of repairs by type and the token counts. A success on attempt 3 is a quality signal, not just a success.

### 4.8 New validators and prompt/code alignment

Each is a deterministic check that can run in `checkZoomResult` (and as an eval metric):

| Check                                                                    | Purpose                                                                                                                                         |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Concept block count and monotonicity (concept ≤ semantic ≤ Detail)       | Catches degenerate levels, such as Semantic that is as big as Detail.                                                                           |
| Coverage from `plan`                                                     | Every top-level Detail stack is in some concept.                                                                                                |
| Type naming: `zoom_<snake_slug>_…`, Concept suffix                       | The prompt asks for it; today only `zoom_` is checked.                                                                                          |
| Level 3 workspace uses only `zoom_` blocks                               | Stated in the prompt, unchecked.                                                                                                                |
| Unique ids within a level                                                | `byId` silently keeps one block when ids repeat, hiding bad bindings.                                                                           |
| Labels without literal values                                            | A label like "repeat up to 10" goes stale on the first edit. Match numbers and quoted strings from Detail against `message` and `tooltip` text. |
| Binding group consistency                                                | All `detail` references of a binding currently hold the same value (observation 12).                                                            |
| Remove `field_image` from the prompt or add it to the Zod forbidden list | The prompt and schema disagree on where the rule lives.                                                                                         |

### 4.9 Small changes worth doing before any experiment

These are cheap and low risk, and several of them make the baseline measurement itself more reliable:

1. Compact JSON for the Detail workspace in the user message (measure the token difference first).
2. Set `temperature` and `maxTokens` for zoom.
3. Log per-attempt outcomes and repair counts as structured fields.
4. Remove or move "Step 1".

Note that any prompt edit invalidates the whole cache (the key hashes the prompt) and starts every user's first zoom from a cold cache. That is the right behaviour, but it is a cost of iterating on the prompt in a deployed system; evals should run against the proxy without a cache.

## 5. Phase 2: a scalable system

Phase 1 still has a fixed pair of levels generated in one call for the whole program. It will degrade as programs grow: output size and latency grow with the program, the model has to hold the entire program in view to group it, and one bad part fails the whole result. Phase 2 changes the structure.

### 5.1 Tree of abstractions

Think of the zoom result as a tree whose leaves are the Detail stacks and whose internal nodes are descriptions of their children:

- **Level 0 (Detail):** blocks.
- **Level 1 (Semantic):** one node per logical operation (one or more consecutive blocks or a handler body).
- **Level 2 and up (Concept):** groups of lower nodes, recursively, until the top has a glanceable number of nodes (about seven).

The depth depends on the program. A FizzBuzz program has a root with three children, one level of grouping. A multi-handler screen has features, each with operations. A whole App Inventor project (section 3.4) adds a root above the screens.

### 5.2 Pipeline

| Stage                 | How                                                                                                                                               | Notes                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1. Parse              | Deterministic: top-level stacks, event handlers, procedures, globals, components used, sizes. Reuses `saved-blocks.ts` (`allBlocks`, `byId`).     | Free and exact. Its output is both the model's outline and the ground truth for coverage. |
| 2. Cluster            | Partition stacks into concepts: deterministic hints (shared variables, a handler and the procedures it calls) plus an LLM call to name and merge. | Small call (an outline, not the program). Decides N.                                      |
| 3. Zoom each cluster  | One call per cluster: its Detail stacks in, its Semantic blocks and bindings out. Parallel.                                                       | Output size and latency bounded by cluster size. Cached by the cluster's content hash.    |
| 4. Compose            | Build each higher level from the level below (not from Detail), by a call per parent node or by one call over the child labels.                   | Coherence by construction. Cheap because inputs are labels, not blocks.                   |
| 5. Assemble and check | Merge node results, run validators (coverage, uniqueness, binding integrity), repair per node, retry only the failing node.                       | A bad cluster costs one small retry, not a whole-program retry.                           |

Consequences:

- **Incremental re-zoom.** Editing one handler changes one cluster's hash, so the model is called for that cluster and its ancestors, not for the program. Today any structural edit changes the whole-workspace cache key.
- **Parallelism and streaming.** Clusters run concurrently; the stream can show nodes as they complete.
- **Size ceiling.** A very large screen no longer needs to fit one prompt.
- **Different models per stage.** A cheap model for naming, a stronger one for composing.

### 5.3 Contract and plugin changes (sketch)

Today `ZoomResponse` is exactly `{semantic, concept}` and the plugin's `ZoomLevel` is `'detail' | 'semantic' | 'concept'`. Two shapes are possible:

| Shape                   | Contract                                                                                      | Plugin                                                                         | When                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| A. N levels             | `levels: ZoomLevel[]` ordered from Detail upwards, each level a flat set of top-level blocks. | The level control gets N stops; `ZoomView.show` is unchanged per level.        | First step. Smallest change that removes the fixed pair.                              |
| B. Tree with drill-down | Nodes with `children` and `covers` (Detail ids); a view shows a chosen frontier of the tree.  | Expand and collapse a concept into its children; mixed levels visible at once. | Later. Needs unique block types across levels (observation 15) and a layout strategy. |

Compatibility: keep `semantic` and `concept` as aliases for the second and last levels of shape A so existing consumers continue to work. Streaming events gain a node id and a `partial` result so the plugin can show progress per cluster.

The loader's treatment of zoomed blocks as read-only is a feature (zoomed blocks are descriptions), but drill-down would need to decide what clicking a concept does.

### 5.4 Cost and latency model (to be measured, not assumed)

| Quantity               | Phase 1 (one call)         | Phase 2 (clusters)                                     |
| ---------------------- | -------------------------- | ------------------------------------------------------ |
| Input tokens           | O(program)                 | O(program) in total, split across calls, plus outlines |
| Output tokens per call | O(program) for both levels | O(cluster size)                                        |
| Wall-clock latency     | grows with output length   | roughly the slowest cluster plus compose               |
| Cost of a local edit   | whole call                 | one cluster plus ancestors                             |
| Retry cost             | whole call                 | one node                                               |
| Total calls            | 1 to 3                     | clusters + composes (more calls, each smaller)         |

Phase 2 is only worth it if it improves quality or latency on large programs (H5). On small programs it is probably slower and more expensive than one call, so the pipeline should fall back to the Phase 1 path below a size threshold.

### 5.5 Migration

1. Build the eval harness and baseline on the current prompt (roadmap phase 0).
2. Ship Phase 1 changes behind a prompt id; compare with evals.
3. Prototype the pipeline as a separate route or a flagged mode, producing shape A. Keep `/v1/zoom` and `/v1/zoom/stream` for the current clients.
4. Decide on shape B and the App Inventor whole-app option from the studies.

## 6. Evaluation framework

### 6.1 Principles

- **Evaluate before changing.** Baseline the current prompt on the corpus first; every later claim is a difference from it.
- **Freeze, version and record.** The corpus, prompt ids, model aliases, parameters and the judge prompt are all versioned. Every run stores raw outputs, so metrics can be recomputed when a validator or rubric changes.
- **Report by model and by size bucket,** never one average. A prompt that helps on small programs and hurts on large ones must show up as such.
- **Quality, cost and latency together.** Report attempts, repairs, tokens, dollars and wall-clock next to quality scores.
- **Separate what is cheap from what is expensive.** Deterministic checks run on every change; LLM judging runs on demand or nightly; human study runs per major design decision.
- **No test-set tuning.** Keep a held-out set that prompt authors do not look at.

### 6.2 Corpus

| Tier | Size (blocks)                | Source                                                                                    | Purpose                                                    |
| ---- | ---------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| S    | about 5 to 15                | Hand-written teaching programs (FizzBuzz, countdown, sum of a list, greeting).            | Fidelity and binding basics; where one concept is right.   |
| M    | about 20 to 60               | Hand-written plus simplified real examples: games, calculators, quizzes.                  | Multi-operation Semantic level; first multi-concept cases. |
| L    | about 60 to 200              | App Inventor screens from tutorials and sample projects (check licences **(to verify)**). | The target regime for a single screen.                     |
| XL   | 200 and above                | The largest real screens available.                                                       | Scaling behaviour and context limits.                      |
| XXL  | whole apps (several screens) | Only if section 3.4 shows it is feasible.                                                 | App-level node.                                            |

Construction notes:

- **Synthetic compositions.** Concatenate k independent small programs into one workspace: the expected number of concepts is at least k. This gives ground truth for multi-concept without annotation.
- **Mutations.** Change a literal, rename a variable, add a handler, swap the order of top-level stacks. These drive the metamorphic tests (6.5).
- **Golden annotations** on a subset (about 30 programs, balanced by tier), written by a person: acceptable range for the number of concepts, a list of values that must be exposed as bindings, and a list of behaviours that must be mentioned. Annotation costs time, so annotate where it will be used: reference-based judging and binding recall.
- **Hold-out.** About a third of the corpus is hidden from prompt iteration.
- **Provenance and privacy.** Record the origin of every program. Do not include student projects without consent.

Starting size: 40 to 60 programs with a spread of tiers is enough for the deterministic suite and for a first human study. Multi-sample metrics (stability) need k = 5 runs per program per variant.

### 6.3 Failure taxonomy

One shared vocabulary for automated tags, judge output and human error flags:

| Code | Failure                   | Example                                                          |
| ---- | ------------------------- | ---------------------------------------------------------------- |
| F1   | Hallucinated behaviour    | A concept says "saves the score" where nothing saves anything.   |
| F2   | Omission                  | A handler is absent from every level.                            |
| F3   | Over-compression          | Ten behaviours merged into one vague block.                      |
| F4   | Under-compression         | Semantic is a re-drawing of Detail.                              |
| F5   | Wrong grouping            | Unrelated handlers in one concept; one feature split across two. |
| F6   | Misleading or vague label | "Do the thing".                                                  |
| F7   | Value leak in a label     | "Repeat up to 10".                                               |
| F8   | Missing or wrong binding  | The limit is not exposed, or editing it changes the wrong block. |
| F9   | Levels incoherent         | Concept does not summarise Semantic.                             |
| F10  | Structural failure        | Does not load in Blockly; invalid JSON; truncated.               |
| F11  | Redundant levels          | Semantic and Concept are essentially the same.                   |
| F12  | Wrong count of concepts   | One for a 10-handler app; seven for FizzBuzz.                    |

### 6.4 Automated evals, deterministic (no LLM in the loop)

All are computed from stored outputs, so they can be re-run when a validator changes.

| ID  | Metric                         | How it is computed                                                                                                                                                                                           | Level   | Proposed target (provisional) |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ----------------------------- |
| D1  | Schema validity rate           | Fraction of runs whose final output passes `ZoomResponseSchema` and `checkZoomResult`.                                                                                                                       | both    | at least 99%                  |
| D2  | First-attempt validity         | Fraction valid on attempt 1, before repair and retry.                                                                                                                                                        | both    | track, raise over time        |
| D3  | Attempts per success           | Mean attempt number of the successful attempt.                                                                                                                                                               | both    | at most 1.2                   |
| D4  | Repair rate by type            | Count of `repairs` per run, grouped by repair kind (`nextStatement`, placeholders, binding moved).                                                                                                           | both    | falling                       |
| D5  | Loadability                    | Load each level's `blockDefs` and `workspaceJson` into a real Blockly workspace (headless, as `ZoomLevelLoader.load` does) and record errors. Checks what Zod cannot: that Blockly accepts it.               | both    | 100% of valid outputs         |
| D6  | Binding validity               | Every binding's block, field and Detail references exist and have a compatible kind (already in `validate.ts`; here reported as a rate).                                                                     | both    | 100%                          |
| D7  | Binding round trip             | Programmatically edit each bound field in the loaded zoom view, run `ZoomViewEditor`'s logic, and check that the intended Detail fields changed, nothing else changed, and the Detail workspace still loads. | both    | 100%                          |
| D8  | Binding consistency            | For multi-reference bindings, fraction whose references initially hold the same value (observation 12).                                                                                                      | both    | 100%                          |
| D9  | Binding recall (golden subset) | Fraction of annotated "must be exposed" values that some binding reaches.                                                                                                                                    | both    | at least 80%                  |
| D10 | Binding precision              | Fraction of bindings that target values a human annotated as sensible to expose (golden subset), or that target literals rather than structural fields.                                                      | both    | at least 90%                  |
| D11 | Coverage                       | From `plan` (4.3) or, in the current design, by tracing bindings: fraction of top-level Detail stacks assigned to a concept. Without `plan` the baseline can only measure binding reach.                     | concept | 100% of stacks                |
| D12 | Compression ratio              | Block count of the level divided by Detail block count.                                                                                                                                                      | both    | report; targets from data     |
| D13 | Monotonicity                   | Detail > Semantic ≥ Concept in block count, and Concept count ≤ Semantic count.                                                                                                                              | both    | 100%                          |
| D14 | Concept count versus size      | For each program, concept count against top-level stack count; compare with the golden range and with the synthetic k.                                                                                       | concept | within golden range           |
| D15 | Synthetic composition recall   | For compositions of k independent programs, the fraction of runs with at least k concepts.                                                                                                                   | concept | at least 90%                  |
| D16 | Naming and style rules         | `zoom_<slug>_` prefix, snake case, Concept suffix, unique ids, colour policy.                                                                                                                                | both    | 100%                          |
| D17 | Value leak                     | Labels, tooltips and messages that contain a literal value present in Detail (number or quoted string).                                                                                                      | both    | 0                             |
| D18 | Redundancy                     | Similarity of Semantic and Concept (same type multiset, or label overlap) above a threshold.                                                                                                                 | both    | low                           |
| D19 | Stability across samples       | k runs per program: variance of block counts, Jaccard overlap of block-type sets and of binding targets, edit distance between label sets.                                                                   | both    | track; compare variants       |
| D20 | Normalisation invariance       | Shuffle ids and positions in Detail (the proxy normalises them) and check the canonical result is identical for a deterministic stub, or equivalent (per D19) for a model.                                   | both    | no regression                 |
| D21 | Latency, tokens, cost          | Wall-clock, input and output tokens, dollars from Langfuse (LiteLLM already reports them).                                                                                                                   | both    | budget per tier               |
| D22 | Cache behaviour                | Hit on identical request, miss on changed prompt id, hit after a layout-only edit.                                                                                                                           | n/a     | as designed                   |

D5 and D7 need a Blockly runtime in Node. Blockly's headless workspace (not the SVG one) should allow it without a browser **(to verify in a short spike)**; if not, the plugin's own mocha tests in a browser are the fallback.

### 6.5 Metamorphic and behavioural evals

These check relations between outputs rather than absolute quality. They need no reference answer.

| ID  | Transformation of the Detail program      | Expected relation                                                                                             |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| M1  | Change a numeric literal                  | Same structure; the bound field shows the new value (labels do not contain the old value).                    |
| M2  | Rename a variable                         | Same structure; labels that mention the variable change consistently, or do not mention it.                   |
| M3  | Add an independent handler                | One more Semantic operation group; one more concept (or an explicit merge with a reason); the rest unchanged. |
| M4  | Reorder top-level stacks                  | Equivalent output (the proxy drops positions; order of top-level blocks can still differ).                    |
| M5  | Compose k independent programs            | At least k concepts, each containing the original's description.                                              |
| M6  | Delete a handler                          | A concept disappears; nothing else is invented.                                                               |
| M7  | Duplicate a program with a different slug | Same structure, different type prefixes.                                                                      |

Report the fraction of runs satisfying each relation, per model and tier. M3 and M5 directly test the multi-concept goal.

### 6.6 Automated evals, LLM as judge

A judge is useful for fidelity, granularity and label quality, which deterministic checks cannot see. It is also biased and must be calibrated against humans before it is trusted (6.8).

**Inputs given to the judge.** The Detail workspace in a compact textual form, a rendering of the level (labels and structure, plus the binding list), and, for the reference-based variant, the golden annotation. The judge never sees which prompt or model produced the output.

**Judge types.**

| ID  | Judge                            | What it does                                                                                                                                                                                                           | Notes                                                                                                                                             |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| J1  | Rubric scoring, per level        | Scores 1 to 5 for: fidelity, completeness, appropriate abstraction, granularity of concepts, label clarity, binding sensibility, coherence between levels, each with a short justification and failure codes from 6.3. | Same dimensions as the human form (6.7) so the two can be compared. Temperature 0.                                                                |
| J2  | Pairwise preference              | Given two outputs for the same Detail program, picks the better one overall and per dimension. Run both orders and keep only consistent verdicts.                                                                      | Controls position bias. Gives win rates and Bradley-Terry strengths.                                                                              |
| J3  | Claim-level faithfulness         | Decomposes the level into atomic claims ("loops until the counter reaches the limit") and checks each against the Detail program: supported, unsupported, contradicted.                                                | Gives a hallucination rate (F1) in the style of atomic-fact scoring. More expensive; use on a sample.                                             |
| J4  | Round-trip description           | A model that sees only the Concept level writes a description of the program; a second step compares that description to one made from Detail.                                                                         | Tests whether the Concept level preserves the gist. Sensitive to the describer, so fix it.                                                        |
| J5  | Question answering probes        | Generate questions about the Detail program (what happens when X; what is the limit; which events exist), answer them from each level alone, and score against answers from Detail.                                    | Measures information retained at each level and calibrated abstention ("not visible at this level"). Good for compression versus fidelity curves. |
| J6  | Coverage judge (reference-based) | Given the golden list of behaviours, checks which are present in the Semantic and Concept levels.                                                                                                                      | Complements D11 when there is no `plan`.                                                                                                          |
| J7  | Concept count judge              | Given the Detail program and the concept list, says whether the number and grouping are reasonable, and what it would change.                                                                                          | Qualitative; used to understand disagreements with D14.                                                                                           |

**Controls.**

- Judge from a different model family than the generator, and use at least two judges; report their agreement.
- Randomise order, hide identities, fix temperature, fix the judge prompt version.
- Check known biases: position, length (does a longer label list score higher?), self-preference.
- Spot check a sample of judgements by hand each time the judge prompt changes.
- Report judge-human agreement (6.8). A judge that does not agree with humans on a dimension is not used for that dimension.

A draft judge prompt is in Appendix B.

### 6.7 Human validation: blind side-by-side ratings

Purpose: the ground truth for "better", and the calibration set for the judge. It decides design questions that no automatic metric can, such as how many concepts feel right.

**What a reviewer sees.** A task page per item: the Detail program (the real Blockly rendering), then two or three candidate outputs, labelled A, B, C in random order, each shown in the plugin's own zoomed view at the Semantic and Concept levels. Neither the prompt, the model nor the attempt count is shown.

Rendering in the real view matters because layout, colour and block shape affect how readable an output is. The plugin's `ZoomSession` is built around a requester function, so a replay requester that returns a recorded `ZoomResponse` is a natural way to show stored outputs without calling a model **(to verify how plugin options expose it)**. The dashboard's demo runner already hosts the plugin and could host a rating mode.

**What a reviewer does.**

1. Rates each candidate on a 1 to 5 scale for each dimension (same as J1), per level where relevant:
   - Faithful: does it say only what the program does?
   - Complete: is anything important missing?
   - Right level of abstraction: neither too detailed nor too vague?
   - Concept grouping: is the number and grouping of concepts sensible?
   - Labels: are they clear and specific?
   - Controls: are the exposed values the ones you would change?
   - Useful overall: would this help a learner understand the program?
2. Picks a preferred candidate (or "tie") for each level, and gives an overall winner.
3. Flags failure types from the taxonomy (F1 to F12) and may add a comment.

Form fields are listed in Appendix C.

**Design.**

- **Items.** 60 programs (for example 20 S, 20 M, 15 L, 5 XL), 2 or 3 variants per item (baseline plus the variants being decided).
- **Assignment.** Each item is rated by at least three reviewers. Variants and presentation order are balanced (round-robin or Latin square) so each variant appears equally often in each position and each reviewer sees a mix of tiers.
- **Reviewers.** A mix of people who know Blockly or App Inventor (teachers, experienced students) and novices (the target audience). Record experience level; analyse by group. Include a few reviewers who have not seen the project.
- **Calibration and quality control.** Each reviewer does 3 warm-up items with known answers (a deliberately broken output, a deliberately perfect one). Include repeated items (about 10%) to measure intra-rater consistency, and attention checks.
- **Workload (estimate).** About 5 minutes per item for 2 to 3 candidates. 60 items × 3 raters = 180 item-views, about 15 hours in total, so six reviewers at about 2.5 hours each.
- **Sample size for a preference.** To detect a 60/40 win rate with 80% power at the 5% level takes about 200 independent comparisons; because ratings cluster by program, plan for more or use a mixed model. Treat this as a planning estimate, not a guarantee.
- **Analysis.** Pairwise outcomes with Bradley-Terry (or Elo) strengths and bootstrap confidence intervals; ratings with ordinal or mixed-effects models (random effects for reviewer and program); inter-rater reliability with Krippendorff's alpha; per-tier and per-experience breakdowns. Report effect sizes with intervals, not only significance.
- **Ethics and data.** Consent for reviewers; no personal data in programs; store ratings without names, with a reviewer code.

**Tooling sketch.** A rating page in `apps/dashboard` backed by its Postgres (reviewer code, item id, variant ids, ratings, flags, comments, timestamps), with CSV and JSON export. Out of scope for this document to build, and it must follow the dashboard's own rules (`apps/dashboard/AGENTS.md`).

### 6.8 Calibrating and using the judge

1. Run the judge on the same items humans rated.
2. Compute agreement per dimension (Spearman or weighted kappa for scores; accuracy and kappa for pairwise verdicts; agreement between judges).
3. For dimensions with adequate agreement (a threshold fixed in advance, for example weighted kappa of at least 0.6 **(provisional)**), the judge is used for cheap regression runs. For the others it is not used, or it is used only to flag items for human review.
4. Re-calibrate when the judge prompt, the judge model or the output format changes.

### 6.9 Online and product signals

Once a version is deployed, the plugin already knows several useful events, all without a rating form:

- Whether a zoom was shown, reverted ("Zoom failed") or abandoned (user returned to Detail within a few seconds).
- Attempts and cache hits (already in `ZoomInfo`).
- Whether the user edited a bound field, and how often.
- Whether the user zoomed a second time on the same program (a possible sign the first was unsatisfactory).
- An optional thumbs up or down on a zoom, with the prompt id attached.

Attach these as scores to Langfuse traces (LiteLLM already sends the generation there) so offline and online measures sit side by side. Privacy: do not log program contents without consent.

### 6.10 Metrics summary and gates

| Gate                  | When it runs                                 | What it runs                                                                                                          | Blocks a change if                                                    |
| --------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Replay (cheap, in CI) | Every pull request                           | Deterministic metrics (D1, D5 to D8, D12 to D13, D16, D17) on a frozen set of recorded model outputs. No model calls. | A validator or repair change breaks a recorded output.                |
| Live deterministic    | On demand and before merge of prompt changes | Run the corpus against chosen models with the candidate prompt; D1 to D22 and M1 to M7.                               | D1, D3, D5 to D8 regress; stability collapses.                        |
| LLM judge             | On demand and nightly                        | J1, J2 on a sample; J3 and J5 on a smaller one.                                                                       | Win rate against the baseline is significantly below 50% on any tier. |
| Human study           | Per major design decision                    | Section 6.7.                                                                                                          | Decision gates in section 7.                                          |

The replay gate fits the repository's CI rules (`.github/workflows/test.yml`; keep `pnpm test` and CI equivalent) because it needs no secrets and no network. The live and judge runs need model keys and cost money, so they stay outside the default `pnpm test`.

### 6.11 Where the harness lives

Proposed: `apps/llm-proxy/evals/`, or a new `apps/evals` package if it grows (it will need Blockly as a dependency and datasets). Contents:

- `corpus/` with programs (JSON), their tier, provenance and optional golden annotations.
- `prompts/` with the versioned prompt objects (4.6), shared with the proxy so the evals test exactly what runs in production.
- A runner that, for each program, prompt id and model, calls the model through the proxy's chat endpoint or LiteLLM using `buildZoomMessages` and `parseZoomResponse` directly (they are pure functions in `zoom.ts`), without the cache, and stores a record (Appendix D).
- Metric modules (deterministic, metamorphic, judge) that read records.
- A report generator producing a table per model and tier, with confidence intervals.
- Langfuse datasets and scores, so runs are visible next to production traces.

Conventions from `AGENTS.md` apply: license header on source files, exact dependency versions, `pnpm-lock.yaml` committed together with any `package.json` change, tests next to the code, new environment variables declared in `turbo.json` `globalPassThroughEnv` and in CI placeholders, secrets in gitignored `.env` files only.

## 7. Hypotheses and experiments

Each is stated so it can be rejected. Variants run on the same corpus, with at least two models of different strength.

| ID  | Hypothesis                                                                                                      | Variants                                      | Primary measures                                   | Decision rule (provisional)                                                           |
| --- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| H0  | The current prompt has measurable failures on M, L and XL programs that S programs hide.                        | Baseline only.                                | D1 to D4, D14, J1, human ratings by tier.          | Establishes the problem. If absent, Phase 1 is lower priority.                        |
| H1  | A size-aware, multi-concept Concept rule raises human-rated grouping and abstraction without lowering fidelity. | Baseline versus 4.2.                          | Human preference, J1 grouping, D14, D15, F12 rate. | Win rate above 50% with the interval excluding it on M and above; fidelity not lower. |
| H2  | Plan-then-generate improves coverage and coherence.                                                             | 4.2 versus 4.2 + `plan`.                      | D11, J1 coherence, F2 and F9 rates, tokens.        | Coverage gain justifies the extra tokens.                                             |
| H3  | Few-shot examples reduce retries and repairs, most for weaker models, at acceptable token cost.                 | Zero-shot, 1 example, 3 examples.             | D2 to D4, tokens, J1.                              | Gain on the weakest supported model without a loss on the strongest.                  |
| H4  | Generating Concept from Semantic (two calls) gives better coherence than one call, at higher latency.           | One call, one call + `plan`, two calls.       | J1 coherence, F9 and F11, latency, cost.           | Coherence gain beyond what `plan` already gives.                                      |
| H5  | Per-cluster generation (Phase 2) scales better in quality and latency than one call on large programs.          | Phase 1 best, Phase 2 prototype.              | D1, D12, D19, J1 by tier, latency, cost per edit.  | Better on L and XL; fall back to Phase 1 for small programs.                          |
| H6  | The LLM judge agrees with humans well enough to replace them for regression checks on some dimensions.          | Judge variants (J1, J2) versus human ratings. | Weighted kappa, pairwise agreement.                | Per-dimension agreement above the preset threshold.                                   |
| H7  | Low temperature and structured outputs improve stability and validity without hurting quality.                  | Default, low temperature, JSON schema mode.   | D1, D2, D19, J1.                                   | Improvement on validity and stability with no quality drop.                           |
| H8  | A whole-app level above screens is rated more useful than per-screen zooming alone for multi-screen apps.       | Per-screen only versus option A or B of 3.4.  | Human ratings on XXL items; feasibility criteria.  | Only pursued if the feasibility study passes.                                         |
| H9  | Colour and layout choices (distinct concept colours, automatic layout) improve human-rated readability.         | Colour 30 for all versus palette.             | Human rating of readability, task time.            | Small study; low cost.                                                                |

### Related work (pointers to verify before any publication)

- Cognitive Dimensions of Notations (Green and Petre, 1996): _abstraction gradient_ and _hidden dependencies_ frame what a level should hide and what it must not.
- Program comprehension theories, top-down and bottom-up (Brooks 1983; Soloway and Ehrlich 1984; Pennington 1987): readers form hypotheses about purpose and verify them in detail; the Concept level supports the first, the Detail level the second.
- Semantic zooming in interfaces (Perlin and Fox, 1993, Pad): different representations at different scales, not just geometric scaling.
- LLM-as-judge and its biases (Zheng et al., 2023, MT-Bench and Chatbot Arena; Liu et al., 2023, G-Eval); pairwise preference and Elo or Bradley-Terry ranking (Chatbot Arena work).
- Faithfulness evaluation of generated text: atomic-claim scoring (FActScore, Min et al., 2023) and question-answering based consistency checks (QAGS, Wang et al., 2020).
- Inter-rater reliability: Krippendorff's alpha, Cohen's kappa.

## 8. Roadmap

| Phase | Work                                                                                                                                                                                                                | Exit criteria                                                          | Size | Main risk                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---- | ---------------------------------------------- |
| 0     | Corpus (40 to 60 programs, tiers S to L, 15 to 30 golden), record format, runner, deterministic metrics D1 to D22 on the current prompt, Blockly headless spike, replay set for CI. Baseline on two or more models. | Baseline report by model and tier; H0 answered; replay gate in CI.     | M    | Corpus effort; headless Blockly may not work.  |
| 1a    | Small changes (4.9): compact JSON, temperature, maxTokens, per-attempt logging. New validators (4.8) as recorded-output tests.                                                                                      | No regression on D1 to D8; stability measured.                         | S    | Provider parameter quirks.                     |
| 1b    | Prompt restructure, multi-concept rule, `plan`, few-shot, better retry, prompt ids (4.1 to 4.7). Judge J1 and J2 built.                                                                                             | H1 to H3 and H7 evaluated with deterministic metrics and the judge.    | M    | Overfitting to the corpus; cache invalidation. |
| 2     | Human study (6.7): rating page, 60 items, calibration, analysis. Judge calibration (6.8).                                                                                                                           | Human decision on H1 to H4; judge agreement per dimension known.       | M    | Reviewer recruitment; page build.              |
| 3     | Phase 2 prototype behind a flag (5.2, shape A), with metamorphic tests M1 to M7 and incremental re-zoom.                                                                                                            | H5 answered on L and XL; fallback threshold chosen.                    | L    | Contract and plugin changes; added complexity. |
| 4     | App Inventor whole-app feasibility (3.4): how to read other screens, serialisation, sizes, id and name scoping, option A prototype.                                                                                 | Written feasibility result against the four criteria; H8 if it passes. | M    | Needs access to App Inventor internals.        |

Phases 1a and 2's page build can overlap with phase 0. Phase 3 should not start until phase 2 has produced human-validated judgement about what a good multi-concept Concept level looks like, because Phase 2 would otherwise optimise against an untested target.

## 9. Risks and open questions

**Risks.**

- **Overfitting to a small corpus.** Mitigate with a hold-out set, varied sources and fresh programs for each human study.
- **Judge bias and drift.** Calibrate against humans, use more than one judge, re-calibrate when anything changes.
- **Cost.** Multi-sample, multi-model, judged runs multiply quickly. Use tiers (6.10), sample for expensive judges, and cache model outputs in the eval store.
- **Cache churn.** Prompt edits invalidate production zoom caches; evals must bypass the cache and production changes should be batched.
- **Contract churn.** Phase 2 touches the shared contracts package and the plugin; keep the old shape working during migration.
- **Prompt-only rules drift** from code over time. Prefer enforcing a rule in code and keeping the prompt short.
- **Scope creep from the App Inventor goal.** Keep the whole-app question separate from per-screen quality.

**Open questions for the team.**

1. What is the intended reader of the Concept level: a learner, a teacher, a maintainer? It changes what "good grouping" means and who should rate.
2. Should the model place blocks (`x`, `y`) at all, or should the plugin lay out a level automatically? Removing positions from the model's job saves tokens and removes a failure class.
3. Should `plan` be stored and surfaced to the user, or discarded?
4. Which models must be supported, and what is the weakest one? It sets how far per-model prompts must go.
5. Is a per-level (lazy) request acceptable if it lowers cost, given that it changes the contract and the cache?
6. May bindings be extended to checkbox, colour and component fields (observation 13)? App Inventor needs them; the loader and editor would need matching changes.
7. Which App Inventor projects can legally and ethically go into the corpus?
8. What Blockly version and serialisation does App Inventor's editor use, and does it match what the plugin assumes?
9. `DECISIONS.md` is referenced by the contracts, plugin and proxy source but does not exist. Should the decisions it refers to (#8, #10, #11) be written down, since this work depends on them?

## Appendix A: Phase 1 system prompt (draft)

This is a draft for review, not a tested prompt. The placement of the multi-concept rule, the `plan` and the examples are the parts under test.

```text
You are the Semantic Zoom AI. You receive a Blockly workspace (the Detail level) and describe the same program at two higher levels of abstraction. Your output is only displayed: the program always runs from the Detail blocks, so you never write code and you never change behaviour.

## What each level is for

- Detail: how it works. Every block. You do not produce it.
- Semantic: what each step does and what can be tuned. One block per logical operation. Hide implementation detail (counters, temporary variables, plumbing). Expose the values a user might change as editable fields.
- Concept: what the program is for. One block per distinct feature or responsibility. Hide steps entirely. Expose only the most essential values.

## How many concept blocks

The user message gives the number of blocks and top-level stacks. Choose the number of concepts from the structure of the program:
- A single-purpose program, or one with one top-level stack: 1 concept.
- A program with several top-level stacks (for example several event handlers): one concept per distinct responsibility, normally 2 to 7. Group handlers that serve the same feature; do not merge unrelated ones; do not exceed 7 unless the program truly has more separate features.
Concept blocks may be independent top-level blocks. They do not need to connect.
Every top-level stack of the Detail program must belong to exactly one concept.

## Output

Respond with ONLY a JSON object, no prose and no code fences, with these keys in this order:

1. "plan": {"concepts": [{"id": "c1", "summary": "...", "operations": ["s1", ...], "detailStacks": ["<Detail block id>", ...]}], "unassigned": []}
2. "semantic": {"blockDefs": [...], "workspaceJson": {...}, "bindings": [...]}
3. "concept": {"blockDefs": [...], "workspaceJson": {...}, "bindings": [...]}

Block types: zoom_<snake_slug>_<operation> for Semantic, zoom_<snake_slug>_<name>_concept for Concept. Give every block in workspaceJson a short unique id ("s1", "s2" ... ; "c1", "c2" ...). Use a different colour for each concept block.

[Block definition rules, binding rules and JSON encoding rules: keep the current text, shortened, with the rules enforced in code moved to one-line bullets. Add: all "detail" references of one binding must hold the same value; labels and tooltips never contain a current value.]

[Two or three worked examples go here (section 4.4): a one-concept teaching program; a three-handler app with three concepts; a program with one value used in several Detail blocks.]
```

## Appendix B: Judge prompt (draft, rubric scoring J1)

```text
You are evaluating a "semantic zoom": a higher-level description of a Blockly program, made for learners.

You will be given:
1. DETAIL: the program, as Blockly JSON.
2. LEVEL: either "semantic" or "concept", shown as a list of blocks with their labels and the values they expose.
3. (optional) GOLD: notes by a person on what a good zoom must contain.

Score each item from 1 (very poor) to 5 (excellent). Justify each in one sentence that points to specific blocks or labels.
- fidelity: says only what the program does; no invented behaviour, no wrong values or conditions.
- completeness: nothing important in the program is missing at this level.
- abstraction: the right level of detail for LEVEL (semantic: operations; concept: features), neither too detailed nor too vague.
- grouping: the number of blocks and how they group the program is sensible.
- labels: clear, specific, consistent, no literal values in them.
- controls: the exposed values are the ones a user would want to change.

Then list failure codes that apply: F1 hallucinated behaviour, F2 omission, F3 over-compression, F4 under-compression, F5 wrong grouping, F6 vague label, F7 value in label, F8 missing or wrong binding, F11 redundant with the other level, F12 wrong number of concepts.

Do not reward length. Do not assume a block is correct because it sounds plausible; check it against DETAIL. Return JSON only: {"scores": {...}, "justifications": {...}, "failures": [...]}
```

For pairwise judging (J2), the same dimensions are used with two outputs, shown in both orders in separate calls; only verdicts that agree across orders are counted.

## Appendix C: Human rating form

Per item, per candidate (A, B, C), per level (Semantic, Concept):

| Field                      | Type                        |
| -------------------------- | --------------------------- |
| Faithful                   | 1 to 5                      |
| Complete                   | 1 to 5                      |
| Right level of abstraction | 1 to 5                      |
| Concept grouping           | 1 to 5 (Concept level only) |
| Labels                     | 1 to 5                      |
| Controls (exposed values)  | 1 to 5                      |
| Useful overall             | 1 to 5                      |
| Failure flags              | multi-select F1 to F12      |
| Comment                    | free text, optional         |

Per item: preferred candidate at the Semantic level, preferred at the Concept level, overall winner (each may be "tie"), confidence (low, medium, high), and time spent (recorded automatically). Per reviewer, once: experience with Blockly or App Inventor, and role (teacher, student, developer, other).

## Appendix D: Eval record (one per program, prompt, model and sample)

```json
{
	"runId": "2026-11-10-baseline",
	"program": { "id": "m-017", "tier": "M", "blocks": 42, "topLevelStacks": 3 },
	"prompt": { "id": "zoom-v1", "hash": "…" },
	"model": { "alias": "openrouter", "params": { "temperature": null, "maxTokens": null } },
	"sample": 1,
	"attempts": [
		{
			"n": 1,
			"rawText": "…",
			"usage": { "promptTokens": 0, "completionTokens": 0 },
			"latencyMs": 0,
			"repairs": [],
			"errors": []
		}
	],
	"result": { "plan": null, "semantic": {}, "concept": {} },
	"metrics": { "D1": true, "D3": 1, "D12": { "semantic": 0.3, "concept": 0.05 } },
	"judge": { "J1": { "scores": {}, "failures": [] } },
	"trace": { "langfuseTraceId": "…" }
}
```

Storing the raw text of every attempt lets validators and repair rules be re-evaluated later without new model calls.
