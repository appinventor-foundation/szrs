// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { expect, type Page } from '@playwright/test';
import { baseURL } from './auth.js';
import type { Credentials } from './page.js';

let counter = 0;

export type TestUser = Credentials & { name: string };

// Creates a user through better-auth's admin API using the page's session, so
// it must already be signed in as an admin. Faster than the form, which has its
// own test.
export async function createUser(
	page: Page,
	overrides: Partial<TestUser & { role: 'admin' | 'user' }> = {}
): Promise<TestUser> {
	const n = ++counter;
	const user = {
		name: overrides.name ?? `Member ${n}`,
		email: overrides.email ?? `member-${n}-${Date.now()}@example.com`,
		password: overrides.password ?? 'member-password-1'
	};
	const response = await page.request.post('/api/auth/admin/create-user', {
		data: { ...user, role: overrides.role ?? 'user' },
		// better-auth checks the Origin of cookie-authenticated requests.
		headers: { Origin: baseURL }
	});
	expect(response.ok(), await response.text()).toBe(true);
	return user;
}
