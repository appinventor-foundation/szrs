// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { BETTER_AUTH_SECRET, DASHBOARD_URL } from '$app/env/private';
import { getRequestEvent } from '$app/server';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getDatabase } from '#lib/server/db/client.js';
import { createAuth, type Auth } from './create-auth.js';

export type { Auth };

let cached: Auth | undefined;

// The SvelteKit-specific instance. The cookie plugin lets form actions that call
// `auth.api.*` set the session cookie on the response, and it must come last.
export function getAuth(): Auth {
	cached ??= createAuth({
		db: getDatabase(),
		secret: BETTER_AUTH_SECRET,
		baseURL: DASHBOARD_URL,
		trailingPlugins: [sveltekitCookies(getRequestEvent)]
	});
	return cached;
}
