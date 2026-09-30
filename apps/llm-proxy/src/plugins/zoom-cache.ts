import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

import { createZoomCache, type ZoomCache } from '../zoom/cache.js';

interface ZoomCachePluginOptions {
	/** Use this cache instead of the one CACHE_URL describes (null for none). For tests. */
	cache?: ZoomCache | null;
}

async function zoomCachePlugin(
	fastify: FastifyInstance,
	options: ZoomCachePluginOptions
): Promise<void> {
	const cache =
		options.cache !== undefined
			? options.cache
			: await createZoomCache(fastify.config, fastify.log);
	if (!cache) fastify.log.info('CACHE_URL is not set; zooms are not cached');

	fastify.decorate('zoomCache', cache);
	fastify.addHook('onClose', async () => {
		await cache?.close();
	});
}

// fp() so the decoration is visible to the route plugins registered after this one.
export default fp(zoomCachePlugin, { name: 'zoom-cache' });
