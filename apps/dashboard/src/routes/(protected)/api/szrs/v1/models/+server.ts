// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { clientAddressOf } from '#lib/server/client-address.js';
import { getZoomProxy } from '#lib/server/container.js';
import type { RequestHandler } from './$types';

// The plugin lists the models it can use. Under (protected), so only signed-in
// people reach the proxy.
export const GET: RequestHandler = ({ request, getClientAddress }) =>
	getZoomProxy().forward('models', {
		clientAddress: clientAddressOf(getClientAddress),
		signal: request.signal
	});
