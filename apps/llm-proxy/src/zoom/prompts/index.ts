// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import type { ZoomPrompt } from './types.js';
import { v0 } from './v0.js';
import { v1 } from './v1.js';

export type { ZoomPrompt, ZoomPromptParams } from './types.js';
export { toSnakeSlug } from './slug.js';

const PROMPTS: readonly ZoomPrompt[] = [v0, v1];

/** The prompt used when a request does not name one. Switch only when its plugin changes are deployed. */
export const DEFAULT_PROMPT_ID = 'v0';

export function getZoomPrompt(id: string = DEFAULT_PROMPT_ID): ZoomPrompt {
	const prompt = PROMPTS.find((candidate) => candidate.id === id);
	if (!prompt) throw new Error(`Unknown zoom prompt id "${id}"`);
	return prompt;
}

export function zoomPromptIds(): string[] {
	return PROMPTS.map((prompt) => prompt.id);
}
