import { ZoomResponseSchema, type ZoomResponse } from '@szrs/llm-proxy-contracts';
import type { FastifyBaseLogger } from 'fastify';

import type { Config } from '../config.js';
import { checkZoomResult } from './validate.js';

/**
 * Somewhere to keep finished zooms. It is only ever an optimisation, so
 * neither method rejects: a read that fails or times out is a miss, and a
 * write that fails is logged and dropped.
 */
export interface ZoomCache {
	/** The stored value, or null. It is unchecked: pass it to lookupZoom's checks before use. */
	get(key: string): Promise<unknown>;
	set(key: string, result: ZoomResponse): Promise<void>;
	close(): Promise<void>;
}

/** The part of a Redis or Valkey client that the cache uses. */
export interface CacheClient {
	get(key: string): Promise<string | null>;
	set(
		key: string,
		value: string,
		options: { expiration: { type: 'EX'; value: number } }
	): Promise<unknown>;
	close(): Promise<void>;
}

export function createRedisZoomCache(
	client: CacheClient,
	{ ttlSeconds, timeoutMs }: { ttlSeconds: number; timeoutMs: number },
	log: Pick<FastifyBaseLogger, 'warn'>
): ZoomCache {
	return {
		async get(key) {
			try {
				const raw = await withTimeout(client.get(key), timeoutMs);
				return raw === null ? null : (JSON.parse(raw) as unknown);
			} catch (error) {
				log.warn({ err: errorMessage(error) }, 'zoom cache read failed; treating as a miss');
				return null;
			}
		},
		async set(key, result) {
			try {
				await withTimeout(
					client.set(key, JSON.stringify(result), {
						expiration: { type: 'EX', value: ttlSeconds }
					}),
					timeoutMs
				);
			} catch (error) {
				log.warn({ err: errorMessage(error) }, 'zoom cache write failed');
			}
		},
		async close() {
			try {
				await client.close();
			} catch {
				// Already closed, or never connected.
			}
		}
	};
}

/**
 * Connects to the cache in `config.CACHE_URL`, or returns null when it is
 * unset. The client library is only loaded when a cache is configured. The
 * connection is made in the background and retried if it drops, and commands
 * fail at once while it is down (so they count as misses) instead of queueing.
 */
export async function createZoomCache(
	config: Pick<Config, 'CACHE_URL' | 'CACHE_TTL_SECONDS' | 'CACHE_TIMEOUT_MS'>,
	log: FastifyBaseLogger
): Promise<ZoomCache | null> {
	if (!config.CACHE_URL) return null;

	const { createClient } = await import('redis');
	const client = createClient({
		url: config.CACHE_URL,
		disableOfflineQueue: true,
		socket: { reconnectStrategy: (retries) => Math.min(retries * 200, 5000) }
	});

	let unavailable = false;
	client.on('error', (error: unknown) => {
		if (unavailable) return;
		unavailable = true;
		log.warn({ err: errorMessage(error) }, 'zoom cache unavailable; zooming without it');
	});
	client.on('ready', () => {
		log.info(unavailable ? 'zoom cache is available again' : 'zoom cache connected');
		unavailable = false;
	});
	client.connect().catch((error: unknown) => {
		log.error({ err: errorMessage(error) }, 'zoom cache could not connect');
	});

	return createRedisZoomCache(
		{
			get: async (key) => (await client.get(key)) as string | null,
			set: (key, value, options) => client.set(key, value, options),
			close: () => client.close()
		},
		{ ttlSeconds: config.CACHE_TTL_SECONDS, timeoutMs: config.CACHE_TIMEOUT_MS },
		log
	);
}

/**
 * The stored zoom for `key`, if there is one that is still good: it must be
 * a well-formed result that passes the same checks as a fresh one against
 * this request's (normalized) workspace. Anything else is a miss, and the
 * entry gets overwritten by the zoom that follows.
 */
export async function lookupZoom(
	cache: ZoomCache | null,
	key: string,
	workspaceJson: Record<string, unknown>,
	log: Pick<FastifyBaseLogger, 'info' | 'warn'>
): Promise<ZoomResponse | null> {
	if (!cache) return null;

	const stored = await cache.get(key);
	if (stored === null) {
		log.info({ cache: 'miss', key }, 'zoom cache miss');
		return null;
	}

	const parsed = ZoomResponseSchema.safeParse(stored);
	if (parsed.success && checkZoomResult(parsed.data, workspaceJson).length === 0) {
		log.info({ cache: 'hit', key }, 'zoom cache hit');
		return parsed.data;
	}
	log.warn({ cache: 'invalid', key }, 'ignoring an invalid zoom cache entry');
	return null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	let timer: NodeJS.Timeout | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
