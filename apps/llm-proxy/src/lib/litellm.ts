import {
	ChatCompletionResponseSchema,
	type ChatCompletionRequest,
	type ChatCompletionResponse,
	type ChatCompletionUsage,
	type ModelsResponse
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
	choices: z.array(
		z.object({
			delta: z.object({ content: z.string().nullish() }),
			finish_reason: z.string().nullish()
		})
	),
	// Only in the last chunk, and only when asked for with stream_options.
	usage: z
		.object({
			prompt_tokens: z.number().int().nonnegative(),
			completion_tokens: z.number().int().nonnegative(),
			total_tokens: z.number().int().nonnegative()
		})
		.nullish()
});

const UpstreamModelsSchema = z.object({ data: z.array(z.object({ id: z.string() })) });

// A non-2xx from LiteLLM is returned rather than thrown, so callers can
// forward its original status code instead of collapsing it to a 500.
export type ChatCompletionResult =
	{ ok: true; response: ChatCompletionResponse } | { ok: false; status: number; body: unknown };

/**
 * What a stream reports besides its text. Filled in while `tokens` is
 * iterated, so read it after the last token. `finishReason` is undefined if
 * the stream ended without one.
 */
export interface StreamSummary {
	finishReason?: string;
	usage?: ChatCompletionUsage;
}

export type ChatCompletionStreamResult =
	| { ok: true; tokens: AsyncGenerator<string>; summary: StreamSummary }
	| { ok: false; status: number; body: unknown };

/** Extra, optional parts of a call to LiteLLM that are not part of the chat contract. */
export interface LiteLLMCallOptions {
	/** Passed through as LiteLLM request metadata (tags and so on reach Langfuse). */
	metadata?: Record<string, unknown>;
}

export type ListModelsResult =
	{ ok: true; response: ModelsResponse } | { ok: false; status: number; body: unknown };

// LiteLLM filters this list by the virtual key's allowed models.
export async function listModels(config: LiteLLMConfig): Promise<ListModelsResult> {
	const upstream = await fetch(`${config.LITELLM_BASE_URL}/v1/models`, {
		headers: { authorization: `Bearer ${config.LITELLM_VIRTUAL_KEY}` }
	});

	if (!upstream.ok) {
		return { ok: false, status: upstream.status, body: await upstream.json() };
	}

	const { data } = UpstreamModelsSchema.parse(await upstream.json());
	return { ok: true, response: { models: data.map((model) => model.id) } };
}

function postChatCompletions(
	config: LiteLLMConfig,
	request: ChatCompletionRequest,
	stream: boolean,
	options: LiteLLMCallOptions = {}
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
			...(options.metadata && { metadata: options.metadata }),
			// Without this a stream reports no token usage.
			...(stream && { stream: true, stream_options: { include_usage: true } })
		})
	});
}

export async function chatCompletion(
	config: LiteLLMConfig,
	request: ChatCompletionRequest,
	options?: LiteLLMCallOptions
): Promise<ChatCompletionResult> {
	const upstream = await postChatCompletions(config, request, false, options);

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
	request: ChatCompletionRequest,
	options?: LiteLLMCallOptions
): Promise<ChatCompletionStreamResult> {
	const upstream = await postChatCompletions(config, request, true, options);

	if (!upstream.ok || !upstream.body) {
		return { ok: false, status: upstream.status, body: await upstream.json() };
	}

	const summary: StreamSummary = {};
	return { ok: true, tokens: parseTokenStream(upstream.body, summary), summary };
}

// LiteLLM streams OpenAI-style SSE: `data: {chunk}` lines, ending with
// `data: [DONE]`. A chunk can split a line, so partial lines are buffered.
// The finish reason and token usage, which come in the last chunks, are
// recorded in `summary`. Stopping iteration early (e.g. the client disconnected) cancels the
// upstream body.
async function* parseTokenStream(
	body: ReadableStream<Uint8Array>,
	summary: StreamSummary
): AsyncGenerator<string> {
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

			const parsed = UpstreamStreamChunkSchema.parse(JSON.parse(data));
			const choice = parsed.choices[0];
			if (choice?.finish_reason) summary.finishReason = choice.finish_reason;
			if (parsed.usage) {
				summary.usage = {
					promptTokens: parsed.usage.prompt_tokens,
					completionTokens: parsed.usage.completion_tokens,
					totalTokens: parsed.usage.total_tokens
				};
			}
			if (choice?.delta.content) yield choice.delta.content;
		}
	}
}
