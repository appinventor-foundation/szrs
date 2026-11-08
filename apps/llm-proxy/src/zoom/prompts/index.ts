// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import type { ZoomPrompt } from './types.js';
import { v0 } from './v0.js';
import { v1 } from './v1.js';
import { v2 } from './v2.js';
import { v3 } from './v3.js';

export type { ZoomPrompt, ZoomPromptParams } from './types.js';
export { toSnakeSlug } from './slug.js';

const PROMPTS: readonly ZoomPrompt[] = [v0, v1, v2, v3];

/**
 * The prompt used when a request does not name one. v2 (like v1 before it)
 * needs the plugin that lays zoomed blocks out (ZoomLevelLoader.arrange): the
 * model no longer places them, so an older plugin would stack them on top of
 * each other. Deploy the two together. Its response has the same shape as every
 * prompt's, so the contract and the rest of the plugin are unchanged; the proxy
 * expands what the model writes (placeholders.ts, stacks.ts) before returning it.
 * It became the default on 2026-11-08 (apps/evals/results/2026-11-08-v2-baseline-2.md).
 */
export const DEFAULT_PROMPT_ID = 'v2';

export function getZoomPrompt(id: string = DEFAULT_PROMPT_ID): ZoomPrompt {
	const prompt = PROMPTS.find((candidate) => candidate.id === id);
	if (!prompt) throw new Error(`Unknown zoom prompt id "${id}"`);
	return prompt;
}

export function zoomPromptIds(): string[] {
	return PROMPTS.map((prompt) => prompt.id);
}
