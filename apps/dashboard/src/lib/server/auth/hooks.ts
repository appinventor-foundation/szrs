// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { error, redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { resolve as resolvePath } from '$app/paths';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { getAuth } from './index.js';
import { decideAccess } from './guard.js';

// Puts the signed-in user and session on `event.locals`. Requests without any
// cookie cannot have a session, so they skip the database lookup (this also
// keeps /healthz free of it).
export const sessionHandle: Handle = async ({ event, resolve }) => {
	if (event.request.headers.get('cookie')) {
		const session = await getAuth().api.getSession({ headers: event.request.headers });
		event.locals.session = session?.session;
		event.locals.user = session?.user;
	}
	return resolve(event);
};

// The one place access is enforced. It runs for page loads, form actions and
// endpoints alike, which a layout `load` would not (those skip layouts).
export const guardHandle: Handle = async ({ event, resolve }) => {
	const decision = decideAccess(event.route.id, event.locals.user);
	if (decision === 'allow') return resolve(event);
	if (decision === 'forbidden') error(403, 'You do not have access to this page');

	if (event.request.method === 'GET' || event.request.method === 'HEAD') {
		const target = `${event.url.pathname}${event.url.search}`;
		redirect(303, `${resolvePath('/login')}?redirectTo=${encodeURIComponent(target)}`);
	}
	error(401, 'Sign in required');
};

// better-auth's own endpoints under /api/auth/*.
export const authHandle: Handle = ({ event, resolve }) =>
	svelteKitHandler({ event, resolve, auth: getAuth(), building });
