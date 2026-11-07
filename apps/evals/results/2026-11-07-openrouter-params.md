# OpenRouter `reasoning` and `provider` through LiteLLM, 2026-11-07

Raw results: [`2026-11-07-openrouter-params.json`](2026-11-07-openrouter-params.json). Script: [`../openrouter-params-probe.ts`](../openrouter-params-probe.ts), run as `pnpm probe:openrouter glm-5.3-flash deepseek-v4.1-flash-1017` with LiteLLM running locally.

## What was tested

| Id                         | Sent to LiteLLM as | Model it resolved to                           | Provider pin |
| -------------------------- | ------------------ | ---------------------------------------------- | ------------ |
| `glm-5.3-flash`            | `openrouter-2`     | `openrouter/z-ai/glm-5.3-flash`                | `z-ai`       |
| `deepseek-v4.1-flash-1017` | `openrouter`       | `openrouter/deepseek/deepseek-v4.1-flash-1017` | `deepinfra`  |

Ten small requests per model (a multiplication question, `max_tokens` 4000), each with different extra request fields, then one `v1` zoom of the 14-block dice game with `reasoning: { effort: 'low' }` and the pin, through the baseline runner. It followed a first, hand-run version of the same test earlier the same day, which found the same things (it is not kept; this script replaced it). The first version also showed that a request LiteLLM cannot serve puts the model on a cooldown of a few seconds (HTTP 429, "No deployments available"), so the script runs the cases that fail on purpose last, after a wait.

## Findings

| Question                                                       | `glm-5.3-flash`                                                           | `deepseek-v4.1-flash-1017`                          |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------- |
| `reasoning` at the top level of the request reaches OpenRouter | Yes                                                                       | Yes                                                 |
| `reasoning` inside `extra_body` reaches OpenRouter             | Yes                                                                       | Yes                                                 |
| `reasoning: { effort: 'none' }`                                | Refused (400, "Reasoning is mandatory for this endpoint")                 | Accepted: 0 reasoning tokens, correct answer        |
| `reasoning: { effort: 'low' }`                                 | Accepted                                                                  | Accepted                                            |
| `reasoning_effort: 'low'` (OpenAI style)                       | Refused by LiteLLM (`UnsupportedParamsError`); use the `reasoning` object | Same                                                |
| `provider` pin, top level and in `extra_body`                  | Served by Z.AI both times                                                 | Served by DeepInfra both times                      |
| A provider that does not exist, no fallbacks                   | 404 (so the field is forwarded and enforced)                              | Same                                                |
| Same request, no pin                                           | Served by InferenceNet, Makora and Wafer in three calls                   | Served by DeepInfra, InferenceNet, Cohere and Morph |

**Unpinned, one alias is served by a different host from one call to the next.** Quantization and output limits differ by host (see the OpenRouter endpoint listings), so this is noise a comparison between prompts should not contain. A pin removes it, at the price that a request fails when the pinned host is down.

**DeepSeek's own endpoint cannot be pinned.** OpenRouter removes it for this account: "Filter by Guardrails removed deepseek (Paid model training violation (account settings))". That is a privacy setting of the account, not something the script can change. DeepInfra (fp8) is pinned instead.

**The zoom at `low`** was valid on the first attempt for both models, loaded in headless Blockly and gave 3 concepts. `glm-5.3-flash` used 1,048 output tokens, 2 of them reasoning (the spike's `v1` zoom of the same program, at its default effort and unpinned, used 5,890). `deepseek-v4.1-flash-1017` used 1,288, 494 of them reasoning (the spike: 1,230). One sample each: this shows that `low` works and produces a valid zoom, not how much it saves.

## Limits

- **A LiteLLM stream carries no `provider`.** A non-stream response names the serving provider; the streamed zooms do not (the records' `providers` are empty). With a pin and no fallbacks the pin says who served the call. For an unpinned model the provider would not be recorded on this path.
- **A LiteLLM stream does carry `usage.cost`** in its last chunk (checked once by hand: $0.000075 for a short call). The probe's zoom records predate the code that stores it, so they have no cost; the baseline runner now records it per attempt.
- **The extra fields were sent per request.** Putting them in LiteLLM's alias config (`extra_body` under `litellm_params`) was not tested.
- The multiplication prompt is too short to say how much `low` saves; the reasoning counts in the table are single samples.

## Outcome

Decided 2026-11-07: the baseline pins `glm-5.3-flash` to Z.AI and `deepseek-v4.1-flash-1017` to DeepInfra, with fallbacks off and reasoning at each model's default (what production does today); lowering reasoning is a separate, later comparison. The pins live in `baseline/model-registry.ts` and each result records them.

Later the same day: the registry stopped using LiteLLM aliases. Models are sent by their full OpenRouter name (`openrouter/z-ai/glm-5.3-flash`) through a local-only wildcard route (`infra/llm-proxy/docker-compose.benchmark.yml`), checked with real calls: both models were served by their pinned provider, `/v1/models` (the dashboard's list) did not change, and an unmatched name was refused. The `sentAs` values in the JSON above are the aliases the probe used.
