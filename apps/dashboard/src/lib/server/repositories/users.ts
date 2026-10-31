// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { APIError } from 'better-auth/api';
import { desc, eq, like } from 'drizzle-orm';
import type { CreateUserInput, Role, UserRecord } from '../../schemas/user.js';
import type { Auth } from '../auth/create-auth.js';
import { hasRole } from '../auth/roles.js';
import type { Database } from '../db/create-database.js';
import { user } from '../db/schema/index.js';
import { RuleViolationError } from '../errors.js';

export interface UserRepository {
	list(): Promise<UserRecord[]>;
	find(id: string): Promise<UserRecord | undefined>;
	countActiveAdmins(): Promise<number>;
	create(input: CreateUserInput): Promise<UserRecord>;
	setRole(id: string, role: Role): Promise<void>;
	setPassword(id: string, password: string): Promise<void>;
	ban(id: string, reason?: string): Promise<void>;
	unban(id: string): Promise<void>;
	revokeSessions(id: string): Promise<void>;
	remove(id: string): Promise<void>;
}

type Options = {
	auth: Auth;
	db: Database;
	/** The signed-in admin's request headers. Required for everything except `create`. */
	headers?: Headers;
};

// Imports are relative because scripts/ensure-admin.ts loads this file.
//
// Reads go through Drizzle. Writes go through better-auth's admin API, which
// owns password hashing and validation for its tables.
export function createUserRepository({ auth, db, headers }: Options): UserRepository {
	const requireHeaders = (): Headers => {
		if (!headers) throw new Error('This operation needs the signed-in admin request headers');
		return headers;
	};

	const toRecord = (row: typeof user.$inferSelect): UserRecord => ({
		id: row.id,
		name: row.name,
		email: row.email,
		role: row.role ?? 'user',
		banned: row.banned ?? false,
		banReason: row.banReason,
		banExpires: row.banExpires,
		createdAt: row.createdAt
	});

	const find = async (id: string) => {
		const [row] = await db.select().from(user).where(eq(user.id, id));
		return row ? toRecord(row) : undefined;
	};

	// A refusal better-auth words for a person (duplicate email, bad input) becomes
	// a rule violation; anything else is a real error.
	const call = async <T>(run: () => Promise<T>): Promise<T> => {
		try {
			return await run();
		} catch (err) {
			if (err instanceof APIError && [400, 409, 422].includes(err.statusCode)) {
				const duplicate = err.body?.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL';
				throw new RuleViolationError(
					duplicate ? 'A user with this email already exists' : (err.body?.message ?? err.message)
				);
			}
			throw err;
		}
	};

	return {
		find,

		async list() {
			const rows = await db.select().from(user).orderBy(desc(user.createdAt));
			return rows.map(toRecord);
		},

		async countActiveAdmins() {
			const rows = await db
				.select({ role: user.role, banned: user.banned })
				.from(user)
				.where(like(user.role, '%admin%'));
			return rows.filter((row) => hasRole(row.role, 'admin') && !row.banned).length;
		},

		async create(input) {
			const { user: created } = await call(() =>
				auth.api.createUser({
					body: {
						name: input.name,
						email: input.email,
						password: input.password,
						role: input.role
					}
				})
			);
			const record = await find(created.id);
			if (!record) throw new Error(`Created user ${created.id} could not be read back`);
			return record;
		},

		async setRole(id, role) {
			await call(() => auth.api.setRole({ body: { userId: id, role }, headers: requireHeaders() }));
		},

		async setPassword(id, password) {
			await call(() =>
				auth.api.setUserPassword({
					body: { userId: id, newPassword: password },
					headers: requireHeaders()
				})
			);
		},

		async ban(id, reason) {
			await call(() =>
				auth.api.banUser({ body: { userId: id, banReason: reason }, headers: requireHeaders() })
			);
		},

		async unban(id) {
			await call(() => auth.api.unbanUser({ body: { userId: id }, headers: requireHeaders() }));
		},

		async revokeSessions(id) {
			await call(() =>
				auth.api.revokeUserSessions({ body: { userId: id }, headers: requireHeaders() })
			);
		},

		async remove(id) {
			await call(() => auth.api.removeUser({ body: { userId: id }, headers: requireHeaders() }));
		}
	};
}
