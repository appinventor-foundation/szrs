// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { isAdmin } from '#lib/server/auth/roles.js';
import type { LayoutServerLoad } from './$types';

// Only for the header. Access is enforced in hooks.server.ts, not here.
export const load: LayoutServerLoad = ({ locals }) => ({
	user: locals.user
		? { name: locals.user.name, email: locals.user.email, isAdmin: isAdmin(locals.user) }
		: null
});
