// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { createServer } from 'node:http';
import { fakeProxyPort } from './auth.js';

// Stands in for apps/llm-proxy in the e2e tests, so nothing calls a real model.
// It answers the two calls the dashboard forwards, and echoes what it was sent
// so the tests can check the forwarder passed it on.
const server = createServer((request, response) => {
	const url = new URL(request.url ?? '/', 'http://localhost');

	if (url.pathname === '/healthz') {
		response.end('ok');
		return;
	}

	if (request.method === 'GET' && url.pathname === '/v1/models') {
		response.setHeader('content-type', 'application/json');
		response.end(JSON.stringify({ models: ['fake-model', 'other-model'] }));
		return;
	}

	if (request.method === 'POST' && url.pathname === '/v1/zoom/stream') {
		let body = '';
		request.on('data', (chunk) => (body += chunk));
		request.on('end', () => {
			response.setHeader('content-type', 'text/event-stream');
			const echo = {
				type: 'echo',
				body,
				forwardedFor: request.headers['x-forwarded-for'] ?? null,
				internalKey: request.headers['x-internal-api-key'] ?? null
			};
			response.write(`data: ${JSON.stringify(echo)}\n\n`);
			response.end();
		});
		return;
	}

	response.statusCode = 404;
	response.end();
});

server.listen(fakeProxyPort, () => console.log(`fake llm-proxy on ${fakeProxyPort}`));
