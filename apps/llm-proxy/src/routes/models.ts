import type { FastifyInstance } from 'fastify';

import { listModels } from '../lib/litellm.js';

export default async function modelsRoutes(fastify: FastifyInstance): Promise<void> {
	fastify.get('/v1/models', async (_request, reply) => {
		const result = await listModels(fastify.config);
		if (!result.ok) {
			return reply.code(result.status).send(result.body);
		}

		return result.response;
	});
}
