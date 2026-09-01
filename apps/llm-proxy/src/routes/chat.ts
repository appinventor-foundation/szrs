import { ChatCompletionRequestSchema, ChatCompletionResponseSchema } from '@szrs/llm-proxy-contracts';
import type { FastifyInstance } from 'fastify';

import { requestLogs } from '../db/schema.js';

export default async function chatRoutes(fastify: FastifyInstance): Promise<void> {
	fastify.post('/v1/chat/completions', async (request) => {
		const clientId = String(request.headers['x-client-id'] ?? 'unknown');
		const body = ChatCompletionRequestSchema.parse(request.body);
		const provider = fastify.registry.get(body.model);

		const start = performance.now();

		try {
			const result = await provider.chat(body);
			const response = ChatCompletionResponseSchema.parse(result);

			await fastify.db.insert(requestLogs).values({
				clientId,
				provider: provider.id,
				model: response.model,
				promptTokens: response.usage.promptTokens,
				completionTokens: response.usage.completionTokens,
				totalTokens: response.usage.totalTokens,
				latencyMs: Math.round(performance.now() - start),
				statusCode: 200
			});

			return response;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';

			await fastify.db.insert(requestLogs).values({
				clientId,
				provider: provider.id,
				model: body.model,
				promptTokens: 0,
				completionTokens: 0,
				totalTokens: 0,
				latencyMs: Math.round(performance.now() - start),
				statusCode: 502,
				errorMessage
			});

			throw error;
		}
	});
}
