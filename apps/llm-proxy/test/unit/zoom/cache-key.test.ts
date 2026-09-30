import { describe, expect, it } from 'vitest';

import { stableStringify, zoomCacheKey } from '../../../src/zoom/cache-key.js';

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

		expect(key).toMatch(/^szrs:zoom:v1:[0-9a-f]{64}$/);
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
