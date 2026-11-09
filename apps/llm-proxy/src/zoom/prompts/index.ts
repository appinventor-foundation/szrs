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
 * The prompt used when a request does not name one. v3 (like v2 and v1 before
 * it) needs the plugin that lays zoomed blocks out (ZoomLevelLoader.arrange),
 * and its colour needs the plugin that reads the returned plan
 * (ZoomLevelLoader.load with anchors): deploy the plugin and the proxy together.
 * Its response has the same shape as every prompt's plus the optional plan, so
 * an older plugin ignores the plan and shows grey zoom blocks. It became the
 * default on 2026-11-09 (apps/evals/results/2026-11-08-v3-baseline.md). Changing
 * the default changes the cache key of a request that names no prompt, so zooms
 * stored under v2 are not reused.
 */
export const DEFAULT_PROMPT_ID = 'v3';

export function getZoomPrompt(id: string = DEFAULT_PROMPT_ID): ZoomPrompt {
	const prompt = PROMPTS.find((candidate) => candidate.id === id);
	if (!prompt) throw new Error(`Unknown zoom prompt id "${id}"`);
	return prompt;
}

export function zoomPromptIds(): string[] {
	return PROMPTS.map((prompt) => prompt.id);
}
