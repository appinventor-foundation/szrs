# Colour from anchors, drawn on one stored run: Dice game, `claude-haiku-5.5`, `v2`, 2026-11-08

**This is not a measurement of any model.** The zoom is the stored one from [`2026-11-08-v2-baseline-2.json`](2026-11-08-v2-baseline-2.json); no model was called and nothing was spent. It shows what the plugin's new colour step does with a plan, and what the default colour looks like.

The stored `v2` plan has no `covers`, so the Semantic anchors were **written by hand** (`s1: b1` the procedure, `s2: b3, b2` the random number, `s3: b6` the print, `s4: b8, b9`, `s5: b13`). The Concept anchors are the stored plan's own: the first stack of each concept (`c1: b1`, `c2: b8`). Made with `pnpm baseline:screenshots --results results/2026-11-08-v2-baseline-2.json --programs dice-game --models claude-haiku-5.5 --prompts v2 --covers <covers.json> --name colour-spike`.

Two sets, three pictures each (the Detail program, then the two levels):

- [`2026-11-08-colour-spike`](2026-11-08-colour-spike/): the hand-made covers. Semantic colours `#995ba5` (procedure), `#a55b80` (variables), `#5b67a5` (math), `#5ba58c` (text), the same as the Detail blocks they stand for.
- [`2026-11-08-colour-spike-default`](2026-11-08-colour-spike-default/): covers that name no Detail block (`b999`), so the Semantic blocks keep the proxy's default `#7d8590`. Its Concept level is the same as in the first set.

## What I looked at, and saw

I opened four pictures (the Detail program, both levels of the first set, the Semantic level of the second).

- Each zoom block has the colour of its anchor, in a real rendered workspace, with the anchor read from a rendered Detail workspace. 0 overlaps.
- The default grey is readable (white text) and is not one of Blockly's category colours.
- **A limit:** the two concepts are different colours, purple and pink, because `c1` lists a procedure first and `c2` a variable setter first. Both are "a feature of this program"; the colour says what the first stack is, not what the concept is. That is the convention of plan v2 section 4.3 (the anchor decides), and D24 is what would measure it. This is one program and one run; I do not know how often it happens.

## Limits

- One program, one model, one stored run, covers by hand. It says the loader step works with a rendered Detail, not that a model gives good anchors.
- The default colour was chosen by eye on these pictures; the user has not confirmed it.
