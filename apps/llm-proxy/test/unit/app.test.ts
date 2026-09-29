import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../src/app.js';

const baseEnv = { LITELLM_VIRTUAL_KEY: 'test-litellm-key', LOG_LEVEL: 'silent' };

afterEach(() => {
	vi.unstubAllGlobals();
});

async function appWith(env: Record<string, string>) {
	const { app } = buildApp({ ...baseEnv, ...env });
	await app.ready();
	return app;
}

function stubLiteLLM() {
	vi.stubGlobal(
		'fetch',
		vi.fn().mockImplementation(
			async () =>
				new Response(
					JSON.stringify({
						model: 'local-ollama',
						choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
						usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
					}),
					{ status: 200 }
				)
		)
	);
}

const chatRequest = {
	method: 'POST' as const,
	url: '/v1/chat/completions',
	payload: { model: 'local-ollama', messages: [{ role: 'user', content: 'hi' }] }
};

describe('auth', () => {
	it('does not require a key when INTERNAL_API_KEY is unset', async () => {
		stubLiteLLM();
		const app = await appWith({});

		const response = await app.inject(chatRequest);

		expect(response.statusCode).toBe(200);
	});
});

describe('CORS', () => {
	it('allows configured origins only', async () => {
		stubLiteLLM();
		const app = await appWith({ CORS_ORIGINS: 'https://blocks.example' });

		const allowed = await app.inject({
			...chatRequest,
			headers: { origin: 'https://blocks.example' }
		});
		const other = await app.inject({ ...chatRequest, headers: { origin: 'https://evil.example' } });

		expect(allowed.headers['access-control-allow-origin']).toBe('https://blocks.example');
		expect(other.headers['access-control-allow-origin']).toBeUndefined();
	});

	it('answers preflight requests without the API key', async () => {
		const app = await appWith({
			CORS_ORIGINS: 'https://blocks.example',
			INTERNAL_API_KEY: 'test-secret'
		});

		const response = await app.inject({
			method: 'OPTIONS',
			url: '/v1/zoom',
			headers: {
				origin: 'https://blocks.example',
				'access-control-request-method': 'POST',
				'access-control-request-headers': 'content-type, x-internal-api-key'
			}
		});

		expect(response.statusCode).toBe(204);
		expect(response.headers['access-control-allow-origin']).toBe('https://blocks.example');
	});
});

describe('rate limiting', () => {
	it('rejects requests over the limit with rate_limited', async () => {
		stubLiteLLM();
		const app = await appWith({ RATE_LIMIT_MAX: '2' });

		await app.inject(chatRequest);
		await app.inject(chatRequest);
		const response = await app.inject(chatRequest);

		expect(response.statusCode).toBe(429);
		expect(response.json().error.code).toBe('rate_limited');
	});

	it('never limits health checks', async () => {
		const app = await appWith({ RATE_LIMIT_MAX: '1' });

		const statuses = [];
		for (let i = 0; i < 3; i++) {
			statuses.push((await app.inject({ method: 'GET', url: '/healthz' })).statusCode);
		}

		expect(statuses).toEqual([200, 200, 200]);
	});
});
