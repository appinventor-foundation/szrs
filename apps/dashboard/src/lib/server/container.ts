// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { PROXY_API_KEY, PROXY_URL } from '$app/env/private';
import { error, type RequestEvent } from '@sveltejs/kit';
import { getAuth } from '#lib/server/auth/index.js';
import { getDatabase } from '#lib/server/db/client.js';
import { createDemoRepository } from '#lib/server/repositories/demos.js';
import { createSessionRepository } from '#lib/server/repositories/sessions.js';
import { createUserRepository } from '#lib/server/repositories/users.js';
import { createWorkspaceRepository } from '#lib/server/repositories/workspaces.js';
import { createAuthService, type AuthService } from '#lib/server/services/auth.js';
import { createDemoService, type DemoService } from '#lib/server/services/demos.js';
import { createUserService, type UserService } from '#lib/server/services/users.js';
import { createZoomProxy, type ZoomProxy } from '#lib/server/services/zoom-proxy.js';
import { createWorkspaceService, type WorkspaceService } from '#lib/server/services/workspaces.js';

// The one place that wires repositories into services. Routes call these
// getters and never touch the database themselves.
let demoService: DemoService | undefined;
let authService: AuthService | undefined;
let workspaceService: WorkspaceService | undefined;
let zoomProxy: ZoomProxy | undefined;

export function getDemoService(): DemoService {
	demoService ??= createDemoService(createDemoRepository(getDatabase()));
	return demoService;
}

export function getWorkspaceService(): WorkspaceService {
	const db = getDatabase();
	workspaceService ??= createWorkspaceService(
		createWorkspaceRepository(db),
		createDemoRepository(db)
	);
	return workspaceService;
}

export function getZoomProxy(): ZoomProxy {
	zoomProxy ??= createZoomProxy({ baseUrl: PROXY_URL, apiKey: PROXY_API_KEY });
	return zoomProxy;
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
