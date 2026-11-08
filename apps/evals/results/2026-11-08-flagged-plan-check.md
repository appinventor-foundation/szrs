# The zooms the plan checks would flag, drawn: two models, eight programs, 2026-11-08

Nothing here is a new measurement of the models: every zoom was stored by [`2026-11-08-v2-baseline-2.json`](2026-11-08-v2-baseline-2.json) (the rerun of the fixed `v2`) and is only drawn here. No model was called. Pictures: [`2026-11-08-flagged-plan-check/`](2026-11-08-flagged-plan-check/) (32 PNGs). Manifest: [`2026-11-08-flagged-plan-check.json`](2026-11-08-flagged-plan-check.json). View them with `pnpm report results/2026-11-08-flagged-plan-check.json` from `apps/evals`. Script: `pnpm baseline:screenshots --results results/2026-11-08-v2-baseline-2.json --programs countdown,sum-list,shopping-receipt,guessing-game,grade-report,tic-tac-toe,fizzbuzz,dice-game --models gpt-5.4-nano,qwen3-coder-next --prompts v2 --name flagged-plan-check`.

It was made to answer one question before the plan checks were built (plan v3, section 5, "Plan checks"): are the zooms the two rules would flag visibly worse than the ones they would not? The rules: **A**, the plan lists every top-level Detail block in exactly one concept; **B**, the Concept level has at least one block and no more than the program has top-level stacks.

## What was drawn

The nine zooms of the rerun that break A or B (all `gpt-5.4-nano` and `qwen3-coder-next`; eight are programs with one Detail stack, one is Tic-tac-toe with three), and, as controls, the same two models' zooms of FizzBuzz and Dice game, which break neither. Three of the 16 runs have no zoom (`qwen3-coder-next` on Shopping receipt and Grade report, `gpt-5.4-nano` on Tic-tac-toe, all invalid in the rerun). Two Semantic levels do not load in the plugin (`qwen3-coder-next`, Countdown and Sum list: block type names in the connection types, since fixed in the proxy by a repair; the pictures show the stored zooms as they were). Drawn as for the earlier sets.

| Program          | Model              | Stacks | Concept blocks | Rule A  | Rule B  |
| ---------------- | ------------------ | ------ | -------------- | ------- | ------- |
| Countdown        | `gpt-5.4-nano`     | 1      | 1              | flagged |         |
| Countdown        | `qwen3-coder-next` | 1      | 3              |         | flagged |
| Sum list         | `gpt-5.4-nano`     | 1      | 4              | flagged | flagged |
| Sum list         | `qwen3-coder-next` | 1      | 4              |         | flagged |
| Shopping receipt | `gpt-5.4-nano`     | 1      | 1              | flagged |         |
| Guessing game    | `gpt-5.4-nano`     | 1      | 4              | flagged | flagged |
| Guessing game    | `qwen3-coder-next` | 1      | 3              | flagged | flagged |
| Grade report     | `gpt-5.4-nano`     | 1      | 4              | flagged | flagged |
| Tic-tac-toe      | `qwen3-coder-next` | 3      | 4              |         | flagged |

## What I looked at, and saw

I opened seven pictures, so this is a sample, not a review.

- **Rule B flags zooms that are visibly worse in the way the prompt warns about.** On a program with one Detail stack the Concept level is the steps of that stack as three or four separate blocks, not concepts. `gpt-5.4-nano`, Guessing game: "Set up secret, bounds (low/high), and try counter", "Repeat guesses until the guess equals the secret", "Count tries and narrow the guess range using midpoint logic", "Print the number of tries it took", for a program that is one stack of 42 blocks. `gpt-5.4-nano`, Grade report: "Create score list and sum them", "Compute the average score", "Map average to a letter grade", "Print average and letter grade". `qwen3-coder-next`, Sum list: "create list of numbers", "set total to zero", "sum all numbers in the list", "print the final total". `qwen3-coder-next`, Countdown: "initialize count to 10", "loop while count > 0" (with print and decrease inside it), "announce liftoff". Four separate top-level blocks read in order imply a sequence, which Concept blocks do not have, and they repeat the Semantic level instead of abstracting it.
- **The controls are what a Concept level should be.** `gpt-5.4-nano`, Dice game, three stacks and three concept blocks: "roll dice and show the result", "update running score from the roll", "reset the game score". `gpt-5.4-nano`, FizzBuzz, one stack and one block: "FizzBuzz from 1 to 100".
- **Rule A alone (Countdown and Shopping receipt, `gpt-5.4-nano`) I did not open.** The manifest says each has one concept block, which is the right count for a one-stack program, so the plan is what is wrong there, and the plan is internal.

## Limits

- Seven of 32 pictures, and no judge or person has rated any of it.
- The two models are the two weakest; nothing here says what the rules do to a model that does not break them (the stored runs say it: `v1` trips neither rule on any valid zoom, `v2` only these nine).
- The pictures are the default Blockly theme, of the stored zooms before any later repair.

## Outcome

It supports building rule B, and says rule A on its own flags zooms that look fine. With a fallback (the flagged zoom is kept if asking again does not help) A's only cost is an extra call, so both were built; A can be made warning-only. See plan v3, section 5, "Plan checks, with a fallback".
