// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it, vi } from 'vitest';
import { createZoomProxy, ZOOM_BODY_MAX_BYTES } from './zoom-proxy.js';

type Call = { url: string; init: RequestInit };

function setup(respond: (call: Call) => Response | Promise<Response> = () => Response.json({})) {
	const calls: Call[] = [];
	const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
		const call = { url: String(url), init: init ?? {} };
		calls.push(call);
		return respond(call);
	});
	return { calls, fetch: fetch as unknown as typeof globalThis.fetch };
}

const request = { clientAddress: '203.0.113.7', signal: new AbortController().signal };

describe('zoom proxy', () => {
	it('forwards the model list to the proxy with the person’s address', async () => {
		const { calls, fetch } = setup(() => Response.json({ models: ['a'] }));
		const proxy = createZoomProxy({ baseUrl: 'http://proxy:3000/', fetch });

		const response = await proxy.forward('models', request);

		expect(await response.json()).toEqual({ models: ['a'] });
		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe('http://proxy:3000/v1/models');
		expect(calls[0].init.method).toBe('GET');
		expect(new Headers(calls[0].init.headers).get('x-forwarded-for')).toBe('203.0.113.7');
	});

	it('forwards a zoom request body to the stream endpoint', async () => {
		const { calls, fetch } = setup();
		const proxy = createZoomProxy({ baseUrl: 'http://proxy:3000', fetch });

		await proxy.forward('zoomStream', { ...request, body: '{"model":"m"}' });

		expect(calls[0].url).toBe('http://proxy:3000/v1/zoom/stream');
		expect(calls[0].init.method).toBe('POST');
		expect(calls[0].init.body).toBe('{"model":"m"}');
		const headers = new Headers(calls[0].init.headers);
		expect(headers.get('content-type')).toBe('application/json');
		expect(headers.get('accept')).toBe('text/event-stream');
	});

	it('forwards without an address when the person’s could not be determined', async () => {
		const { calls, fetch } = setup();
		const proxy = createZoomProxy({ baseUrl: 'http://p', fetch });

		await proxy.forward('models', { signal: request.signal });

		expect(new Headers(calls[0].init.headers).has('x-forwarded-for')).toBe(false);
	});

	it('sends the internal key only when one is configured', async () => {
		const withKey = setup();
		await createZoomProxy({ baseUrl: 'http://p', apiKey: 'k', fetch: withKey.fetch }).forward(
			'models',
			request
		);
		const withoutKey = setup();
		await createZoomProxy({ baseUrl: 'http://p', fetch: withoutKey.fetch }).forward(
			'models',
			request
		);

		expect(new Headers(withKey.calls[0].init.headers).get('x-internal-api-key')).toBe('k');
		expect(new Headers(withoutKey.calls[0].init.headers).has('x-internal-api-key')).toBe(false);
	});

	it('streams the answer through without waiting for it to finish', async () => {
		const encoder = new TextEncoder();
		let finish!: () => void;
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encoder.encode('data: {"type":"token"}\n\n'));
				finish = () => controller.close();
			}
		});
		const { fetch } = setup(
			() => new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
		);
		const proxy = createZoomProxy({ baseUrl: 'http://p', fetch });

		const response = await proxy.forward('zoomStream', { ...request, body: '{}' });
		const reader = response.body!.getReader();
		const first = await reader.read();

		expect(response.headers.get('content-type')).toBe('text/event-stream');
		expect(new TextDecoder().decode(first.value)).toBe('data: {"type":"token"}\n\n');
		finish();
		expect((await reader.read()).done).toBe(true);
	});

	it('passes the proxy’s status and error body back', async () => {
		const { fetch } = setup(() => Response.json({ error: 'rate limited' }, { status: 429 }));
		const proxy = createZoomProxy({ baseUrl: 'http://p', fetch });

		const response = await proxy.forward('models', request);

		expect(response.status).toBe(429);
		expect(await response.json()).toEqual({ error: 'rate limited' });
	});

	it('answers 502 when the proxy cannot be reached', async () => {
		const fetch = vi.fn(async () => {
			throw new TypeError('fetch failed');
		}) as unknown as typeof globalThis.fetch;
		const proxy = createZoomProxy({ baseUrl: 'http://p', fetch });

		expect((await proxy.forward('models', request)).status).toBe(502);
	});

	it('gives the browser’s abort signal to the upstream call', async () => {
		const { calls, fetch } = setup();
		const proxy = createZoomProxy({ baseUrl: 'http://p', fetch });
		const controller = new AbortController();

		await proxy.forward('models', { ...request, signal: controller.signal });

		expect(calls[0].init.signal).toBe(controller.signal);
	});

	it('rethrows instead of answering when the browser has gone', async () => {
		const controller = new AbortController();
		const fetch = vi.fn(async () => {
			controller.abort();
			throw new DOMException('aborted', 'AbortError');
		}) as unknown as typeof globalThis.fetch;
		const proxy = createZoomProxy({ baseUrl: 'http://p', fetch });

		await expect(
			proxy.forward('models', { ...request, signal: controller.signal })
		).rejects.toThrow('aborted');
	});

	it('refuses an oversized request without calling the proxy', async () => {
		const { calls, fetch } = setup();
		const proxy = createZoomProxy({ baseUrl: 'http://p', fetch });

		const response = await proxy.forward('zoomStream', {
			...request,
			body: 'x'.repeat(ZOOM_BODY_MAX_BYTES + 1)
		});

		expect(response.status).toBe(413);
		expect(calls).toHaveLength(0);
	});
});
