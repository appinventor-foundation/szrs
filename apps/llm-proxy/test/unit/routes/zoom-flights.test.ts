import { ZoomStreamEventSchema } from '@szrs/llm-proxy-contracts';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../../src/app.js';

process.env.INTERNAL_API_KEY ||= 'test-secret';
process.env.LITELLM_VIRTUAL_KEY ||= 'test-litellm-key';

const { app } = buildApp(process.env, { zoomCache: null });

beforeAll(async () => {
	await app.ready();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

const program = (repeat: string, times: string, x: number) => ({
	blocks: {
		languageVersion: 0,
		blocks: [
			{
				type: 'controls_repeat_ext',
				id: repeat,
				x,
				y: 0,
				inputs: { TIMES: { shadow: { type: 'math_number', id: times, fields: { NUM: 5 } } } }
			}
		]
	}
});

const level = (type: string) => ({
	blockDefs: [{ type, message0: 'do it' }],
	workspaceJson: { blocks: { languageVersion: 0, blocks: [] } },
	bindings: []
});

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

function litellmStream(content: string): Response {
	const sse =
		`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n` + 'data: [DONE]\n\n';
	return new Response(sse, { status: 200 });
}

const postStream = (workspaceJson: unknown, model = 'local-ollama') =>
	app.inject({
		method: 'POST',
		url: '/v1/zoom/stream',
		headers: { 'x-internal-api-key': 'test-secret' },
		payload: { model, slug: 'x', workspaceJson }
	});

function events(raw: string) {
	return raw
		.split('\n\n')
		.filter((chunk) => chunk.startsWith('data: '))
		.map((chunk) => ZoomStreamEventSchema.parse(JSON.parse(chunk.slice('data: '.length))));
}

const bindingRefs = (raw: string) => {
	const done = events(raw).find((event) => event.type === 'done');
	return done?.type === 'done' ? done.result.semantic.bindings[0].detail : undefined;
};

describe('concurrent zoom requests', () => {
	it('share one model call, and each gets the result in its own ids', async () => {
		let open: () => void = () => {};
		const gate = new Promise<void>((resolve) => (open = resolve));
		const fetchMock = vi.fn().mockImplementation(async () => {
			await gate;
			return litellmStream(JSON.stringify(modelZoom));
		});
		vi.stubGlobal('fetch', fetchMock);

		// Three users with the same program, saved with different ids.
		const responses = [
			postStream(program('a-repeat', 'a-times', 10)),
			postStream(program('b-repeat', 'b-times', 200)),
			postStream(program('c-repeat', 'c-times', 30))
		];
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		// Give the others time to reach the running zoom before the model answers.
		await new Promise((resolve) => setTimeout(resolve, 50));
		open();
		const [a, b, c] = await Promise.all(responses);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(bindingRefs(a.body)).toEqual([{ block: 'a-times', field: 'NUM' }]);
		expect(bindingRefs(b.body)).toEqual([{ block: 'b-times', field: 'NUM' }]);
		expect(bindingRefs(c.body)).toEqual([{ block: 'c-times', field: 'NUM' }]);
		for (const response of [a, b, c]) {
			expect(events(response.body)[0]).toMatchObject({ type: 'attempt', attempt: 1 });
		}
	});

	it('do not share a call across models', async () => {
		let open: () => void = () => {};
		const gate = new Promise<void>((resolve) => (open = resolve));
		const fetchMock = vi.fn().mockImplementation(async () => {
			await gate;
			return litellmStream(JSON.stringify(modelZoom));
		});
		vi.stubGlobal('fetch', fetchMock);

		const responses = [
			postStream(program('r', 't', 0), 'local-ollama'),
			postStream(program('r', 't', 0), 'openrouter')
		];
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		open();
		await Promise.all(responses);

		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('start a new model call once the previous zoom has finished (no cache)', async () => {
		const fetchMock = vi
			.fn()
			.mockImplementation(async () => litellmStream(JSON.stringify(modelZoom)));
		vi.stubGlobal('fetch', fetchMock);

		await postStream(program('r', 't', 0));
		await postStream(program('r', 't', 0));

		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
