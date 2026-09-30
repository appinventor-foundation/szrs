import type { Config } from '../config.js';
import type { ZoomCache } from '../zoom/cache.js';

declare module 'fastify' {
	interface FastifyInstance {
		config: Config;
		/** Null when no cache is configured. */
		zoomCache: ZoomCache | null;
	}
}
