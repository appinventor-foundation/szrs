import {
	ChatCompletionResponseSchema,
	type ChatCompletionRequest,
	type ChatCompletionResponse
} from '@szrs/llm-proxy-contracts';
import { z } from 'zod';

import type { Config } from '../config.js';

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

// A non-2xx from LiteLLM is returned rather than thrown, so callers can
// forward its original status code instead of collapsing it to a 500.
export type ChatCompletionResult =
	{ ok: true; response: ChatCompletionResponse } | { ok: false; status: number; body: unknown };

export async function chatCompletion(
	config: Pick<Config, 'LITELLM_BASE_URL' | 'LITELLM_VIRTUAL_KEY'>,
	request: ChatCompletionRequest
): Promise<ChatCompletionResult> {
	const upstream = await fetch(`${config.LITELLM_BASE_URL}/v1/chat/completions`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: `Bearer ${config.LITELLM_VIRTUAL_KEY}`
		},
		body: JSON.stringify({
			model: request.model,
			messages: request.messages,
			temperature: request.temperature,
			max_tokens: request.maxTokens
		})
	});

	if (!upstream.ok) {
		return { ok: false, status: upstream.status, body: await upstream.json() };
	}

	const upstreamBody = UpstreamResponseSchema.parse(await upstream.json());
	const choice = upstreamBody.choices[0];

	return {
		ok: true,
		response: ChatCompletionResponseSchema.parse({
			content: choice.message.content,
			model: upstreamBody.model,
			usage: {
				promptTokens: upstreamBody.usage.prompt_tokens,
				completionTokens: upstreamBody.usage.completion_tokens,
				totalTokens: upstreamBody.usage.total_tokens
			},
			finishReason: choice.finish_reason
		})
	};
}
