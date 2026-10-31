// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { getAuthService } from '#lib/server/container.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	await getAuthService().signOut(request.headers);
	redirect(303, resolve('/'));
};
