import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

const PUBLIC_PATHS = new Set(['/healthz', '/readyz']);

async function authPlugin(fastify: FastifyInstance): Promise<void> {
	const apiKey = fastify.config.INTERNAL_API_KEY;
	if (apiKey === undefined) {
		fastify.log.info('INTERNAL_API_KEY is not set; requests are not authenticated');
		return;
	}

	fastify.addHook('onRequest', async (request, reply) => {
		if (PUBLIC_PATHS.has(request.url)) {
			return;
		}

		const providedKey = request.headers['x-internal-api-key'];
		if (providedKey !== apiKey) {
			await reply.code(401).send({ error: { message: 'Unauthorized', code: 'unauthorized' } });
		}
	});
}

// fp() breaks this plugin out of Fastify's default encapsulation so the
// onRequest hook applies to sibling route plugins, not just this plugin's
// own (otherwise empty) scope.
export default fp(authPlugin, { name: 'auth' });
