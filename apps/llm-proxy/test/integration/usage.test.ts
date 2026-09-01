import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

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
});

afterAll(async () => {
	await app.close();
});

describe('GET /v1/usage and /v1/usage/summary', () => {
	it('reads back logged requests and aggregates them', async () => {
		await db.insert(requestLogs).values([
			{
				clientId: 'dashboard',
				provider: 'openai',
				model: 'gpt-4o-mini',
				promptTokens: 10,
				completionTokens: 5,
				totalTokens: 15,
				latencyMs: 120,
				statusCode: 200
			},
			{
				clientId: 'bszrs',
				provider: 'openai',
				model: 'gpt-4o-mini',
				promptTokens: 20,
				completionTokens: 10,
				totalTokens: 30,
				latencyMs: 200,
				statusCode: 200
			}
		]);

		const usageResponse = await app.inject({
			method: 'GET',
			url: '/v1/usage',
			headers: { 'x-internal-api-key': 'test-secret' }
		});
		expect(usageResponse.statusCode).toBe(200);
		expect(usageResponse.json()).toHaveLength(2);

		const summaryResponse = await app.inject({
			method: 'GET',
			url: '/v1/usage/summary',
			headers: { 'x-internal-api-key': 'test-secret' }
		});
		expect(summaryResponse.statusCode).toBe(200);
		expect(summaryResponse.json()).toMatchObject({
			requestCount: 2,
			totalTokens: 45
		});
	});
});
