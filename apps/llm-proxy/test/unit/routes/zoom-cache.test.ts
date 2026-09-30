import { ZoomStreamEventSchema } from '@szrs/llm-proxy-contracts';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../../src/app.js';
import type { ZoomCache } from '../../../src/zoom/cache.js';
import { zoomCacheKey } from '../../../src/zoom/cache-key.js';
import { normalizeWorkspace } from '../../../src/zoom/normalize.js';

process.env.INTERNAL_API_KEY ||= 'test-secret';
process.env.LITELLM_VIRTUAL_KEY ||= 'test-litellm-key';

/** A cache in memory that round-trips through JSON, like a real one. */
function memoryCache() {
	const store = new Map<string, string>();
	const cache: ZoomCache = {
		get: async (key) => (store.has(key) ? (JSON.parse(store.get(key)!) as unknown) : null),
		set: async (key, result) => {
			store.set(key, JSON.stringify(result));
		},
		close: async () => {}
	};
	return { store, cache };
}

const memory = memoryCache();
const { app } = buildApp(process.env, { zoomCache: memory.cache });

beforeAll(async () => {
	await app.ready();
});

afterEach(() => {
	vi.unstubAllGlobals();
	memory.store.clear();
});

// The same program saved by two users: different ids, different positions.
const program = (ids: { repeat: string; times: string }, x: number, y: number) => ({
	blocks: {
		languageVersion: 0,
		blocks: [
			{
				type: 'controls_repeat_ext',
				id: ids.repeat,
				x,
				y,
				inputs: { TIMES: { shadow: { type: 'math_number', id: ids.times, fields: { NUM: 5 } } } }
			}
		]
	}
});
const mine = program({ repeat: 'mine-repeat', times: 'mine-times' }, 10, 20);
const theirs = program({ repeat: 'their-repeat', times: 'their-times' }, 300, 40);

const level = (type: string) => ({
	blockDefs: [{ type, message0: 'do it' }],
	workspaceJson: { blocks: { languageVersion: 0, blocks: [] } },
	bindings: []
});

// What the model says, in canonical ids: b1 is the repeat block, b2 its number.
const modelZoom = {
	semantic: {
		blockDefs: [
			{ type: 'zoom_x_op', message0: 'repeat %1', args0: [{ type: 'field_number', name: 'LIMIT' }] }
		],
		workspaceJson: { blocks: { languageVersion: 0, blocks: [{ type: 'zoom_x_op', id: 's1' }] } },
		bindings: [{ block: 's1', field: 'LIMIT', detail: [{ block: 'b2', field: 'NUM' }] }]
	},
	concept: level('zoom_x_concept')
};

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

function litellmStream(content: string): Response {
	const sse =
		`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n` + 'data: [DONE]\n\n';
	return new Response(sse, { status: 200 });
}

const request = (workspaceJson: unknown, model = 'local-ollama') => ({
	model,
	slug: 'x',
	workspaceJson
});

const headers = { 'x-internal-api-key': 'test-secret' };

const postZoom = (body: unknown) =>
	app.inject({ method: 'POST', url: '/v1/zoom', headers, payload: body as object });

const postStream = (body: unknown) =>
	app.inject({ method: 'POST', url: '/v1/zoom/stream', headers, payload: body as object });

function doneEvent(raw: string) {
	const events = raw
		.split('\n\n')
		.filter((chunk) => chunk.startsWith('data: '))
		.map((chunk) => ZoomStreamEventSchema.parse(JSON.parse(chunk.slice('data: '.length))));
	return { events, done: events.find((event) => event.type === 'done') };
}

describe('zoom caching', () => {
	it('serves the same program from the cache for another user, in their ids', async () => {
		const fetchMock = vi
			.fn()
			.mockImplementation(async () => litellmReply(JSON.stringify(modelZoom)));
		vi.stubGlobal('fetch', fetchMock);

		const first = await postZoom(request(mine));
		const second = await postZoom(request(theirs));

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(first.json().semantic.bindings[0].detail).toEqual([
			{ block: 'mine-times', field: 'NUM' }
		]);
		expect(second.statusCode).toBe(200);
		expect(second.json().semantic.bindings[0].detail).toEqual([
			{ block: 'their-times', field: 'NUM' }
		]);
	});

	it('stores the result in canonical ids, keyed without the user’s ids', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(litellmReply(JSON.stringify(modelZoom))));

		await postZoom(request(mine));

		const key = zoomCacheKey(request(normalizeWorkspace(mine).workspaceJson));
		expect([...memory.store.keys()]).toEqual([key]);
		expect(JSON.parse(memory.store.get(key)!).semantic.bindings[0].detail).toEqual([
			{ block: 'b2', field: 'NUM' }
		]);
	});

	it('marks a streamed hit as cached, with no attempt or token events', async () => {
		const fetchMock = vi
			.fn()
			.mockImplementation(async () => litellmStream(JSON.stringify(modelZoom)));
		vi.stubGlobal('fetch', fetchMock);

		const first = doneEvent((await postStream(request(mine))).body);
		const second = doneEvent((await postStream(request(theirs))).body);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(first.done).toMatchObject({ type: 'done' });
		expect(first.done && 'cached' in first.done).toBe(false);
		expect(second.events.map((event) => event.type)).toEqual(['done']);
		expect(second.done).toMatchObject({ type: 'done', cached: true });
		expect(second.done?.type === 'done' && second.done.result.semantic.bindings[0].detail).toEqual([
			{ block: 'their-times', field: 'NUM' }
		]);
	});

	it('does not share entries between models or programs', async () => {
		const fetchMock = vi
			.fn()
			.mockImplementation(async () => litellmReply(JSON.stringify(modelZoom)));
		vi.stubGlobal('fetch', fetchMock);
		const changed = program({ repeat: 'a', times: 'b' }, 0, 0);
		(changed.blocks.blocks[0].inputs.TIMES.shadow.fields as { NUM: number }).NUM = 6;

		await postZoom(request(mine));
		await postZoom(request(mine, 'openrouter'));
		await postZoom(request(changed));

		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(memory.store.size).toBe(3);
	});

	it('does not store a zoom that never passed validation', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockImplementation(async () => litellmReply('nope'))
		);

		const response = await postZoom(request(mine));

		expect(response.statusCode).toBe(502);
		expect(memory.store.size).toBe(0);
	});

	it('ignores a corrupt entry, zooms again and replaces it', async () => {
		const fetchMock = vi
			.fn()
			.mockImplementation(async () => litellmReply(JSON.stringify(modelZoom)));
		vi.stubGlobal('fetch', fetchMock);
		const key = zoomCacheKey(request(normalizeWorkspace(mine).workspaceJson));
		memory.store.set(key, JSON.stringify({ semantic: 'garbage' }));

		const response = await postZoom(request(mine));

		expect(response.statusCode).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(JSON.parse(memory.store.get(key)!).semantic.blockDefs).toBeDefined();
	});
});

describe('without a cache', () => {
	it('zooms every time', async () => {
		const { app: plain } = buildApp(process.env, { zoomCache: null });
		await plain.ready();
		const fetchMock = vi
			.fn()
			.mockImplementation(async () => litellmReply(JSON.stringify(modelZoom)));
		vi.stubGlobal('fetch', fetchMock);
		const post = () =>
			plain.inject({ method: 'POST', url: '/v1/zoom', headers, payload: request(mine) });

		expect((await post()).statusCode).toBe(200);
		expect((await post()).statusCode).toBe(200);

		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
