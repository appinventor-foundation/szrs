// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import type { CreateUserInput, Role, UserRecord } from '#lib/schemas/user.js';
import { isAdmin } from '#lib/server/auth/roles.js';
import { NotFoundError, RuleViolationError } from '#lib/server/errors.js';
import type { UserRepository } from '#lib/server/repositories/users.js';

export interface UserService {
	list(): Promise<UserRecord[]>;
	get(id: string): Promise<UserRecord>;
	create(input: CreateUserInput): Promise<UserRecord>;
	changeRole(id: string, role: Role): Promise<void>;
	setPassword(id: string, password: string): Promise<void>;
	ban(id: string, reason?: string): Promise<void>;
	unban(id: string): Promise<void>;
	revokeSessions(id: string): Promise<void>;
	remove(id: string): Promise<void>;
}

// `actorId` is the admin performing the action. The rules protect the
// deployment from locking itself out: nobody can demote, ban or delete
// themselves, and the last active admin can never be removed.
export function createUserService(users: UserRepository, actorId: string): UserService {
	const get = async (id: string) => {
		const found = await users.find(id);
		if (!found) throw new NotFoundError('User', id);
		return found;
	};

	const notSelf = (id: string, message: string) => {
		if (id === actorId) throw new RuleViolationError(message);
	};

	const keepOneAdmin = async (target: UserRecord) => {
		const activeAdmin = isAdmin(target) && !target.banned;
		if (activeAdmin && (await users.countActiveAdmins()) <= 1) {
			throw new RuleViolationError('At least one active admin must remain');
		}
	};

	return {
		list: () => users.list(),
		get,
		create: (input) => users.create(input),

		async changeRole(id, role) {
			notSelf(id, 'You cannot change your own role');
			const target = await get(id);
			if (role !== 'admin') await keepOneAdmin(target);
			await users.setRole(id, role);
		},

		async setPassword(id, password) {
			await get(id);
			await users.setPassword(id, password);
		},

		async ban(id, reason) {
			notSelf(id, 'You cannot ban yourself');
			await keepOneAdmin(await get(id));
			await users.ban(id, reason);
		},

		async unban(id) {
			await get(id);
			await users.unban(id);
		},

		async revokeSessions(id) {
			await get(id);
			await users.revokeSessions(id);
		},

		async remove(id) {
			notSelf(id, 'You cannot delete your own account');
			await keepOneAdmin(await get(id));
			await users.remove(id);
		}
	};
}
