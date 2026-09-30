import { createHash } from 'node:crypto';

import { ZOOM_SYSTEM_PROMPT } from './zoom.js';

// Bump when a change that isn't in the prompt (repair or validation rules, the
// shape of a stored result) should stop old entries being reused.
const KEY_VERSION = 'v1';

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

// A new prompt can give different results, so it starts a fresh set of entries.
const PROMPT_VERSION = sha256(ZOOM_SYSTEM_PROMPT);

/** JSON with object keys sorted, so equal content always gives equal text. */
export function stableStringify(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
	if (typeof value === 'object' && value !== null) {
		const entries = Object.entries(value)
			.filter(([, item]) => item !== undefined)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
			.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
		return `{${entries.join(',')}}`;
	}
	return JSON.stringify(value) ?? 'null';
}

/**
 * The cache key for a zoom request. `workspaceJson` must be the normalized
 * workspace (see normalize.ts), so that the same program gets the same key
 * whatever its block ids and positions. The slug is included because it
 * prefixes the generated block types.
 */
export function zoomCacheKey(request: {
	model: string;
	slug: string;
	workspaceJson: Record<string, unknown>;
}): string {
	const { model, slug, workspaceJson } = request;
	return `szrs:zoom:${KEY_VERSION}:${sha256(
		stableStringify({ model, slug, prompt: PROMPT_VERSION, workspace: workspaceJson })
	)}`;
}
