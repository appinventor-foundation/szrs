import { ZoomStreamEventSchema } from '@szrs/llm-proxy-contracts';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../../src/app.js';
import { getZoomPrompt } from '../../../src/zoom/prompts/index.js';
import { coloured } from '../coloured.js';

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
	blockDefs: [{ type, message0: 'do it' }],
	workspaceJson: { blocks: { languageVersion: 0, blocks: [{ type, id: 'l1' }] } },
	bindings: []
});

const validZoom = { semantic: level('zoom_x_op'), concept: level('zoom_x_concept') };

// The model's plan, in canonical ids: b1 is the repeat, b2 its number.
const planned = {
	plan: {
		purpose: 'repeat',
		concepts: [{ id: 'c1', stacks: ['b1'], operations: ['l1'] }],
		covers: { l1: ['b2', 'b1'] }
	},
	...validZoom
};
const plannedInCallerIds = {
	purpose: 'repeat',
	concepts: [{ id: 'c1', stacks: ['r@ndom-id'], operations: ['l1'] }],
	covers: { l1: ['n#um-id', 'r@ndom-id'] }
};

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

// A Detail program whose block ids are Blockly-style random ones, and a model
// reply (in canonical ids) that binds a zoomed field to its number.
const randomIdWorkspace = {
	blocks: {
		languageVersion: 0,
		blocks: [
			{
				type: 'controls_repeat_ext',
				id: 'r@ndom-id',
				x: 40,
				y: 60,
				inputs: { TIMES: { shadow: { type: 'math_number', id: 'n#um-id', fields: { NUM: 5 } } } }
			}
		]
	}
};

const boundZoom = {
	semantic: {
		blockDefs: [
			{ type: 'zoom_x_op', message0: 'repeat %1', args0: [{ type: 'field_number', name: 'LIMIT' }] }
		],
		workspaceJson: { blocks: { languageVersion: 0, blocks: [{ type: 'zoom_x_op', id: 's1' }] } },
		// Canonical ids: b1 is the repeat block, b2 its number.
		bindings: [{ block: 's1', field: 'LIMIT', detail: [{ block: 'b2', field: 'NUM' }] }]
	},
	concept: level('zoom_x_concept')
};

const randomIdPayload = { ...payload, workspaceJson: randomIdWorkspace };

/** The user message of the request `fetchMock` received on call `n`. */
function promptOf(fetchMock: ReturnType<typeof vi.fn>, n = 0): string {
	return JSON.parse(fetchMock.mock.calls[n][1].body as string).messages[1].content;
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
		expect(response.json()).toEqual(coloured(validZoom));
	});

	it('prompts with canonical ids and returns bindings in the caller’s ids', async () => {
		const fetchMock = vi.fn().mockResolvedValue(litellmReply(JSON.stringify(boundZoom)));
		vi.stubGlobal('fetch', fetchMock);

		const response = await postZoom(randomIdPayload);

		expect(response.statusCode).toBe(200);
		const prompt = promptOf(fetchMock);
		expect(prompt).toContain('"b1"');
		expect(prompt).toContain('"b2"');
		expect(prompt).not.toContain('r@ndom-id');
		expect(prompt).not.toContain('n#um-id');
		expect(prompt).not.toContain('"x"');
		expect(response.json().semantic.bindings[0].detail).toEqual([
			{ block: 'n#um-id', field: 'NUM' }
		]);
	});

	it('returns the plan, in the caller’s ids', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(litellmReply(JSON.stringify(planned))));

		const response = await postZoom(randomIdPayload);

		expect(response.statusCode).toBe(200);
		expect(response.json().plan).toEqual(plannedInCallerIds);
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

	it('sends the prompt’s sampling parameters and trace metadata', async () => {
		const fetchMock = vi.fn().mockResolvedValue(litellmReply(JSON.stringify(validZoom)));
		vi.stubGlobal('fetch', fetchMock);

		await postZoom();

		const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
		expect(body).toMatchObject({
			temperature: getZoomPrompt().params.temperature,
			max_tokens: getZoomPrompt().params.maxTokens,
			metadata: { prompt_id: getZoomPrompt().id }
		});
	});

	it('fails without a retry when the output was cut off by the limit', async () => {
		const cutOff = new Response(
			JSON.stringify({
				model: 'local-ollama',
				choices: [{ message: { content: '{ "semantic": { "blockD' }, finish_reason: 'length' }],
				usage: { prompt_tokens: 1, completion_tokens: 8192, total_tokens: 8193 }
			}),
			{ status: 200 }
		);
		const fetchMock = vi.fn().mockResolvedValue(cutOff);
		vi.stubGlobal('fetch', fetchMock);

		const response = await postZoom();

		expect(response.statusCode).toBe(502);
		expect(response.json().error.code).toBe('invalid_model_output');
		expect(response.json().error.message).toContain('cut off at 8192 tokens');
		expect(fetchMock).toHaveBeenCalledTimes(1);
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

describe('POST /v1/zoom/stream', () => {
	// Splits content into two tokens, streamed the way LiteLLM does.
	function litellmStream(content: string): Response {
		const half = Math.floor(content.length / 2);
		const sse =
			[content.slice(0, half), content.slice(half)]
				.map((text) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`)
				.join('') + 'data: [DONE]\n\n';
		return new Response(sse, { status: 200 });
	}

	function postZoomStream(body: unknown = payload) {
		return app.inject({
			method: 'POST',
			url: '/v1/zoom/stream',
			headers: { 'x-internal-api-key': 'test-secret' },
			payload: body as object
		});
	}

	function parseEvents(raw: string) {
		return raw
			.split('\n\n')
			.filter((chunk) => chunk.startsWith('data: '))
			.map((chunk) => ZoomStreamEventSchema.parse(JSON.parse(chunk.slice('data: '.length))));
	}

	it('prompts with canonical ids and sends the done result in the caller’s ids', async () => {
		const fetchMock = vi.fn().mockResolvedValue(litellmStream(JSON.stringify(boundZoom)));
		vi.stubGlobal('fetch', fetchMock);

		const response = await postZoomStream(randomIdPayload);

		expect(promptOf(fetchMock)).not.toContain('r@ndom-id');
		const done = parseEvents(response.body).find((event) => event.type === 'done');
		expect(done?.type === 'done' && done.result.semantic.bindings[0].detail).toEqual([
			{ block: 'n#um-id', field: 'NUM' }
		]);
	});

	it('rejects requests without the internal API key', async () => {
		const response = await app.inject({ method: 'POST', url: '/v1/zoom/stream', payload });
		expect(response.statusCode).toBe(401);
	});

	it('rejects an invalid request body with a plain 400', async () => {
		const response = await postZoomStream({ model: 'local-ollama' });
		expect(response.statusCode).toBe(400);
	});

	it('streams an attempt, tokens and the validated result', async () => {
		const content = JSON.stringify(validZoom);
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(litellmStream(content)));

		const response = await postZoomStream();

		expect(response.statusCode).toBe(200);
		expect(response.headers['content-type']).toContain('text/event-stream');
		const events = parseEvents(response.body);
		expect(events[0]).toEqual({ type: 'attempt', attempt: 1, maxAttempts: 3 });
		const tokens = events.filter((event) => event.type === 'token');
		expect(tokens).toHaveLength(2);
		expect(tokens.map((event) => event.text).join('')).toBe(content);
		expect(events.at(-1)).toEqual({ type: 'done', result: coloured(validZoom) });
	});

	it('streams the plan, in the caller’s ids', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(litellmStream(JSON.stringify(planned))));

		const response = await postZoomStream(randomIdPayload);

		const done = parseEvents(response.body).at(-1);
		expect(done?.type === 'done' && done.result.plan).toEqual(plannedInCallerIds);
	});

	it('retries with the error fed back when the model output is invalid', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(litellmStream('{ not json'))
			.mockResolvedValueOnce(litellmStream(JSON.stringify(validZoom)));
		vi.stubGlobal('fetch', fetchMock);

		const events = parseEvents((await postZoomStream()).body);

		const attempts = events.filter((event) => event.type === 'attempt');
		expect(attempts).toHaveLength(2);
		expect(attempts[1]).toMatchObject({ attempt: 2, previousError: expect.any(String) });
		expect(events.at(-1)).toEqual({ type: 'done', result: coloured(validZoom) });
		const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
		expect(secondBody.messages[1].content).toContain('Your previous attempt was invalid');
	});

	it('ends with an invalid_model_output error after exhausting all attempts', async () => {
		const fetchMock = vi.fn().mockImplementation(async () => litellmStream('nope'));
		vi.stubGlobal('fetch', fetchMock);

		const events = parseEvents((await postZoomStream()).body);

		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(events.at(-1)).toMatchObject({ type: 'error', code: 'invalid_model_output' });
	});

	it('asks LiteLLM for usage and sends the prompt’s parameters', async () => {
		const fetchMock = vi.fn().mockResolvedValue(litellmStream(JSON.stringify(validZoom)));
		vi.stubGlobal('fetch', fetchMock);

		await postZoomStream();

		const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
		expect(body).toMatchObject({
			stream: true,
			stream_options: { include_usage: true },
			temperature: getZoomPrompt().params.temperature,
			max_tokens: getZoomPrompt().params.maxTokens,
			metadata: { prompt_id: getZoomPrompt().id }
		});
	});

	it('fails without a retry when the output was cut off by the limit', async () => {
		const chunks = [
			{ choices: [{ delta: { content: '{ "semantic": { "blockD' } }] },
			{ choices: [{ delta: {}, finish_reason: 'length' }] },
			{ choices: [], usage: { prompt_tokens: 1, completion_tokens: 4096, total_tokens: 4097 } }
		];
		const sse =
			chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n';
		const fetchMock = vi.fn().mockImplementation(async () => new Response(sse, { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		const events = parseEvents((await postZoomStream()).body);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(events.at(-1)).toMatchObject({ type: 'error', code: 'invalid_model_output' });
		expect(events.at(-1)).toMatchObject({
			message: expect.stringContaining('cut off at 4096 tokens')
		});
	});

	it('reports a non-2xx LiteLLM response as an upstream_error event', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(
					new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429 })
				)
		);

		const response = await postZoomStream();

		expect(response.statusCode).toBe(200);
		expect(parseEvents(response.body).at(-1)).toEqual({
			type: 'error',
			code: 'upstream_error',
			status: 429,
			message: 'rate limited'
		});
	});
});
