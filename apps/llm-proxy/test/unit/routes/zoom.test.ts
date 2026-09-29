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

const level = (type: string) => ({
	blocks: [
		{
			blockDef: { type },
			generatorCode: `forBlock["${type}"] = function(block, generator) { return ''; };`,
			toolboxEntry: { kind: 'block', type }
		}
	],
	workspaceJson: { blocks: { languageVersion: 0, blocks: [] } }
});

const validZoom = { semantic: level('zoom_x_op'), concept: level('zoom_x_concept') };

const payload = { model: 'local-ollama', slug: 'x', workspaceJson: { blocks: {} } };

function litellmReply(content: string): Response {
	return new Response(
		JSON.stringify({
			model: 'local-ollama',
			choices: [{ message: { content }, finish_reason: 'stop' }],
			usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
		}),
		{ status: 200 }
	);
}

function postZoom(body: unknown = payload) {
	return app.inject({
		method: 'POST',
		url: '/v1/zoom',
		headers: { 'x-internal-api-key': 'test-secret' },
		payload: body as object
	});
}

describe('POST /v1/zoom', () => {
	it('rejects requests without the internal API key', async () => {
		const response = await app.inject({ method: 'POST', url: '/v1/zoom', payload });
		expect(response.statusCode).toBe(401);
	});

	it('rejects an invalid request body', async () => {
		const response = await postZoom({ model: 'local-ollama' });
		expect(response.statusCode).toBe(400);
	});

	it('returns the validated zoom levels', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(litellmReply(JSON.stringify(validZoom))));

		const response = await postZoom();

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual(validZoom);
	});

	it('retries with the error fed back when the model output is invalid', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(litellmReply('{ not json'))
			.mockResolvedValueOnce(litellmReply(JSON.stringify(validZoom)));
		vi.stubGlobal('fetch', fetchMock);

		const response = await postZoom();

		expect(response.statusCode).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
		expect(secondBody.messages[1].content).toContain('Your previous attempt was invalid');
	});

	it('returns 502 after exhausting all attempts', async () => {
		const fetchMock = vi.fn().mockImplementation(async () => litellmReply('nope'));
		vi.stubGlobal('fetch', fetchMock);

		const response = await postZoom();

		expect(response.statusCode).toBe(502);
		expect(response.json().error.code).toBe('invalid_model_output');
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it('forwards a non-2xx LiteLLM response with its original status code', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(
					new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429 })
				)
		);

		const response = await postZoom();

		expect(response.statusCode).toBe(429);
		expect(response.json()).toEqual({ error: { message: 'rate limited' } });
	});
});
