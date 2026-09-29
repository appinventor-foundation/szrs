import { ChatCompletionRequestSchema } from '@szrs/llm-proxy-contracts';
import type { FastifyInstance } from 'fastify';

import { chatCompletion } from '../lib/litellm.js';

export default async function chatRoutes(fastify: FastifyInstance): Promise<void> {
	fastify.post('/v1/chat/completions', async (request, reply) => {
		const body = ChatCompletionRequestSchema.parse(request.body);

		const result = await chatCompletion(fastify.config, body);
		if (!result.ok) {
			return reply.code(result.status).send(result.body);
		}

		return result.response;
	});
}
