// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';
import { NotFoundError, RuleViolationError } from '#lib/server/errors.js';
import { fakeUserRepository } from '#lib/server/test-support/fake-user-repository.js';
import { createUserService } from './users.js';

function setup() {
	const fake = fakeUserRepository([
		{ id: 'root', role: 'admin' },
		{ id: 'other-admin', role: 'admin' },
		{ id: 'member', role: 'user' }
	]);
	return { ...fake, service: createUserService(fake.repository, 'root') };
}

describe('user service', () => {
	it('creates a user', async () => {
		const { service, users } = setup();

		const created = await service.create({
			name: 'New',
			email: 'new@example.com',
			password: 'long-enough-1',
			role: 'user'
		});

		expect(users.get(created.id)?.email).toBe('new@example.com');
	});

	it('changes another user role', async () => {
		const { service, users } = setup();

		await service.changeRole('member', 'admin');

		expect(users.get('member')?.role).toBe('admin');
	});

	it('refuses to let an admin change their own role', async () => {
		const { service } = setup();

		await expect(service.changeRole('root', 'user')).rejects.toBeInstanceOf(RuleViolationError);
	});

	it('refuses to ban or delete yourself', async () => {
		const { service } = setup();

		await expect(service.ban('root')).rejects.toThrow('cannot ban yourself');
		await expect(service.remove('root')).rejects.toThrow('cannot delete your own account');
	});

	it('refuses to remove, demote or ban the last active admin', async () => {
		const { repository } = fakeUserRepository([
			{ id: 'only-admin', role: 'admin' },
			{ id: 'member' }
		]);
		const service = createUserService(repository, 'member'); // acting on someone else

		await expect(service.remove('only-admin')).rejects.toThrow('At least one active admin');
		await expect(service.changeRole('only-admin', 'user')).rejects.toThrow(
			'At least one active admin'
		);
		await expect(service.ban('only-admin')).rejects.toThrow('At least one active admin');
	});

	it('allows removing an admin when another active admin remains', async () => {
		const { service, users } = setup();

		await service.remove('other-admin');

		expect(users.has('other-admin')).toBe(false);
	});

	it('allows banning and unbanning an ordinary user', async () => {
		const { service, users } = setup();

		await service.ban('member', 'spam');
		expect(users.get('member')).toMatchObject({ banned: true, banReason: 'spam' });

		await service.unban('member');
		expect(users.get('member')?.banned).toBe(false);
	});

	it('throws NotFoundError for a user that does not exist', async () => {
		const { service } = setup();

		await expect(service.get('nope')).rejects.toBeInstanceOf(NotFoundError);
		await expect(service.setPassword('nope', 'long-enough-1')).rejects.toBeInstanceOf(
			NotFoundError
		);
		await expect(service.remove('nope')).rejects.toBeInstanceOf(NotFoundError);
	});
});
