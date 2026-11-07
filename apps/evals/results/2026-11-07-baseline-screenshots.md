# Baseline zooms, drawn: five programs, five models, 2026-11-07

Nothing here is a new measurement of the models: every zoom was stored by [`2026-11-07-baseline.json`](2026-11-07-baseline.json) and is only drawn here. No model was called. Pictures: [`2026-11-07-baseline-screenshots/`](2026-11-07-baseline-screenshots/) (97 PNGs, 1.5 MB). Manifest: [`2026-11-07-baseline-screenshots.json`](2026-11-07-baseline-screenshots.json). View them with `pnpm report results/2026-11-07-baseline-screenshots.json` from `apps/evals`, which makes a gallery beside the JSON. Script: [`../screenshots/`](../screenshots/), run as `pnpm baseline:screenshots`.

## What was drawn

- **Programs** (chosen by the user): FizzBuzz, Dice game, Bank account, Three unrelated programs, Tic-tac-toe win check.
- **Models** (chosen by the user): `claude-haiku-5.5`, `gemini-3.5-flash-lite`, `glm-5.3-flash`, `gemma-4-26b-a4b-it`, `qwen3-coder-next`.
- **Prompts:** `v0` and `v1`, one stored run each: 50 runs. 47 had a zoom and 3 did not (`qwen3-coder-next`: FizzBuzz `v0`, validation; Bank account `v1`, schema; Three unrelated programs `v1`, validation). Those 3 have no pictures.
- Each program's Detail view, then each run's Semantic and Concept level: 47 runs give 94 levels, of which 92 were drawn (2 do not load, below), and 5 Detail views: 97 PNGs.

## How they were drawn

Each level is loaded into a real, rendered Blockly workspace (13.4.0) in headless Chromium by the plugin's own `ZoomLevelLoader`: its block definitions are registered, the workspace is loaded, bound fields take their current Detail values, and the top-level blocks are arranged before they are locked. So a picture is what the plugin would show for that stored zoom. The Detail programs are the prepared (canonical-id) programs the model was given, laid out with `cleanUp` because the canonical form has no positions. Default theme, no toolbox. Each picture is cropped to its blocks and shrunk only if it would exceed 1800 by 2600 pixels.

## Measured from the pictures

- **Overlap (D25): 0 of the 92 drawn levels** have top-level blocks that overlap after the loader's arrange step. This is the first measurement of D25.
- **Does not load (the plugin's own loader): 2 of 92 levels**, both `gemma-4-26b-a4b-it` `v0` Semantic levels: FizzBuzz (`controls_if` missing a `DO` connection) and Tic-tac-toe (a zoom block missing an `output` connection). Both are among the 6 zooms the baseline write-up already counted as valid but not loading; the plugin would drop such a level.
- **Block colour:** all 46 `v1` levels are black. 44 of 46 `v0` levels are one colour, `#a5805b` (hue 30, which `v0`'s prompt asks for); the other 2 mix it with the colours of built-in blocks. So the baseline write-up's "every zoom block renders black" holds for `v1`, not for `v0`.
- **Concept blocks per level:** `v0` drew exactly 1 in all 24 valid runs. `v1` drew 1 in 5 runs (the five FizzBuzz runs, a single-stack program), 2 in 2 runs and 3 in 16 runs.

## What I looked at, and saw

Only about eight of the 97 pictures, so this is a sample, not a review:

- FizzBuzz `v1`, `claude-haiku-5.5`, Semantic: the loop block is drawn as "count from 1 to 100 and do" with nothing inside it, and the "say Fizz, Buzz, FizzBuzz or the number" block is a separate top-level block, not in the loop. The two are not connected.
- FizzBuzz `v0`, `glm-5.3-flash`, Semantic: one very long single-line label, so the picture is drawn at reduced scale and is hard to read; in the plugin the block would be very wide.
- Tic-tac-toe `v1`, `claude-haiku-5.5`, Semantic: seven separate one-block stacks, one of them "announce the outcome: X win [X wins] O win [O wins] draw [A draw] otherwise [Keep playing]": the Detail text is both in the label and in the editable fields.
- Tic-tac-toe `v1`, `claude-haiku-5.5`, Concept: three blocks that read sensibly ("detect a player's three-in-a-row win", "detect a draw when the board is full", "run the game: set up the board and announce the result").
- The Detail views are the real programs; the 203-block Tic-tac-toe program is a long tall picture.

## Limits

- The rendering is the default Blockly theme, not the host's. The plugin's own view may differ in theme and size.
- A level that fails to load is shown as an error, not as the empty view a user would see.
- No judge or person has rated any of this. What a good Concept level looks like is still the open question of phase 1 (plan v3, sections 7 and 8).

## Outcome

Nothing is decided by this write-up.
