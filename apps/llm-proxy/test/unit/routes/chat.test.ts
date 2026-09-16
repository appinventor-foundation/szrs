import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../../src/app.js';

process.env.INTERNAL_API_KEY ||= 'test-secret';
process.env.LITELLM_VIRTUAL_KEY ||= 'test-litellm-key';

const { app } = buildApp();

beforeAll(async () => {
	await app.ready();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('POST /v1/chat/completions', () => {
	it('rejects requests without the internal API key', async () => {
		const response = await app.inject({
			method: 'POST',
			url: '/v1/chat/completions',
			payload: { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] }
		});

		expect(response.statusCode).toBe(401);
	});

	it('forwards to LiteLLM and normalizes the response shape', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					model: 'gpt-4o-mini',
					choices: [{ message: { content: 'generated code' }, finish_reason: 'stop' }],
					usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 }
				}),
				{ status: 200 }
			)
		);
		vi.stubGlobal('fetch', fetchMock);

		const response = await app.inject({
			method: 'POST',
			url: '/v1/chat/completions',
			headers: { 'x-internal-api-key': 'test-secret' },
			payload: { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] }
		});

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual({
			content: 'generated code',
			model: 'gpt-4o-mini',
			usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 },
			finishReason: 'stop'
		});
		expect(fetchMock).toHaveBeenCalledWith(
			'http://localhost:4000/v1/chat/completions',
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({ authorization: 'Bearer test-litellm-key' })
			})
		);
	});

	it('forwards a non-2xx LiteLLM response with its original status code', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429 })
			)
		);

		const response = await app.inject({
			method: 'POST',
			url: '/v1/chat/completions',
			headers: { 'x-internal-api-key': 'test-secret' },
			payload: { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] }
		});

		expect(response.statusCode).toBe(429);
		expect(response.json()).toEqual({ error: { message: 'rate limited' } });
	});
});
