// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import type { ZoomPromptParams } from './types.js';

/**
 * The sampling parameters every prompt is baselined under, so that runs can be
 * reproduced and compared. A low temperature keeps repeated zooms of one
 * program similar; the cap must fit a plan plus two levels for a large program.
 *
 * `maxTokens` is 32768, decided 2026-11-06 from the spike in
 * apps/llm-proxy/checks/results/2026-11-06-cap-and-temperature-spike.md. The
 * models we run reason before they answer, and the reasoning counts against
 * the cap: a 14-block program used about 5900 tokens, 72% of the earlier 8192,
 * so a larger program would have been cut off (and a cut-off zoom fails
 * without a retry). Both OpenRouter aliases tested accept caps up to 131072.
 * A cap is only a ceiling, so it costs nothing unless a model uses it.
 *
 * The same cap goes to every alias, and a request-level value overrides the
 * alias's `max_tokens` in the LiteLLM config. Only the two OpenRouter aliases
 * were tested: a provider that allows less output than this rejects the
 * request, so give that model a lower cap (per-model parameters are a later
 * step) before using it. LiteLLM's model info lists 16384 for gpt-4o-mini, so
 * that alias would reject this cap.
 */
export const SHARED_ZOOM_PARAMS: ZoomPromptParams = { temperature: 0.2, maxTokens: 32768 };
