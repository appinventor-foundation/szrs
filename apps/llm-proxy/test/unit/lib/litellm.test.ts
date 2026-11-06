import { afterEach, describe, expect, it, vi } from 'vitest';

import { chatCompletionStream } from '../../../src/lib/litellm.js';

const config = { LITELLM_BASE_URL: 'http://litellm', LITELLM_VIRTUAL_KEY: 'key' };
const request = { model: 'local-ollama', messages: [{ role: 'user' as const, content: 'hi' }] };

afterEach(() => {
	vi.unstubAllGlobals();
});

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
			controller.close();
		}
	});
}

const delta = (content: string | null) =>
	`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

async function collect(tokens: AsyncGenerator<string>): Promise<string[]> {
	const result: string[] = [];
	for await (const token of tokens) result.push(token);
	return result;
}

describe('chatCompletionStream', () => {
	it('requests a stream from LiteLLM', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(streamOf(['data: [DONE]\n\n'])));
		vi.stubGlobal('fetch', fetchMock);

		await chatCompletionStream(config, request);

		const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
		expect(body.stream).toBe(true);
	});

	it('asks for token usage, and passes metadata and sampling parameters', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(streamOf(['data: [DONE]\n\n'])));
		vi.stubGlobal('fetch', fetchMock);

		await chatCompletionStream(
			config,
			{ ...request, temperature: 0.2, maxTokens: 100 },
			{ metadata: { prompt_id: 'v1' } }
		);

		const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
		expect(body).toMatchObject({
			stream_options: { include_usage: true },
			temperature: 0.2,
			max_tokens: 100,
			metadata: { prompt_id: 'v1' }
		});
	});

	it('records the finish reason and usage in the summary once the stream is read', async () => {
		const sse =
			delta('a') +
			`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'length' }] })}\n\n` +
			`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 } })}\n\n` +
			'data: [DONE]\n\n';
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(streamOf([sse]))));

		const result = await chatCompletionStream(config, request);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.summary).toEqual({});
		expect(await collect(result.tokens)).toEqual(['a']);
		expect(result.summary).toEqual({
			finishReason: 'length',
			usage: { promptTokens: 3, completionTokens: 5, totalTokens: 8 }
		});
	});

	it('leaves the summary empty when the stream reports nothing', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(new Response(streamOf([delta('a') + 'data: [DONE]\n\n'])))
		);

		const result = await chatCompletionStream(config, request);

		if (!result.ok) throw new Error('expected ok');
		await collect(result.tokens);
		expect(result.summary).toEqual({});
	});

	it('yields tokens even when lines are split across chunks', async () => {
		const sse = delta('Hel') + delta('lo') + 'data: [DONE]\n\n';
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(new Response(streamOf([sse.slice(0, 20), sse.slice(20)])))
		);

		const result = await chatCompletionStream(config, request);

		expect(result.ok).toBe(true);
		if (result.ok) expect(await collect(result.tokens)).toEqual(['Hel', 'lo']);
	});

	it('skips empty deltas and stops at [DONE]', async () => {
		const sse = delta(null) + delta('a') + delta('') + 'data: [DONE]\n\n' + delta('ignored');
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(streamOf([sse]))));

		const result = await chatCompletionStream(config, request);

		expect(result.ok).toBe(true);
		if (result.ok) expect(await collect(result.tokens)).toEqual(['a']);
	});

	it('returns a non-2xx response as an error result', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(
					new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429 })
				)
		);

		const result = await chatCompletionStream(config, request);

		expect(result).toEqual({
			ok: false,
			status: 429,
			body: { error: { message: 'rate limited' } }
		});
	});
});
