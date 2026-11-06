import { createHash } from 'node:crypto';

import { DEFAULT_PROMPT_ID, getZoomPrompt, type ZoomPrompt } from './prompts/index.js';

// Bump when a change that isn't in the prompt (repair or validation rules, the
// shape of a stored result) should stop old entries being reused.
const KEY_VERSION = 'v2';

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

// A fixed request the fingerprint renders each prompt's user message for.
const PROBE = {
	slug: 'probe-slug',
	workspaceJson: { blocks: { languageVersion: 0, blocks: [{ type: 'probe', id: 'b1' }] } }
};

const fingerprints = new WeakMap<ZoomPrompt, string>();

/**
 * A hash of everything that shapes what a prompt gets from the model: its
 * system text, the user message it builds for a fixed probe request (with and
 * without a retry error) and its sampling parameters. An edit to the wording or to how the user message is built changes
 * it, so a prompt can never share cache entries with an older version of
 * itself, whether or not anyone remembered to bump a version.
 */
export function promptFingerprint(prompt: ZoomPrompt): string {
	let fingerprint = fingerprints.get(prompt);
	if (fingerprint === undefined) {
		fingerprint = sha256(
			stableStringify([
				prompt.system,
				prompt.buildUser(PROBE),
				prompt.buildUser(PROBE, 'probe error'),
				prompt.params
			])
		);
		fingerprints.set(prompt, fingerprint);
	}
	return fingerprint;
}

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
 * prefixes the generated block types. `promptId` names the prompt that
 * makes the result; its fingerprint is part of the key too.
 */
export function zoomCacheKey(request: {
	model: string;
	slug: string;
	workspaceJson: Record<string, unknown>;
	promptId?: string;
}): string {
	const { model, slug, workspaceJson, promptId = DEFAULT_PROMPT_ID } = request;
	const prompt = getZoomPrompt(promptId);
	return `szrs:zoom:${KEY_VERSION}:${sha256(
		stableStringify({
			model,
			slug,
			prompt: { id: prompt.id, fingerprint: promptFingerprint(prompt) },
			workspace: workspaceJson
		})
	)}`;
}
