// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { error, type RequestEvent } from '@sveltejs/kit';
import { getAuth } from '#lib/server/auth/index.js';
import { getDatabase } from '#lib/server/db/client.js';
import { createDemoRepository } from '#lib/server/repositories/demos.js';
import { createSessionRepository } from '#lib/server/repositories/sessions.js';
import { createUserRepository } from '#lib/server/repositories/users.js';
import { createAuthService, type AuthService } from '#lib/server/services/auth.js';
import { createDemoService, type DemoService } from '#lib/server/services/demos.js';
import { createUserService, type UserService } from '#lib/server/services/users.js';

// The one place that wires repositories into services. Routes call these
// getters and never touch the database themselves.
let demoService: DemoService | undefined;
let authService: AuthService | undefined;

export function getDemoService(): DemoService {
	demoService ??= createDemoService(createDemoRepository(getDatabase()));
	return demoService;
}

export function getAuthService(): AuthService {
	authService ??= createAuthService(createSessionRepository(getAuth()));
	return authService;
}

// Built per request: better-auth's admin API authorises the call with the
// signed-in admin's session headers, and the rules need to know who is acting.
export function getUserService(event: Pick<RequestEvent, 'locals' | 'request'>): UserService {
	const actor = event.locals.user;
	if (!actor) error(401, 'Sign in required');
	return createUserService(
		createUserRepository({ auth: getAuth(), db: getDatabase(), headers: event.request.headers }),
		actor.id
	);
}
