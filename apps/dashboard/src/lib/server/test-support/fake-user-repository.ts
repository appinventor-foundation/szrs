// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import type { UserRecord } from '#lib/schemas/user.js';
import type { UserRepository } from '#lib/server/repositories/users.js';

// An in-memory stand-in for the better-auth-backed repository, for unit tests.
export function fakeUserRepository(seed: Partial<UserRecord>[] = []) {
	const users = new Map<string, UserRecord>();
	let next = 0;

	const add = (partial: Partial<UserRecord>): UserRecord => {
		const id = partial.id ?? `user-${++next}`;
		const record: UserRecord = {
			id,
			name: partial.name ?? id,
			email: partial.email ?? `${id}@example.com`,
			role: partial.role ?? 'user',
			banned: partial.banned ?? false,
			banReason: partial.banReason ?? null,
			banExpires: null,
			createdAt: new Date(2026, 0, 1, 0, 0, next)
		};
		users.set(id, record);
		return record;
	};
	seed.forEach(add);

	const repository: UserRepository = {
		list: async () => [...users.values()],
		find: async (id) => users.get(id),
		countActiveAdmins: async () =>
			[...users.values()].filter((u) => u.role.split(',').includes('admin') && !u.banned).length,
		create: async (input) => add({ name: input.name, email: input.email, role: input.role }),
		setRole: async (id, role) => void (users.get(id)!.role = role),
		setPassword: async () => {},
		ban: async (id, reason) => {
			const user = users.get(id)!;
			user.banned = true;
			user.banReason = reason ?? null;
		},
		unban: async (id) => void (users.get(id)!.banned = false),
		revokeSessions: async () => {},
		remove: async (id) => void users.delete(id)
	};
	return { repository, users };
}
