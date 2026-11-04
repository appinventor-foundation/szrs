// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

// The dashboard's one use of the LLM proxy: it forwards the two calls the
// semantic-zoom plugin makes from the browser, so the proxy stays on the
// internal network (no public address, no CORS). Nothing else is forwarded.
const ROUTES = {
	models: { method: 'GET', path: '/v1/models', accept: 'application/json' },
	zoomStream: { method: 'POST', path: '/v1/zoom/stream', accept: 'text/event-stream' }
} as const;

export type ZoomProxyRoute = keyof typeof ROUTES;

// A workspace is capped at 512 KB when saved; this leaves room for the rest of the request.
export const ZOOM_BODY_MAX_BYTES = 1_000_000;

export type ForwardRequest = {
	// What the browser sent, for the POST.
	body?: string;
	// The person's address, so the proxy's per-IP rate limit sees them and not the
	// dashboard. Missing when it could not be determined; the proxy then uses ours.
	clientAddress?: string;
	// Aborts the upstream call when the browser goes away.
	signal: AbortSignal;
};

export interface ZoomProxy {
	forward(route: ZoomProxyRoute, request: ForwardRequest): Promise<Response>;
}

export type ZoomProxyOptions = {
	baseUrl: string;
	apiKey?: string;
	fetch?: typeof globalThis.fetch;
};

// Headers worth passing back. Everything else is the proxy's business.
const PASSED_BACK = ['content-type', 'cache-control'];

export function createZoomProxy(options: ZoomProxyOptions): ZoomProxy {
	const fetcher = options.fetch ?? globalThis.fetch;
	const baseUrl = options.baseUrl.replace(/\/+$/, '');

	return {
		async forward(name, { body, clientAddress, signal }) {
			const route = ROUTES[name];
			if (body !== undefined && body.length > ZOOM_BODY_MAX_BYTES) {
				return Response.json({ error: 'Request is too large' }, { status: 413 });
			}

			// Set, never appended to: the proxy trusts this header for the rate limit.
			const headers = new Headers({ accept: route.accept });
			if (clientAddress) headers.set('x-forwarded-for', clientAddress);
			if (route.method === 'POST') headers.set('content-type', 'application/json');
			if (options.apiKey) headers.set('x-internal-api-key', options.apiKey);

			let upstream: Response;
			try {
				upstream = await fetcher(baseUrl + route.path, {
					method: route.method,
					headers,
					body: route.method === 'POST' ? body : undefined,
					signal
				});
			} catch (err) {
				// The browser left: nobody is waiting for an answer.
				if (signal.aborted) throw err;
				return Response.json({ error: 'The LLM proxy is unreachable' }, { status: 502 });
			}

			const passed = new Headers();
			for (const header of PASSED_BACK) {
				const value = upstream.headers.get(header);
				if (value) passed.set(header, value);
			}
			// Stops a reverse proxy in front of the dashboard from holding the stream back.
			passed.set('x-accel-buffering', 'no');
			return new Response(upstream.body, { status: upstream.status, headers: passed });
		}
	};
}
