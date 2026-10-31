// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { isAdmin } from './roles.js';

export type AccessDecision = 'allow' | 'login' | 'forbidden';

// Route ids of the `(protected)` group. Everything under it needs a signed-in
// user and everything under `admin` needs the admin role. Anything else
// (home, /login, /healthz, /api/auth/*) is public.
const PROTECTED = '/(protected)';
const ADMIN = '/(protected)/admin';

function isUnder(routeId: string, prefix: string): boolean {
	return routeId === prefix || routeId.startsWith(`${prefix}/`);
}

export function decideAccess(
	routeId: string | null,
	user: { role?: string | null } | null | undefined
): AccessDecision {
	if (!routeId || !isUnder(routeId, PROTECTED)) return 'allow';
	if (!user) return 'login';
	if (isUnder(routeId, ADMIN) && !isAdmin(user)) return 'forbidden';
	return 'allow';
}
