// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { clientAddressOf } from '#lib/server/client-address.js';
import { getZoomProxy } from '#lib/server/container.js';
import type { RequestHandler } from './$types';

// The plugin asks for a zoom and reads the answer as a server-sent-event
// stream, which is passed straight through.
export const POST: RequestHandler = async ({ request, getClientAddress }) =>
	getZoomProxy().forward('zoomStream', {
		body: await request.text(),
		clientAddress: clientAddressOf(getClientAddress),
		signal: request.signal
	});
