// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { json } from '@sveltejs/kit';
import { getDatabase } from '#lib/server/db/client.js';
import { isDatabaseHealthy } from '#lib/server/db/health.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const database = await isDatabaseHealthy(getDatabase());
	return json(
		{ status: database ? 'ok' : 'unavailable', database },
		{ status: database ? 200 : 503 }
	);
};
