# Zoomed levels of `v0`, `v1` and `v2`, drawn: five programs, five models, 2026-11-08

Nothing here is a new measurement of the models: every zoom was stored by [`2026-11-07-baseline.json`](2026-11-07-baseline.json) (`v0` and `v1`) or [`2026-11-08-v2-baseline-2.json`](2026-11-08-v2-baseline-2.json) (`v2`, the rerun of the fixed prompt) and is only drawn here. No model was called. Pictures: [`2026-11-08-v0-v1-v2-screenshots/`](2026-11-08-v0-v1-v2-screenshots/) (144 PNGs, 2.2 MB). Manifest: [`2026-11-08-v0-v1-v2-screenshots.json`](2026-11-08-v0-v1-v2-screenshots.json). View them with `pnpm report results/2026-11-08-v0-v1-v2-screenshots.json` from `apps/evals`, which makes a gallery beside the JSON, with one column per prompt. Script: [`../screenshots/`](../screenshots/), run as `pnpm baseline:screenshots --results results/2026-11-07-baseline.json,results/2026-11-08-v2-baseline-2.json --prompts v0,v1,v2 --name v0-v1-v2-screenshots`. It is the same set as the earlier [`2026-11-07-baseline-screenshots`](2026-11-07-baseline-screenshots.md) with `v2` added.

## What was drawn

- **Programs and models** (chosen by the user on 2026-11-07, unchanged): FizzBuzz, Dice game, Bank account, Three unrelated programs, Tic-tac-toe win check; `claude-haiku-5.5`, `gemini-3.5-flash-lite`, `glm-5.3-flash`, `gemma-4-26b-a4b-it`, `qwen3-coder-next`.
- **Prompts:** `v0`, `v1` and `v2`, one stored run each: 75 runs. 71 had a zoom and 4 did not (all `qwen3-coder-next`: FizzBuzz `v0`, Bank account `v1`, Bank account `v2`, Three unrelated programs `v1`). Those have no pictures.
- 71 runs give 142 levels, of which 139 were drawn (3 do not load, below), and 5 Detail views: 144 PNGs.

How they were drawn is as for the earlier set: each level goes through the plugin's own `ZoomLevelLoader` into a real Blockly workspace in headless Chromium, default theme, no toolbox, cropped to its blocks.

## Measured from the pictures

|                                     | `v0`                                    | `v1`      | `v2`                                    |
| ----------------------------------- | --------------------------------------- | --------- | --------------------------------------- |
| Runs with a zoom                    | 24                                      | 23        | 24                                      |
| Levels drawn                        | 46                                      | 46        | 47                                      |
| Levels the plugin cannot load       | 2                                       | 0         | 1                                       |
| Overlapping top-level blocks        | 0                                       | 0         | 0                                       |
| Block colour                        | 44 brown, 2 mixed with built-in colours | all black | 43 black, 4 mixed with built-in colours |
| Semantic blocks per drawn level     | 3.4                                     | 4.8       | 8.0                                     |
| Semantic top-level blocks per level | 2.4                                     | 3.0       | 2.6                                     |
| Concept blocks per level            | 1.0                                     | 2.5       | 2.6                                     |

- **No overlap (D25) in any of the 139 drawn levels.**
- **The Semantic level of `v2` has about 66% more blocks than `v1`'s in this set (8.0 against 4.8) but fewer top-level stacks (2.6 against 3.0).** That is the chaining: the same operations are connected into stacks instead of left as separate blocks. Over all 200 runs the figures are 7.6 and 5.4 (+41%), see the `v2` write-up.
- **The one `v2` level that does not load** is `qwen3-coder-next`'s Semantic level of Three unrelated programs: Blockly refuses a connection because the model set `nextStatement` to a block type name (`zoom_…_print_count`) instead of `null`, which turns it into a connection type check. The same is true of all four `qwen3-coder-next` zoom-connect failures among the rerun's valid zooms that do not load (Countdown, Sum list, Three unrelated programs, Robot). It is uncommon: 5 of 182 valid `v2` zooms have any non-null connection type, as do 5 of 156 for `v1` and 12 of 168 for `v0`. The two `v0` failures are the `gemma-4-26b-a4b-it` ones already in the earlier write-up.
- **Block colour is still unset:** the zoom blocks of `v1` and `v2` render black (the four mixed `v2` levels are black zoom blocks beside built-in blocks that carry their own colour); `v0` renders brown because its prompt asks for hue 30.

## What I looked at, and saw

About ten of the 144 pictures, `v2` mostly, so this is a sample, not a review:

- **The stack problem you saw is gone in these.** FizzBuzz `v2`, `claude-haiku-5.5`, Semantic: one block, "count i from 1 to 100 by 1", with "print Fizz for multiples of 3, Buzz for multiples of 5, FizzBuzz for multiples of 15, otherwise the number" inside it. In `v1` the same model drew the loop and the print as two unconnected top-level blocks.
- **Tic-tac-toe `v2`, `claude-haiku-5.5`:** the Semantic level is three stacks, matching the program's three stacks, each a short chain of consecutive steps ("set the win result to not won", "check each winning line for three of the player's marks", "return the win result", and so on); the Concept level is three blocks ("check for a winner", "check for a full board", "set up the board and report the result"). In `v1` this model drew seven separate one-block stacks.
- **Bank account `v2`, `claude-haiku-5.5`:** two "define" blocks with their steps nested inside, then a four-block stack ("set the balance to 100", "deposit 50 into the account", "withdraw 500 from the account", "print the balance"); the numbers are editable fields, not text.
- **Dice game `v2`, `glm-5.3-flash`** and **Three unrelated programs `v2`, `gemma-4-26b-a4b-it`** read sensibly: short chained steps with editable numbers, and three concept blocks, one per program.
- **A weaker model's `v2` zoom is valid but less abstract.** Tic-tac-toe `v2`, `qwen3-coder-next`: the Semantic level has 37 blocks in three stacks and includes built-in value blocks ("check row 1 [i]", "check column 2 [i]"), close to a copy of the program; the Concept level has four blocks, one of them "announce 'X wins'", which repeats a Detail text and is not a concept. This agrees with the `v2` write-up's finding that the models `v2` newly makes valid write poorer plans and counts.
- **The colours are black**, as above.

## Limits

- The rendering is the default Blockly theme, not the host's.
- A level that fails to load is shown as an error, not as the empty view a user would see.
- I looked at a sample of the pictures, not all of them, and no judge or person has rated any of it. Whether the Semantic level of `v2` is the right size, and whether its abstractions are better, is still open; this set is for a person to look at.

## Outcome

Nothing is decided by this write-up. It adds one finding to the `v2` picture: `qwen3-coder-next` sometimes writes block type names where `null` belongs in `previousStatement` and `nextStatement`, which is the cause of most of its valid zooms that do not load. A proxy that sets these to `null` (the blocks are display-only, so their connection types carry no meaning) was the candidate fix. It was made afterwards, as a repair in the proxy (`clearConnectionTypes` in `repair.ts`): re-scoring the stored `v2` rerun with it leaves 182 of 200 valid and takes the valid zooms that do not load from 6 to 2. The pictures here are of the stored zooms as they were drawn, before the repair, so the one level that does not load is still shown as it was.
