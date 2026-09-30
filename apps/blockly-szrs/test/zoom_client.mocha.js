// Copyright 2026 appinventor.org, All rights reserved
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/**
 * @fileoverview Tests for the llm-proxy zoom client.
 */

const assert = require('assert');
const { requestZoom, ZoomError } = require('../src/zoom_client');

const options = { proxyUrl: 'https://proxy.example/', model: 'local-ollama' };
const target = { slug: 'fizz-buzz-n', workspaceJson: { blocks: {} } };

const level = (type) => ({
	blocks: [
		{
			blockDef: { type },
			generatorCode: `forBlock["${type}"] = function(block, generator) { return ''; };`,
			toolboxEntry: { kind: 'block', type }
		}
	],
	workspaceJson: { blocks: { languageVersion: 0, blocks: [] } }
});

const result = { semantic: level('zoom_x_op'), concept: level('zoom_x_concept') };

const sse = (...events) => events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');

/** A 200 streaming response delivering `text` in the given number of chunks. */
function streamResponse(text, chunkCount = 1) {
	const encoder = new TextEncoder();
	const size = Math.ceil(text.length / chunkCount);
	return new Response(
		new ReadableStream({
			start(controller) {
				for (let i = 0; i < text.length; i += size) {
					controller.enqueue(encoder.encode(text.slice(i, i + size)));
				}
				controller.close();
			}
		}),
		{ status: 200, headers: { 'content-type': 'text/event-stream' } }
	);
}

async function assertRejectsWith(promise, expected) {
	await assert.rejects(promise, (error) => {
		assert.ok(error instanceof ZoomError, `expected a ZoomError, got ${error}`);
		assert.deepStrictEqual(
			{ code: error.code, status: error.status, message: error.message },
			expected
		);
		return true;
	});
}

suite('requestZoom', function () {
	let originalFetch;
	let calls;

	/** Replaces fetch with one that records its calls and returns `response`. */
	function stubFetch(response) {
		globalThis.fetch = async (url, init) => {
			calls.push({ url, init });
			return response;
		};
	}

	setup(function () {
		originalFetch = globalThis.fetch;
		calls = [];
	});

	teardown(function () {
		globalThis.fetch = originalFetch;
	});

	test('posts the model, slug and workspace to the stream endpoint', async function () {
		stubFetch(streamResponse(sse({ type: 'done', result })));

		await requestZoom(options, target);

		assert.strictEqual(calls.length, 1);
		assert.strictEqual(calls[0].url, 'https://proxy.example/v1/zoom/stream');
		assert.strictEqual(calls[0].init.method, 'POST');
		assert.deepStrictEqual(JSON.parse(calls[0].init.body), {
			model: 'local-ollama',
			slug: 'fizz-buzz-n',
			workspaceJson: { blocks: {} }
		});
	});

	test('sends the API key only when one is configured', async function () {
		stubFetch(streamResponse(sse({ type: 'done', result })));
		await requestZoom(options, target);
		assert.strictEqual(calls[0].init.headers['x-internal-api-key'], undefined);

		stubFetch(streamResponse(sse({ type: 'done', result })));
		await requestZoom({ ...options, apiKey: 'site-key' }, target);
		assert.strictEqual(calls[1].init.headers['x-internal-api-key'], 'site-key');
	});

	test('reports progress and resolves with the result, across split chunks', async function () {
		const events = [
			{ type: 'attempt', attempt: 1, maxAttempts: 3 },
			{ type: 'token', text: '{"sem' },
			{ type: 'token', text: 'antic"' }
		];
		stubFetch(streamResponse(sse(...events, { type: 'done', result }), 7));
		const progress = [];

		const zoom = await requestZoom(options, target, {
			onProgress: (event) => progress.push(event)
		});

		assert.deepStrictEqual(progress, events);
		assert.deepStrictEqual(zoom, result);
	});

	test('rejects with the code and status of an error event', async function () {
		stubFetch(
			streamResponse(
				sse(
					{ type: 'attempt', attempt: 1, maxAttempts: 3 },
					{ type: 'error', code: 'upstream_error', status: 429, message: 'rate limited' }
				)
			)
		);

		await assertRejectsWith(requestZoom(options, target), {
			code: 'upstream_error',
			status: 429,
			message: 'rate limited'
		});
	});

	test('rejects with request_failed when the proxy refuses the request', async function () {
		stubFetch(
			new Response(
				JSON.stringify({ error: { message: 'Rate limit exceeded', code: 'rate_limited' } }),
				{ status: 429 }
			)
		);

		await assertRejectsWith(requestZoom(options, target), {
			code: 'request_failed',
			status: 429,
			message: 'Rate limit exceeded'
		});
	});

	test('rejects with incomplete_stream when the stream ends without a result', async function () {
		stubFetch(streamResponse(sse({ type: 'attempt', attempt: 1, maxAttempts: 3 })));

		await assertRejectsWith(requestZoom(options, target), {
			code: 'incomplete_stream',
			status: undefined,
			message: 'The zoom stream ended without a result'
		});
	});
});
