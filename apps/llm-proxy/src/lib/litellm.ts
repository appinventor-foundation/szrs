import {
	ChatCompletionResponseSchema,
	type ChatCompletionRequest,
	type ChatCompletionResponse
} from '@szrs/llm-proxy-contracts';
import { z } from 'zod';

import type { Config } from '../config.js';

type LiteLLMConfig = Pick<Config, 'LITELLM_BASE_URL' | 'LITELLM_VIRTUAL_KEY'>;

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

const UpstreamStreamChunkSchema = z.object({
	choices: z.array(z.object({ delta: z.object({ content: z.string().nullish() }) }))
});

// A non-2xx from LiteLLM is returned rather than thrown, so callers can
// forward its original status code instead of collapsing it to a 500.
export type ChatCompletionResult =
	{ ok: true; response: ChatCompletionResponse } | { ok: false; status: number; body: unknown };

export type ChatCompletionStreamResult =
	{ ok: true; tokens: AsyncGenerator<string> } | { ok: false; status: number; body: unknown };

function postChatCompletions(
	config: LiteLLMConfig,
	request: ChatCompletionRequest,
	stream: boolean
): Promise<Response> {
	return fetch(`${config.LITELLM_BASE_URL}/v1/chat/completions`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: `Bearer ${config.LITELLM_VIRTUAL_KEY}`
		},
		body: JSON.stringify({
			model: request.model,
			messages: request.messages,
			temperature: request.temperature,
			max_tokens: request.maxTokens,
			...(stream && { stream: true })
		})
	});
}

export async function chatCompletion(
	config: LiteLLMConfig,
	request: ChatCompletionRequest
): Promise<ChatCompletionResult> {
	const upstream = await postChatCompletions(config, request, false);

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

export async function chatCompletionStream(
	config: LiteLLMConfig,
	request: ChatCompletionRequest
): Promise<ChatCompletionStreamResult> {
	const upstream = await postChatCompletions(config, request, true);

	if (!upstream.ok || !upstream.body) {
		return { ok: false, status: upstream.status, body: await upstream.json() };
	}

	return { ok: true, tokens: parseTokenStream(upstream.body) };
}

// LiteLLM streams OpenAI-style SSE: `data: {chunk}` lines, ending with
// `data: [DONE]`. A chunk can split a line, so partial lines are buffered.
// Stopping iteration early (e.g. the client disconnected) cancels the
// upstream body.
async function* parseTokenStream(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
	const decoder = new TextDecoder();
	let buffer = '';

	for await (const chunk of body) {
		buffer += decoder.decode(chunk, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';

		for (const line of lines) {
			if (!line.startsWith('data:')) continue;
			const data = line.slice('data:'.length).trim();
			if (data === '[DONE]') return;

			const content = UpstreamStreamChunkSchema.parse(JSON.parse(data)).choices[0]?.delta.content;
			if (content) yield content;
		}
	}
}
