// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { chatCompletionStream } from '@szrs/llm-proxy/lib/litellm.js';
import type { CompleteFn } from './runner.js';

/** A call longer than this is given up on and recorded as a failure (the proxy has no timeout of its own). */
const CALL_TIMEOUT_MS = 600_000;

/**
 * The runner's model call, made the way the proxy makes it: LiteLLM's streaming
 * endpoint through the proxy's own client, with the virtual key. No cache.
 */
export function litellmComplete(config: { baseUrl: string; key: string }): CompleteFn {
	return async (request) => {
		const started = Date.now();
		const run = async () => {
			const call = await chatCompletionStream(
				{ LITELLM_BASE_URL: config.baseUrl, LITELLM_VIRTUAL_KEY: config.key },
				{
					model: request.alias,
					messages: request.messages,
					temperature: request.temperature,
					maxTokens: request.maxTokens
				},
				{ metadata: { prompt_id: request.promptId, tags: request.tags } }
			);
			if (!call.ok) {
				const body = JSON.stringify(call.body);
				return { ok: false as const, status: call.status, message: body.slice(0, 400) };
			}
			let text = '';
			let firstTokenMs: number | undefined;
			for await (const token of call.tokens) {
				firstTokenMs ??= Date.now() - started;
				text += token;
			}
			return {
				ok: true as const,
				text,
				...(call.summary.finishReason && { finishReason: call.summary.finishReason }),
				...(call.summary.usage && { usage: call.summary.usage }),
				...(firstTokenMs !== undefined && { firstTokenMs })
			};
		};
		const timeout = new Promise<{ ok: false; status: number; message: string }>((resolve) =>
			setTimeout(
				() =>
					resolve({ ok: false, status: 0, message: `no answer after ${CALL_TIMEOUT_MS / 1000}s` }),
				CALL_TIMEOUT_MS
			).unref()
		);
		try {
			return await Promise.race([run(), timeout]);
		} catch (error) {
			return { ok: false, status: 0, message: String(error).slice(0, 300) };
		}
	};
}
