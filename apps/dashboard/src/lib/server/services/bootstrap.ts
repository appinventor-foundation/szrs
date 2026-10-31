// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { BootstrapError } from '../errors.js';
import type { UserRepository } from '../repositories/users.js';

export type InitialAdmin = { email: string; password: string; name?: string };

// Relative imports: scripts/ensure-admin.ts loads this file outside Vite.
//
// Registration is closed, so a fresh deployment has nobody who can sign in.
// This creates the first admin from the environment, and only when no active
// admin exists, so running it on every deploy is safe.
export async function ensureAdmin(
	users: Pick<UserRepository, 'countActiveAdmins' | 'create'>,
	initial: InitialAdmin | undefined
): Promise<'created' | 'exists'> {
	if ((await users.countActiveAdmins()) > 0) return 'exists';

	if (!initial) {
		throw new BootstrapError(
			'No admin exists yet and INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD are not set'
		);
	}
	await users.create({
		name: initial.name ?? 'Admin',
		email: initial.email,
		password: initial.password,
		role: 'admin'
	});
	return 'created';
}
