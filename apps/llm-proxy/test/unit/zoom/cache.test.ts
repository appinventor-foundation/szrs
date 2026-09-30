import { describe, expect, it, vi } from 'vitest';

import {
	createRedisZoomCache,
	lookupZoom,
	type CacheClient,
	type ZoomCache
} from '../../../src/zoom/cache.js';

const level = (bindings: unknown[] = []) => ({
	blockDefs: [
		{ type: 'zoom_x_op', message0: 'repeat %1', args0: [{ type: 'field_number', name: 'LIMIT' }] }
	],
	workspaceJson: { blocks: { languageVersion: 0, blocks: [{ type: 'zoom_x_op', id: 's1' }] } },
	bindings
});

const detail = {
	blocks: { languageVersion: 0, blocks: [{ type: 'math_number', id: 'b1', fields: { NUM: 5 } }] }
};
const goodBinding = { block: 's1', field: 'LIMIT', detail: [{ block: 'b1', field: 'NUM' }] };
const zoom = { semantic: level([goodBinding]), concept: level() };

const log = () => ({ info: vi.fn(), warn: vi.fn() });
const options = { ttlSeconds: 100, timeoutMs: 20 };

function client(overrides: Partial<CacheClient> = {}): CacheClient {
	return {
		get: vi.fn().mockResolvedValue(null),
		set: vi.fn().mockResolvedValue('OK'),
		close: vi.fn().mockResolvedValue(undefined),
		...overrides
	};
}

describe('createRedisZoomCache', () => {
	it('reads stored JSON back, and null for a missing key', async () => {
		const cache = createRedisZoomCache(
			client({ get: vi.fn().mockResolvedValueOnce(JSON.stringify(zoom)).mockResolvedValue(null) }),
			options,
			log()
		);

		expect(await cache.get('k')).toEqual(zoom);
		expect(await cache.get('k')).toBeNull();
	});

	it('writes JSON with the TTL', async () => {
		const redis = client();
		const cache = createRedisZoomCache(redis, options, log());

		await cache.set('k', zoom);

		expect(redis.set).toHaveBeenCalledWith('k', JSON.stringify(zoom), {
			expiration: { type: 'EX', value: 100 }
		});
	});

	it('treats a failed read as a miss and logs it', async () => {
		const warn = log();
		const cache = createRedisZoomCache(
			client({ get: vi.fn().mockRejectedValue(new Error('connection closed')) }),
			options,
			warn
		);

		expect(await cache.get('k')).toBeNull();
		expect(warn.warn).toHaveBeenCalledOnce();
	});

	it('treats stored text that is not JSON as a miss', async () => {
		const cache = createRedisZoomCache(
			client({ get: vi.fn().mockResolvedValue('{ broken') }),
			options,
			log()
		);

		expect(await cache.get('k')).toBeNull();
	});

	it('treats a read that takes too long as a miss', async () => {
		const cache = createRedisZoomCache(
			client({ get: vi.fn().mockReturnValue(new Promise(() => {})) }),
			options,
			log()
		);

		expect(await cache.get('k')).toBeNull();
	});

	it('does not reject when a write fails or times out', async () => {
		const failing = createRedisZoomCache(
			client({ set: vi.fn().mockRejectedValue(new Error('READONLY')) }),
			options,
			log()
		);
		const hanging = createRedisZoomCache(
			client({ set: vi.fn().mockReturnValue(new Promise(() => {})) }),
			options,
			log()
		);

		await expect(failing.set('k', zoom)).resolves.toBeUndefined();
		await expect(hanging.set('k', zoom)).resolves.toBeUndefined();
	});

	it('does not reject when closing fails', async () => {
		const cache = createRedisZoomCache(
			client({ close: vi.fn().mockRejectedValue(new Error('not open')) }),
			options,
			log()
		);

		await expect(cache.close()).resolves.toBeUndefined();
	});
});

describe('lookupZoom', () => {
	const cacheReturning = (value: unknown): ZoomCache => ({
		get: async () => value,
		set: async () => {},
		close: async () => {}
	});

	it('is a miss without a cache, and for a missing entry', async () => {
		expect(await lookupZoom(null, 'k', detail, log())).toBeNull();
		expect(await lookupZoom(cacheReturning(null), 'k', detail, log())).toBeNull();
	});

	it('returns a stored zoom that still checks out against the workspace', async () => {
		const logger = log();

		expect(await lookupZoom(cacheReturning(zoom), 'k', detail, logger)).toEqual(zoom);
		expect(logger.info).toHaveBeenCalledWith(
			expect.objectContaining({ cache: 'hit' }),
			expect.any(String)
		);
	});

	it('ignores an entry that is not a well-formed zoom', async () => {
		const logger = log();

		expect(await lookupZoom(cacheReturning({ semantic: 'nope' }), 'k', detail, logger)).toBeNull();
		expect(logger.warn).toHaveBeenCalledOnce();
	});

	it('ignores an entry whose bindings do not fit the workspace', async () => {
		const stale = {
			semantic: level([{ ...goodBinding, detail: [{ block: 'b9', field: 'NUM' }] }]),
			concept: level()
		};

		expect(await lookupZoom(cacheReturning(stale), 'k', detail, log())).toBeNull();
	});
});
