import { describe, expect, it } from 'vitest';

import { promptFingerprint, stableStringify, zoomCacheKey } from '../../../src/zoom/cache-key.js';
import {
	DEFAULT_PROMPT_ID,
	getZoomPrompt,
	type ZoomPrompt
} from '../../../src/zoom/prompts/index.js';

const request = {
	model: 'local-ollama',
	slug: 'fizz',
	workspaceJson: { blocks: { languageVersion: 0, blocks: [{ type: 'text_print', id: 'b1' }] } }
};

describe('stableStringify', () => {
	it('sorts object keys at every depth and keeps array order', () => {
		expect(stableStringify({ b: [{ y: 1, x: 2 }, 3], a: 'z' })).toBe(
			'{"a":"z","b":[{"x":2,"y":1},3]}'
		);
	});

	it('skips undefined properties, like JSON.stringify', () => {
		expect(stableStringify({ a: undefined, b: null })).toBe('{"b":null}');
	});
});

describe('zoomCacheKey', () => {
	it('is prefixed, versioned and stable', () => {
		const key = zoomCacheKey(request);

		expect(key).toMatch(/^szrs:zoom:v3:[0-9a-f]{64}$/);
		expect(zoomCacheKey({ ...request })).toBe(key);
	});

	it('ignores the order of keys in the workspace', () => {
		const reordered = {
			...request,
			workspaceJson: {
				blocks: { blocks: [{ id: 'b1', type: 'text_print' }], languageVersion: 0 }
			}
		};

		expect(zoomCacheKey(reordered)).toBe(zoomCacheKey(request));
	});

	it('differs by model, slug and workspace', () => {
		const key = zoomCacheKey(request);

		expect(zoomCacheKey({ ...request, model: 'openrouter' })).not.toBe(key);
		expect(zoomCacheKey({ ...request, slug: 'other' })).not.toBe(key);
		expect(
			zoomCacheKey({
				...request,
				workspaceJson: {
					blocks: { languageVersion: 0, blocks: [{ type: 'text_print', id: 'b2' }] }
				}
			})
		).not.toBe(key);
	});
});

describe('promptFingerprint', () => {
	const base: ZoomPrompt = {
		id: 'test',
		system: 'system text',
		buildUser: (req, error) => `slug ${req.slug}${error === undefined ? '' : ' retry ' + error}`,
		params: { temperature: 0.2 }
	};

	it('is stable for the same prompt', () => {
		expect(promptFingerprint({ ...base })).toBe(promptFingerprint({ ...base }));
		expect(promptFingerprint(getZoomPrompt('v0'))).toMatch(/^[0-9a-f]{64}$/);
	});

	it('changes with the system text', () => {
		expect(promptFingerprint({ ...base, system: 'other' })).not.toBe(promptFingerprint(base));
	});

	it('changes with how the user message is built, including the retry text', () => {
		const first = { ...base, buildUser: (req: { slug: string }) => `slug ${req.slug}!` };
		const retry = {
			...base,
			buildUser: (req: { slug: string }, error?: string) =>
				`slug ${req.slug}${error === undefined ? '' : ' again ' + error}`
		};

		expect(promptFingerprint(first)).not.toBe(promptFingerprint(base));
		expect(promptFingerprint(retry)).not.toBe(promptFingerprint(base));
	});

	it('changes with the sampling parameters', () => {
		expect(promptFingerprint({ ...base, params: { temperature: 0.7 } })).not.toBe(
			promptFingerprint(base)
		);
	});
});

describe('zoomCacheKey and prompts', () => {
	it('gives each prompt its own entries', () => {
		expect(zoomCacheKey({ ...request, promptId: 'v1' })).not.toBe(
			zoomCacheKey({ ...request, promptId: 'v0' })
		);
	});

	it('uses the default prompt when none is named', () => {
		expect(zoomCacheKey({ ...request, promptId: DEFAULT_PROMPT_ID })).toBe(zoomCacheKey(request));
		expect(zoomCacheKey({ ...request, promptId: 'v0' })).not.toBe(zoomCacheKey(request));
	});

	it('rejects an unknown prompt id', () => {
		expect(() => zoomCacheKey({ ...request, promptId: 'nope' })).toThrow(/Unknown zoom prompt/);
	});
});
