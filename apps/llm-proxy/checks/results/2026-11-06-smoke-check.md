# Zoom smoke check, 2026-11-06

Raw results: [`2026-11-06-smoke-check.json`](2026-11-06-smoke-check.json). Screenshots of every level: [`2026-11-06-smoke-check/`](2026-11-06-smoke-check/) (29 pictures, kept for looking at by hand). Run `pnpm report` in `apps/llm-proxy` for a page that shows them with the numbers. The script is [`apps/dashboard/scripts/smoke-zoom.ts`](../../../dashboard/scripts/smoke-zoom.ts) and the steps to run it are in [`../README.md`](../README.md).

## What was run

The `v1` prompt (made the proxy's default for the run only; the committed default is still `v0`), through the real demo runner with real model calls, on two models. The aliases resolved to `deepseek-v4.1-flash-1017` and `glm-5.3-flash`, both through OpenRouter, both reasoning models. Five programs went through the runner. A sixth, in a custom block set, went straight to the proxy, because the runner registers only core Blockly blocks and cannot load it.

| Program           | Blocks | Stacks | What it tests                                            | Expected concepts |
| ----------------- | ------ | ------ | -------------------------------------------------------- | ----------------- |
| FizzBuzz          | 28     | 1      | One purpose in one stack                                 | 1                 |
| Countdown         | 14     | 1      | A bound number (the 10) edited at the zoomed level       | 1                 |
| Dice game         | 14     | 3      | Three separate stacks: several concepts, laid out        | 3                 |
| Greeting function | 8      | 2      | A procedure defined in one stack and called from another | 1 to 2            |
| Repeated value    | 10     | 2      | One value (7) in two blocks                              | 1 to 2            |
| Custom block set  | 9      | 3      | No core block names anywhere (proxy only)                | 3                 |

The check ran against the test database (`dashboard_test`), never the dev one. The whole thing was run twice: the first run's "values in labels" measure was wrong (it read the values shown in editable fields as if they were label text), so that run's data was discarded, apart from comparing counts. The numbers below are from the second run.

## Findings

**It works end to end.** All 12 zooms, 10 through the runner and 2 through the proxy, succeeded on the first attempt. There were no browser errors, and the proxy's log shows one record per attempt with the prompt id (`v1`), outcome, usage, the program's size and the model's plan, which the report reads.

**Layout is right in a real browser.** No overlapping blocks and none off screen, at either level, in any run, including the three-stack program. This is the first check of the `cleanUp()` change outside a unit test, and it covers a level shown again after Detail.

**Every zoom block is black.** Blockly draws a block with no colour as black, and none of the models set a colour, so the worry that a model might invent misleading colours did not happen. But the default look is poor, and it is the same on every block at both levels. This is the one finding that needs a decision (below).

**Concept counts follow the program.** FizzBuzz and the countdown gave one concept on both models, and the dice game gave three concepts for its three stacks (the first run had glm give two, so one program on one model varied). The greeting function and the repeated-value program gave two concepts each, inside the expected ranges, although a function and its call as two concepts is on the fragmented side. The custom block set gave three concepts for three stacks on both models, and the plan covered all three stacks without anything in the prompt or the code knowing those block types, which is the host-neutrality the design aims for. In every logged run the plan covered every top-level stack.

**A bound field edit reaches Detail.** On the countdown, both models exposed the 10, and editing it at Semantic changed the Detail block (10 to 25) in both runs. The repeated-value program shows a limit: both models exposed the two 7s as two separate fields, so an edit changed one Detail block and not the other. The prompt says to list all the Detail blocks when one value appears in several, and the models did not make one field bound to both, so the multi-reference binding case was not exercised.

**Labels mostly keep values out.** A rule in the prompt says labels never hold current values, because they go stale on the first edit. A search for Detail values spelled out in a label (whole words only) found few: on FizzBuzz the printed strings "Fizz", "Buzz" and "FizzBuzz" appear in labels (an edit to those strings would leave the label stale, though they also name the program), and the greeting function has a label that is the function's name. No literal numbers were found. This is a list of candidates to read, not a pass or fail.

**Output size and time differ a lot between the models.** Output tokens count the model's reasoning.

| Model                      | Output tokens per zoom, both runs | Seconds per zoom, both runs |
| -------------------------- | --------------------------------- | --------------------------- |
| `deepseek-v4.1-flash-1017` | 768 to 4,465                      | 5.7 to 27                   |
| `glm-5.3-flash`            | 2,563 to **30,359**               | 10.5 to **155**             |

For the same program glm's output varies about five times between runs: FizzBuzz took 5,856 tokens and 33 seconds in one run and 30,359 tokens and 128 seconds in the next. The 30,359 is 93% of the 32768 cap decided after the spike. The cap held here, and the earlier 8192 would have failed the run, but a larger program or an unlucky run could still be cut off, and a person waits up to two and a half minutes with the plugin showing only "Zooming…".

## Not tested

Two runs of small programs (the largest has 28 blocks) on two models, judged by one reader's eye for label quality. Only two programs test editing at the zoomed level, and the custom block set was not seen in a browser. Local models were not tried. The first run's counts matched the second except for the dice game on glm.

## Outcome and open decisions

- **Passed:** the smoke check on two models, with no failures. Together with the green tests and the spike, what is left before `v1` becomes the default and is frozen is below.
- **Open: the default block colour.** Blocks with no colour render black. The design (section 4.3 of the plan document) has the proxy give such blocks a neutral colour and leaves deriving colours from the host's blocks to phase 1. A neutral default is small and could come before `v1` is frozen; otherwise `v1` ships with black blocks.
- **Open: the output cap against glm's outliers.** 32768 covered every run, but one run reached 93%. Options are a higher cap (both models accepted 131072 in the spike) or a limit on reasoning effort per model, which is per-model parameters, a later step.
- **Open: whether the plugin should say more than "Zooming…"** while a model reasons for a minute or two.
