// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { afterEach, describe, expect, it, vi } from 'vitest';

import { litellmComplete } from '../../baseline/litellm-complete.js';
import { findBenchmarkModel } from '../../baseline/model-registry.js';
import { identityFromModelString, isServed } from '../../baseline/models.js';
import type { CompleteRequest } from '../../baseline/runner.js';
import { baselineReport } from '../../report/baseline.js';
import { ok, run, runWith, testModel, validZoom } from './support/baseline-fakes.js';

afterEach(() => vi.unstubAllGlobals());

const request: CompleteRequest = {
	model: 'openrouter-2',
	messages: [{ role: 'user', content: 'hi' }],
	temperature: 0.2,
	maxTokens: 100,
	extra: { provider: { order: ['z-ai'], allow_fallbacks: false }, reasoning: { effort: 'low' } },
	tags: ['zoom', 'baseline:t'],
	promptId: 'v1'
};

/** A streamed answer, the way LiteLLM sends it: content, then the finish reason, then usage. */
function sse(options: { text?: string; provider?: string; reasoning?: number } = {}): Response {
	const chunk = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
	const body = [
		chunk({
			provider: options.provider ?? 'Z.AI',
			choices: [{ delta: { content: options.text ?? '{"ok":' } }]
		}),
		chunk({ choices: [{ delta: { content: '1}' }, finish_reason: 'stop' }] }),
		chunk({
			choices: [],
			usage: {
				prompt_tokens: 10,
				completion_tokens: 20,
				total_tokens: 30,
				completion_tokens_details: { reasoning_tokens: options.reasoning ?? 3 },
				cost: 0.0004
			}
		}),
		'data: [DONE]\n\n'
	].join('');
	return new Response(body, { status: 200 });
}

const error = (status: number, message = 'nope'): Response =>
	new Response(JSON.stringify({ error: { message } }), { status });

describe('litellmComplete', () => {
	it('sends the extra fields, and reads the reasoning tokens, cost and any provider back', async () => {
		const fetchMock = vi.fn().mockResolvedValue(sse());
		vi.stubGlobal('fetch', fetchMock);

		const result = await litellmComplete({ baseUrl: 'http://x', key: 'k' })(request);

		const sent = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
		expect(sent).toMatchObject({
			model: 'openrouter-2',
			temperature: 0.2,
			max_tokens: 100,
			stream: true,
			provider: { order: ['z-ai'], allow_fallbacks: false },
			reasoning: { effort: 'low' },
			metadata: { prompt_id: 'v1', tags: ['zoom', 'baseline:t'] }
		});
		expect(result).toMatchObject({
			ok: true,
			text: '{"ok":1}',
			finishReason: 'stop',
			provider: 'Z.AI',
			reasoningTokens: 3,
			cost: 0.0004,
			usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
		});
		expect(result.ok && result.firstTokenMs).toBeGreaterThanOrEqual(0);
		expect(result.ok && result.retries).toBeUndefined();
	});

	it('sends no extra fields when the model has none', async () => {
		const fetchMock = vi.fn().mockResolvedValue(sse());
		vi.stubGlobal('fetch', fetchMock);
		await litellmComplete({ baseUrl: 'http://x', key: 'k' })({ ...request, extra: undefined });
		const sent = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
		expect(sent).not.toHaveProperty('provider');
		expect(sent).not.toHaveProperty('reasoning');
	});

	it('repeats a busy answer after a wait, and says how often', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(error(429, 'No deployments available'))
			.mockResolvedValueOnce(error(503))
			.mockResolvedValueOnce(sse());
		vi.stubGlobal('fetch', fetchMock);
		const waits: number[] = [];

		const result = await litellmComplete({
			baseUrl: 'http://x',
			key: 'k',
			sleep: async (ms) => void waits.push(ms)
		})(request);

		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(waits).toEqual([8000, 20000]);
		expect(result).toMatchObject({ ok: true, retries: 2 });
	});

	it('gives up after three repeats', async () => {
		const fetchMock = vi.fn().mockImplementation(async () => error(429, 'busy'));
		vi.stubGlobal('fetch', fetchMock);
		const result = await litellmComplete({
			baseUrl: 'http://x',
			key: 'k',
			sleep: async () => {}
		})(request);
		expect(fetchMock).toHaveBeenCalledTimes(4);
		expect(result).toMatchObject({ ok: false, status: 429 });
	});

	it('does not repeat a request the provider rejected (a pin that cannot be served is a 404)', async () => {
		const fetchMock = vi.fn().mockResolvedValue(error(404, 'No endpoints found'));
		vi.stubGlobal('fetch', fetchMock);
		const result = await litellmComplete({ baseUrl: 'http://x', key: 'k' })(request);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(result).toMatchObject({ ok: false, status: 404 });
		expect(result.ok === false && result.message).toContain('No endpoints found');
	});

	it('reports a network error as a failure after the repeats', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));
		const result = await litellmComplete({
			baseUrl: 'http://x',
			key: 'k',
			sleep: async () => {}
		})(request);
		expect(result).toMatchObject({ ok: false, status: 0 });
	});
});

describe('model registry', () => {
	it('knows the two baseline models, each pinned to one provider with no fallback', () => {
		for (const id of ['glm-5.3-flash', 'deepseek-v4.1-flash-1017']) {
			const model = findBenchmarkModel(id);
			expect(model.model.startsWith('openrouter/')).toBe(true);
			expect(model.model.endsWith(id)).toBe(true);
			expect(model.request?.provider?.allow_fallbacks).toBe(false);
			expect(model.request?.provider?.order).toHaveLength(1);
		}
		expect(findBenchmarkModel('glm-5.3-flash').request?.provider?.order).toEqual(['z-ai']);
		expect(findBenchmarkModel('deepseek-v4.1-flash-1017').request?.provider?.order).toEqual([
			'deepinfra'
		]);
	});

	it('refuses an unknown id and lists the known ones', () => {
		expect(() => findBenchmarkModel('nope')).toThrow(/Known: glm-5.3-flash/);
	});

	it('names the model, provider and maker from a full LiteLLM model string', () => {
		expect(identityFromModelString('openrouter/z-ai/glm-5.3-flash')).toEqual({
			model: 'glm-5.3-flash',
			provider: 'openrouter',
			vendor: 'z-ai',
			litellmModel: 'openrouter/z-ai/glm-5.3-flash'
		});
		expect(identityFromModelString('gpt-4o-mini').provider).toBeUndefined();
	});
});

describe('isServed', () => {
	const routes = ['openrouter', 'openrouter-2', 'gpt-4o-mini', 'openrouter/*'];

	it('accepts a name a route has exactly, or one a wildcard route covers', () => {
		expect(isServed('openrouter-2', routes)).toBe(true);
		expect(isServed('openrouter/z-ai/glm-5.3-flash', routes)).toBe(true);
	});

	it('refuses a name no route covers, and a wildcard of another provider', () => {
		expect(isServed('openrouter/z-ai/glm-5.3-flash', routes.slice(0, 3))).toBe(false);
		expect(isServed('anthropic/claude-x', routes)).toBe(false);
		expect(isServed('openrouterish', routes)).toBe(false);
	});
});

describe('a run under conditions', () => {
	it('sends the model, its extra fields and the prompt tags, and records what answered', async () => {
		const seen: CompleteRequest[] = [];
		const record = await run(async (call) => {
			seen.push(call);
			return ok(validZoom(), { provider: 'Z.AI', reasoningTokens: 7, cost: 0.001, retries: 1 });
		});
		expect(seen[0].model).toBe('a-alias');
		expect(seen[0].extra).toBeUndefined();

		const pinned = {
			...testModel,
			request: { provider: { order: ['z-ai'], allow_fallbacks: false } }
		};
		const withPin = await runWith(pinned, async (call) => {
			seen.push(call);
			return ok(validZoom(), { provider: 'Z.AI', reasoningTokens: 7, cost: 0.002 });
		});
		expect(seen[1].extra).toEqual({ provider: { order: ['z-ai'], allow_fallbacks: false } });
		expect(seen[1].tags).toContain('baseline:test-run');
		expect(withPin.model).toMatchObject({ id: 'a', sentAs: 'a-alias', request: pinned.request });
		expect(withPin.attempts[0]).toMatchObject({ provider: 'Z.AI', reasoningTokens: 7 });
		expect(withPin.metrics).toMatchObject({
			reasoningTokens: 7,
			costUsd: 0.002,
			providers: ['Z.AI']
		});
		expect(record.attempts[0].retries).toBe(1);
	});

	it('shows the serving provider in the report', async () => {
		const good = await run(async () => ok(validZoom(), { provider: 'DeepInfra' }));
		const report = baselineReport({
			kind: 'baseline',
			runId: 'r',
			modelIds: ['a'],
			records: [good]
		});
		expect(report?.rows[0].facts?.servedBy).toBe('DeepInfra');
	});
});
