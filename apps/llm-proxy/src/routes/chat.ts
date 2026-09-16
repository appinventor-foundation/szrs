import { ChatCompletionRequestSchema, ChatCompletionResponseSchema } from '@szrs/llm-proxy-contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const UpstreamResponseSchema = z.object({
	model: z.string(),
	choices: z
		.array(
			z.object({
				message: z.object({ content: z.string() }),
				finish_reason: z.string()
			})
		)
		.min(1),
	usage: z.object({
		prompt_tokens: z.number().int().nonnegative(),
		completion_tokens: z.number().int().nonnegative(),
		total_tokens: z.number().int().nonnegative()
	})
});

export default async function chatRoutes(fastify: FastifyInstance): Promise<void> {
	fastify.post('/v1/chat/completions', async (request, reply) => {
		const body = ChatCompletionRequestSchema.parse(request.body);

		const upstream = await fetch(`${fastify.config.LITELLM_BASE_URL}/v1/chat/completions`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				authorization: `Bearer ${fastify.config.LITELLM_VIRTUAL_KEY}`
			},
			body: JSON.stringify({
				model: body.model,
				messages: body.messages,
				temperature: body.temperature,
				max_tokens: body.maxTokens
			})
		});

		if (!upstream.ok) {
			return reply.code(upstream.status).send(await upstream.json());
		}

		const upstreamBody = UpstreamResponseSchema.parse(await upstream.json());
		const choice = upstreamBody.choices[0];

		return ChatCompletionResponseSchema.parse({
			content: choice.message.content,
			model: upstreamBody.model,
			usage: {
				promptTokens: upstreamBody.usage.prompt_tokens,
				completionTokens: upstreamBody.usage.completion_tokens,
				totalTokens: upstreamBody.usage.total_tokens
			},
			finishReason: choice.finish_reason
		});
	});
}
