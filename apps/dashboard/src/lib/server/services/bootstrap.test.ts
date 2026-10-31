// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';
import { BootstrapError } from '#lib/server/errors.js';
import { fakeUserRepository } from '#lib/server/test-support/fake-user-repository.js';
import { ensureAdmin } from './bootstrap.js';

const initial = { email: 'admin@example.com', password: 'long-enough-1' };

describe('ensureAdmin', () => {
	it('creates the first admin', async () => {
		const { repository, users } = fakeUserRepository();

		expect(await ensureAdmin(repository, initial)).toBe('created');

		expect([...users.values()]).toMatchObject([{ email: 'admin@example.com', role: 'admin' }]);
	});

	it('does nothing when an admin already exists', async () => {
		const { repository, users } = fakeUserRepository([{ id: 'a', role: 'admin' }]);

		expect(await ensureAdmin(repository, initial)).toBe('exists');
		expect(users.size).toBe(1);
	});

	it('is safe to run twice', async () => {
		const { repository, users } = fakeUserRepository();

		await ensureAdmin(repository, initial);
		expect(await ensureAdmin(repository, initial)).toBe('exists');
		expect(users.size).toBe(1);
	});

	it('creates an admin again when the only admin is banned', async () => {
		const { repository } = fakeUserRepository([{ id: 'a', role: 'admin', banned: true }]);

		expect(await ensureAdmin(repository, initial)).toBe('created');
	});

	it('fails loudly when there is no admin and no credentials', async () => {
		const { repository } = fakeUserRepository();

		await expect(ensureAdmin(repository, undefined)).rejects.toBeInstanceOf(BootstrapError);
	});

	it('does not need credentials once an admin exists', async () => {
		const { repository } = fakeUserRepository([{ id: 'a', role: 'admin' }]);

		expect(await ensureAdmin(repository, undefined)).toBe('exists');
	});
});
