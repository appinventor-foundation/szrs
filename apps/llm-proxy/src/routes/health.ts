import type { FastifyInstance } from 'fastify';

export default async function healthRoutes(fastify: FastifyInstance): Promise<void> {
	fastify.get('/healthz', async () => ({ status: 'ok' }));

	fastify.get('/readyz', async (_request, reply) => {
		try {
			// Any HTTP response (even a 401) proves LiteLLM is reachable — readiness
			// shouldn't depend on LITELLM_VIRTUAL_KEY being valid, only on the
			// upstream gateway being up. Only a network-level failure means "not ready".
			await fetch(`${fastify.config.LITELLM_BASE_URL}/health/liveliness`);
			return { status: 'ok' };
		} catch (error) {
			fastify.log.error(error);
			return reply.code(503).send({ status: 'unavailable' });
		}
	});
}
