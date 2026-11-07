// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { isRecord } from '@szrs/llm-proxy/zoom/saved-blocks.js';

import type { CompleteFn, Completion } from './runner.js';

/** A call longer than this is given up on and recorded as a failure (the proxy has no timeout of its own). */
const CALL_TIMEOUT_MS = 600_000;
/** Busy or unavailable: the call is repeated after a wait. */
const RETRY_STATUSES = new Set([429, 502, 503, 504]);
const RETRY_WAITS_MS = [8_000, 20_000, 45_000];

export interface LiteLLMCompleteOptions {
	baseUrl: string;
	key: string;
	/** For tests: how to wait between repeated calls. */
	sleep?: (ms: number) => Promise<void>;
}

const asNumber = (value: unknown): number | undefined =>
	typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/**
 * One streamed call to LiteLLM. Like the proxy's own client, but it sends the
 * model's extra request fields (OpenRouter's `provider` and `reasoning`) and reads
 * back the reasoning tokens and the cost in dollars, which the proxy's client
 * does not. No cache. Through LiteLLM a stream carries no `provider` (checked
 * 2026-11-07; a non-stream answer does), so `provider` is only filled in when a
 * chunk has it; with a pin and no fallback, the pin says who served the call.
 */
async function callOnce(
	options: LiteLLMCompleteOptions,
	request: Parameters<CompleteFn>[0]
): Promise<Completion> {
	const started = Date.now();
	const res = await fetch(`${options.baseUrl}/v1/chat/completions`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', authorization: `Bearer ${options.key}` },
		body: JSON.stringify({
			model: request.model,
			messages: request.messages,
			temperature: request.temperature,
			max_tokens: request.maxTokens,
			...request.extra,
			metadata: { prompt_id: request.promptId, tags: request.tags },
			stream: true,
			stream_options: { include_usage: true }
		}),
		signal: AbortSignal.timeout(CALL_TIMEOUT_MS)
	});
	if (!res.ok || !res.body) {
		const body = await res.text();
		return { ok: false, status: res.status, message: body.slice(0, 400) };
	}

	let text = '';
	let finishReason: string | undefined;
	let usage: Extract<Completion, { ok: true }>['usage'];
	let reasoningTokens: number | undefined;
	let cost: number | undefined;
	let provider: string | undefined;
	let firstTokenMs: number | undefined;
	const decoder = new TextDecoder();
	let buffer = '';

	for await (const chunk of res.body) {
		buffer += decoder.decode(chunk, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';
		for (const line of lines) {
			if (!line.startsWith('data:')) continue;
			const data = line.slice('data:'.length).trim();
			if (data === '[DONE]' || data === '') continue;
			let parsed: unknown;
			try {
				parsed = JSON.parse(data);
			} catch {
				continue;
			}
			if (!isRecord(parsed)) continue;
			if (isRecord(parsed.error)) {
				return {
					ok: false,
					status: asNumber(parsed.error.code) ?? 0,
					message: JSON.stringify(parsed.error).slice(0, 400)
				};
			}
			if (typeof parsed.provider === 'string') provider = parsed.provider;
			const choice =
				Array.isArray(parsed.choices) && isRecord(parsed.choices[0])
					? parsed.choices[0]
					: undefined;
			if (typeof choice?.finish_reason === 'string') finishReason = choice.finish_reason;
			const delta = isRecord(choice?.delta) ? choice.delta : undefined;
			if (typeof delta?.content === 'string' && delta.content !== '') {
				firstTokenMs ??= Date.now() - started;
				text += delta.content;
			}
			if (isRecord(parsed.usage)) {
				const prompt = asNumber(parsed.usage.prompt_tokens);
				const completion = asNumber(parsed.usage.completion_tokens);
				if (prompt !== undefined && completion !== undefined) {
					usage = {
						promptTokens: prompt,
						completionTokens: completion,
						totalTokens: asNumber(parsed.usage.total_tokens) ?? prompt + completion
					};
				}
				cost = asNumber(parsed.usage.cost) ?? cost;
				const details = parsed.usage.completion_tokens_details;
				if (isRecord(details))
					reasoningTokens = asNumber(details.reasoning_tokens) ?? reasoningTokens;
			}
		}
	}
	return {
		ok: true,
		text,
		...(finishReason && { finishReason }),
		...(usage && { usage }),
		...(firstTokenMs !== undefined && { firstTokenMs }),
		...(provider && { provider }),
		...(reasoningTokens !== undefined && { reasoningTokens }),
		...(cost !== undefined && { cost })
	};
}

/**
 * The runner's model call. A busy or unavailable answer (429, 502, 503, 504, or a
 * network error) is repeated after a wait, up to three times, and the number of
 * repeats is recorded; any other failure is returned as it is.
 */
export function litellmComplete(options: LiteLLMCompleteOptions): CompleteFn {
	const sleep =
		options.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
	return async (request) => {
		let retries = 0;
		for (;;) {
			let result: Completion;
			try {
				result = await callOnce(options, request);
			} catch (error) {
				result = { ok: false, status: 0, message: String(error).slice(0, 300) };
			}
			const retryable = !result.ok && (result.status === 0 || RETRY_STATUSES.has(result.status));
			if (!retryable || retries >= RETRY_WAITS_MS.length) {
				return result.ok && retries > 0 ? { ...result, retries } : result;
			}
			await sleep(RETRY_WAITS_MS[retries]);
			retries++;
		}
	};
}
