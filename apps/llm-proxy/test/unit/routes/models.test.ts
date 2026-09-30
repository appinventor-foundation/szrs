import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../../src/app.js';

process.env.INTERNAL_API_KEY ||= 'test-secret';
process.env.LITELLM_VIRTUAL_KEY ||= 'test-litellm-key';

const { app, config } = buildApp();

beforeAll(async () => {
	await app.ready();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('GET /v1/models', () => {
	it('rejects requests without the internal API key', async () => {
		const response = await app.inject({ method: 'GET', url: '/v1/models' });

		expect(response.statusCode).toBe(401);
	});

	it('maps the LiteLLM model list and authenticates with the virtual key', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					object: 'list',
					data: [
						{ id: 'local-ollama', object: 'model' },
						{ id: 'gpt-4o-mini', object: 'model' }
					]
				}),
				{ status: 200 }
			)
		);
		vi.stubGlobal('fetch', fetchMock);

		const response = await app.inject({
			method: 'GET',
			url: '/v1/models',
			headers: { 'x-internal-api-key': process.env.INTERNAL_API_KEY }
		});

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual({ models: ['local-ollama', 'gpt-4o-mini'] });
		expect(fetchMock).toHaveBeenCalledWith(`${config.LITELLM_BASE_URL}/v1/models`, {
			headers: { authorization: `Bearer ${process.env.LITELLM_VIRTUAL_KEY}` }
		});
	});

	it('forwards an upstream error status and body', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'bad key' }), { status: 401 }))
		);

		const response = await app.inject({
			method: 'GET',
			url: '/v1/models',
			headers: { 'x-internal-api-key': process.env.INTERNAL_API_KEY }
		});

		expect(response.statusCode).toBe(401);
		expect(response.json()).toEqual({ error: 'bad key' });
	});
});
