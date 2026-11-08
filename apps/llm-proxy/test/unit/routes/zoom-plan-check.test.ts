// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { ZoomStreamEventSchema } from '@szrs/llm-proxy-contracts';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../../src/app.js';
import type { ZoomCache } from '../../../src/zoom/cache.js';
import { coloured } from '../coloured.js';

process.env.INTERNAL_API_KEY ||= 'test-secret';
process.env.LITELLM_VIRTUAL_KEY ||= 'test-litellm-key';

const stored: unknown[] = [];
const cache: ZoomCache = {
	get: async () => null,
	set: async (_key, result) => {
		stored.push(result);
	},
	close: async () => {}
};
const { app } = buildApp(process.env, { zoomCache: cache });

beforeAll(async () => {
	await app.ready();
});

afterEach(() => {
	vi.unstubAllGlobals();
	stored.length = 0;
});

// One Detail stack, so a Concept level with two blocks breaks rule B (plan-check.ts).
const program = {
	blocks: {
		languageVersion: 0,
		blocks: [
			{
				type: 'controls_repeat_ext',
				id: 'mine-repeat',
				inputs: { TIMES: { shadow: { type: 'math_number', id: 'mine-times', fields: { NUM: 5 } } } }
			}
		]
	}
};
const payload = { model: 'local-ollama', slug: 'x', workspaceJson: program };

const level = (type: string, blocks: number) => ({
	blockDefs: [{ type, message0: 'do it' }],
	workspaceJson: {
		blocks: {
			languageVersion: 0,
			blocks: Array.from({ length: blocks }, (_, i) => ({ type, id: `${type.slice(-3)}${i}` }))
		}
	},
	bindings: []
});
const zoomWith = (concepts: number) => ({
	semantic: level('zoom_x_op', 1),
	concept: level('zoom_x_concept', concepts)
});
const clean = zoomWith(1);
const flagged = zoomWith(3);

const reply = (content: string) =>
	new Response(
		JSON.stringify({
			model: 'local-ollama',
			choices: [{ message: { content }, finish_reason: 'stop' }],
			usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
		}),
		{ status: 200 }
	);
const sent = (fetchMock: ReturnType<typeof vi.fn>, n: number): string =>
	JSON.parse(fetchMock.mock.calls[n][1].body as string).messages[1].content;

const post = (url: string) =>
	app.inject({
		method: 'POST',
		url,
		headers: { 'x-internal-api-key': 'test-secret' },
		payload
	});

describe('POST /v1/zoom: a valid zoom that breaks a plan rule', () => {
	it('is sent back with what is wrong, and the better zoom is the answer', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(reply(JSON.stringify(flagged)))
			.mockResolvedValueOnce(reply(JSON.stringify(clean)));
		vi.stubGlobal('fetch', fetchMock);

		const response = await post('/v1/zoom');

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual(coloured(clean));
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(sent(fetchMock, 1)).toContain('Your previous attempt was invalid');
		expect(sent(fetchMock, 1)).toContain(
			'concept: 3 concept blocks for a program with 1 top-level stack'
		);
		expect(stored).toEqual([coloured(clean)]);
	});

	it('is the answer if every attempt breaks the rule, and is not stored', async () => {
		const fetchMock = vi.fn().mockImplementation(async () => reply(JSON.stringify(flagged)));
		vi.stubGlobal('fetch', fetchMock);

		const response = await post('/v1/zoom');

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual(coloured(flagged));
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(stored).toEqual([]);
	});

	it('is the answer when the next attempt is invalid JSON every time', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(reply(JSON.stringify(flagged)))
			.mockImplementation(async () => reply('nope'));
		vi.stubGlobal('fetch', fetchMock);

		const response = await post('/v1/zoom');

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual(coloured(flagged));
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it('is the answer when the next attempt is cut off by the output limit', async () => {
		const cutOff = new Response(
			JSON.stringify({
				model: 'local-ollama',
				choices: [{ message: { content: '{ "semantic' }, finish_reason: 'length' }],
				usage: { prompt_tokens: 1, completion_tokens: 8192, total_tokens: 8193 }
			}),
			{ status: 200 }
		);
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(reply(JSON.stringify(flagged)))
			.mockResolvedValueOnce(cutOff);
		vi.stubGlobal('fetch', fetchMock);

		const response = await post('/v1/zoom');

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual(coloured(flagged));
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('is the answer when the next call to LiteLLM fails', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(reply(JSON.stringify(flagged)))
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429 })
			);
		vi.stubGlobal('fetch', fetchMock);

		const response = await post('/v1/zoom');

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual(coloured(flagged));
		// It asked again, and the failure of that second call is what it fell back from.
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('still fails when nothing valid was ever made', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockImplementation(async () => reply('nope'))
		);
		expect((await post('/v1/zoom')).statusCode).toBe(502);
	});
});

describe('POST /v1/zoom/stream: a valid zoom that breaks a plan rule', () => {
	function stream(content: string): Response {
		const half = Math.floor(content.length / 2);
		const sse =
			[content.slice(0, half), content.slice(half)]
				.map((text) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`)
				.join('') + 'data: [DONE]\n\n';
		return new Response(sse, { status: 200 });
	}
	const events = async () =>
		(await post('/v1/zoom/stream')).body
			.split('\n\n')
			.filter((chunk) => chunk.startsWith('data: '))
			.map((chunk) => ZoomStreamEventSchema.parse(JSON.parse(chunk.slice('data: '.length))));

	it('is sent back with what is wrong, as an attempt event, and the better zoom is the answer', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(stream(JSON.stringify(flagged)))
			.mockResolvedValueOnce(stream(JSON.stringify(clean)));
		vi.stubGlobal('fetch', fetchMock);

		const all = await events();

		const attempts = all.filter((event) => event.type === 'attempt');
		expect(attempts).toHaveLength(2);
		expect(attempts[1]).toMatchObject({
			attempt: 2,
			previousError: expect.stringContaining('concept: 3 concept blocks')
		});
		expect(all.at(-1)).toEqual({ type: 'done', result: coloured(clean) });
		expect(stored).toEqual([coloured(clean)]);
	});

	it('is the answer if every attempt breaks the rule, and is not stored', async () => {
		const fetchMock = vi.fn().mockImplementation(async () => stream(JSON.stringify(flagged)));
		vi.stubGlobal('fetch', fetchMock);

		const all = await events();

		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(all.at(-1)).toEqual({ type: 'done', result: coloured(flagged) });
		expect(stored).toEqual([]);
	});

	it('is the answer when the next call to LiteLLM fails', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(stream(JSON.stringify(flagged)))
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429 })
			);
		vi.stubGlobal('fetch', fetchMock);

		const all = await events();

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(all.at(-1)).toEqual({ type: 'done', result: coloured(flagged) });
		expect(all.some((event) => event.type === 'error')).toBe(false);
	});

	it('still ends with an error when nothing valid was ever made', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockImplementation(async () => stream('nope'))
		);
		expect((await events()).at(-1)).toMatchObject({ type: 'error', code: 'invalid_model_output' });
	});
});
