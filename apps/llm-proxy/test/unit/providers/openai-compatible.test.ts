import { afterEach, describe, expect, it, vi } from 'vitest';

import { OpenAiCompatibleProvider } from '../../../src/providers/openai-compatible.js';

describe('OpenAiCompatibleProvider', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('normalizes an upstream OpenAI-compatible response', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					model: 'gpt-4o-mini',
					choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }],
					usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
				}),
				{ status: 200 }
			)
		);
		vi.stubGlobal('fetch', fetchMock);

		const provider = new OpenAiCompatibleProvider('openai', {
			baseUrl: 'https://example.test/v1',
			apiKey: 'test-key',
			defaultModel: 'gpt-4o-mini'
		});

		const result = await provider.chat({
			model: 'gpt-4o-mini',
			messages: [{ role: 'user', content: 'hi' }]
		});

		expect(result).toEqual({
			content: 'hello',
			model: 'gpt-4o-mini',
			usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
			finishReason: 'stop'
		});
		expect(fetchMock).toHaveBeenCalledWith(
			'https://example.test/v1/chat/completions',
			expect.objectContaining({ method: 'POST' })
		);
	});

	it('throws when the upstream request fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(new Response('', { status: 500 }))
		);

		const provider = new OpenAiCompatibleProvider('openai', {
			baseUrl: 'https://example.test/v1',
			defaultModel: 'gpt-4o-mini'
		});

		await expect(
			provider.chat({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] })
		).rejects.toThrow('Upstream provider "openai" returned 500');
	});
});
