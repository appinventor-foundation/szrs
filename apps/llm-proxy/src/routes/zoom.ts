import { ZoomRequestSchema } from '@szrs/llm-proxy-contracts';
import type { FastifyInstance } from 'fastify';

import { chatCompletion } from '../lib/litellm.js';
import { buildZoomPrompt, parseZoomResponse, ZOOM_SYSTEM_PROMPT } from '../zoom/zoom.js';

const MAX_ATTEMPTS = 3;

export default async function zoomRoutes(fastify: FastifyInstance): Promise<void> {
	fastify.post('/v1/zoom', async (request, reply) => {
		const body = ZoomRequestSchema.parse(request.body);
		const basePrompt = buildZoomPrompt(body.slug, body.workspaceJson);

		let lastError = '';
		let promptSuffix = '';

		for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
			const result = await chatCompletion(fastify.config, {
				model: body.model,
				messages: [
					{ role: 'system', content: ZOOM_SYSTEM_PROMPT },
					{ role: 'user', content: basePrompt + promptSuffix }
				],
				maxTokens: 8192
			});
			if (!result.ok) {
				return reply.code(result.status).send(result.body);
			}

			try {
				return parseZoomResponse(result.response.content);
			} catch (error) {
				lastError = error instanceof Error ? error.message : String(error);
				request.log.warn({ attempt, error: lastError }, 'invalid zoom output from model');
				promptSuffix = `\n\nYour previous attempt was invalid:\n${lastError}\n\nReturn a complete, valid JSON object with "semantic" and "concept" keys only — no prose, no fences.`;
			}
		}

		return reply.code(502).send({ error: { message: lastError, code: 'invalid_model_output' } });
	});
}
