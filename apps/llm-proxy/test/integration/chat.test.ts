import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../src/app.js';
import type { Db } from '../../src/db/client.js';
import { requestLogs } from '../../src/db/schema.js';

process.env.INTERNAL_API_KEY ??= 'test-secret';
process.env.OPENAI_API_KEY ??= 'test-openai-key';
process.env.OPENAI_BASE_URL ??= 'https://example.test/v1';
process.env.OPENAI_DEFAULT_MODEL ??= 'gpt-4o-mini';

const { app } = buildApp();
let db: Db;

beforeAll(async () => {
	await app.ready();
	db = app.db;
});

afterEach(async () => {
	await db.delete(requestLogs);
	vi.unstubAllGlobals();
});

afterAll(async () => {
	await app.close();
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

	it('generates a completion and logs it to request_logs', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify({
						model: 'gpt-4o-mini',
						choices: [{ message: { content: 'generated code' }, finish_reason: 'stop' }],
						usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 }
					}),
					{ status: 200 }
				)
			)
		);

		const response = await app.inject({
			method: 'POST',
			url: '/v1/chat/completions',
			headers: { 'x-internal-api-key': 'test-secret', 'x-client-id': 'bszrs' },
			payload: { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] }
		});

		expect(response.statusCode).toBe(200);
		expect(response.json()).toMatchObject({ content: 'generated code' });

		const rows = await db.select().from(requestLogs).where(eq(requestLogs.clientId, 'bszrs'));
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ provider: 'openai', model: 'gpt-4o-mini', totalTokens: 20 });
	});
});
