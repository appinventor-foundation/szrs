// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { expect, test, type Page } from '@playwright/test';
import { adminCredentials, baseURL } from './support/auth.js';
import { resetDatabase } from './support/database.js';
import { newSession, signIn, signOut, visit } from './support/page.js';
import { createUser } from './support/users.js';

test.beforeEach(async ({ page }) => {
	await resetDatabase();
	await signIn(page, adminCredentials);
});

// Opens a user's management page. The "Back to users" link only exists there,
// so it tells us the client-side navigation has finished.
async function manage(page: Page, email: string) {
	await visit(page, '/admin/users');
	await page.getByRole('link', { name: `Manage ${email}` }).click();
	await expect(page.getByRole('link', { name: 'Back to users' })).toBeVisible();
}

test.describe('creating users', () => {
	test('creates a user who can then sign in', async ({ page }) => {
		await visit(page, '/admin/users');
		await page.getByLabel('Name').fill('Grace Hopper');
		await page.getByLabel('Email').fill('grace@example.com');
		await page.getByLabel('Password').fill('compiler-password-1');
		await page.getByRole('button', { name: 'Create user' }).click();

		await expect(
			page.getByRole('table', { name: 'Users' }).getByText('grace@example.com')
		).toBeVisible();

		await signOut(page);
		await signIn(page, { email: 'grace@example.com', password: 'compiler-password-1' });
		await expect(page.getByText('Grace Hopper')).toBeVisible();
	});

	test('rejects a duplicate email', async ({ page }) => {
		const existing = await createUser(page);
		await visit(page, '/admin/users');

		await page.getByLabel('Name').fill('Someone Else');
		await page.getByLabel('Email').fill(existing.email);
		await page.getByLabel('Password').fill('another-password-1');
		await page.getByRole('button', { name: 'Create user' }).click();

		await expect(page.getByRole('alert')).toHaveText('A user with this email already exists');
	});

	test('rejects a short password and keeps what was typed', async ({ page }) => {
		await visit(page, '/admin/users');

		await page.getByLabel('Name').fill('Short Pass');
		await page.getByLabel('Email').fill('short@example.com');
		await page.getByLabel('Password').fill('short');
		await page.getByRole('button', { name: 'Create user' }).click();

		await expect(page.getByRole('alert')).toHaveText('Password must be at least 8 characters');
		await expect(page.getByLabel('Email')).toHaveValue('short@example.com');
	});

	test('lets an admin create another admin', async ({ page }) => {
		await visit(page, '/admin/users');
		await page.getByLabel('Name').fill('Second Admin');
		await page.getByLabel('Email').fill('second@example.com');
		await page.getByLabel('Password').fill('second-admin-pass-1');
		await page.getByLabel('Role').selectOption('admin');
		await page.getByRole('button', { name: 'Create user' }).click();

		const row = page.getByRole('row', { name: /second@example.com/ });
		await expect(row).toContainText('admin');
	});
});

test.describe('managing a user', () => {
	test('changes a role', async ({ page }) => {
		const member = await createUser(page);
		await manage(page, member.email);

		await page.getByLabel('Role').selectOption('admin');
		await page.getByRole('button', { name: 'Save role' }).click();

		await expect(page.getByRole('status')).toHaveText('Role updated');
		await visit(page, '/admin/users');
		await expect(page.getByRole('row', { name: new RegExp(member.email) })).toContainText('admin');
	});

	test('sets a new password: the old one stops working', async ({ page }) => {
		const member = await createUser(page);
		await manage(page, member.email);

		await page.getByLabel('New password').fill('brand-new-password-1');
		await page.getByRole('button', { name: 'Set password' }).click();
		await expect(page.getByRole('status')).toHaveText('Password updated');
		await signOut(page);

		await visit(page, '/login');
		await page.getByLabel('Email').fill(member.email);
		await page.getByLabel('Password').fill(member.password);
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page.getByRole('alert')).toHaveText('Invalid email or password');

		await signIn(page, { email: member.email, password: 'brand-new-password-1' });
	});

	test('rejects a too-short new password', async ({ page }) => {
		const member = await createUser(page);
		await manage(page, member.email);

		await page.getByLabel('New password').fill('short');
		await page.getByRole('button', { name: 'Set password' }).click();

		await expect(page.getByRole('alert')).toHaveText('Password must be at least 8 characters');
	});

	test('bans a user, who is signed out and cannot sign back in, then unbans them', async ({
		page,
		browser
	}) => {
		const member = await createUser(page);
		const { context, page: memberPage } = await newSession(browser);
		await signIn(memberPage, member);

		await manage(page, member.email);
		await page.getByLabel('Reason (optional)').fill('testing');
		await page.getByRole('button', { name: 'Ban', exact: true }).click();
		await expect(page.getByText('Banned', { exact: false }).first()).toBeVisible();

		await memberPage.goto('/demos');
		await expect(memberPage).toHaveURL(/\/login/);
		await waitForLoginForm(memberPage);
		await memberPage.getByLabel('Email').fill(member.email);
		await memberPage.getByLabel('Password').fill(member.password);
		await memberPage.getByRole('button', { name: 'Sign in' }).click();
		await expect(memberPage.getByRole('alert')).toBeVisible();
		await expect(memberPage).toHaveURL(/\/login/);

		await page.getByRole('button', { name: 'Unban' }).click();
		await expect(page.getByRole('button', { name: 'Ban', exact: true })).toBeVisible();
		await signIn(memberPage, member);
		await context.close();
	});

	test('signs a user out everywhere', async ({ page, browser }) => {
		const member = await createUser(page);
		const { context, page: memberPage } = await newSession(browser);
		await signIn(memberPage, member);
		await memberPage.goto('/demos');
		await expect(memberPage.getByRole('heading', { name: 'Demos' })).toBeVisible();

		await manage(page, member.email);
		await page.getByRole('button', { name: 'Sign out everywhere' }).click();
		await expect(page.getByRole('status')).toHaveText('Sessions revoked');

		await memberPage.goto('/demos');
		await expect(memberPage).toHaveURL(/\/login/);
		await context.close();
	});

	test('deletes a user, who can no longer sign in', async ({ page }) => {
		const member = await createUser(page);
		await manage(page, member.email);

		await page.getByRole('button', { name: 'Delete user' }).click();

		await expect(page).toHaveURL('/admin/users');
		await expect(page.getByRole('link', { name: `Manage ${member.email}` })).toHaveCount(0);

		await signOut(page);
		await visit(page, '/login');
		await page.getByLabel('Email').fill(member.email);
		await page.getByLabel('Password').fill(member.password);
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
	});

	test('answers 404 for a user that does not exist', async ({ page }) => {
		const response = await page.goto('/admin/users/no-such-user');

		expect(response?.status()).toBe(404);
	});
});

test.describe('protecting the admin from locking themselves out', () => {
	test('disables the dangerous buttons on your own account', async ({ page }) => {
		await manage(page, adminCredentials.email);

		await expect(page.getByText('This is your own account')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Save role' })).toBeDisabled();
		await expect(page.getByRole('button', { name: 'Ban', exact: true })).toBeDisabled();
		await expect(page.getByRole('button', { name: 'Delete user' })).toBeDisabled();
	});

	test('refuses the same actions when sent directly', async ({ page }) => {
		await visit(page, '/admin/users');
		const href = await page
			.getByRole('link', { name: `Manage ${adminCredentials.email}` })
			.getAttribute('href');
		const send = (action: string, form: Record<string, string> = {}) =>
			page.request.post(`${href}?/${action}`, {
				form,
				headers: { Origin: baseURL, 'x-sveltekit-action': 'true' }
			});

		const remove = await (await send('remove')).text();
		const ban = await (await send('ban')).text();
		const demote = await (await send('setRole', { role: 'user' })).text();

		expect(remove).toContain('cannot delete your own account');
		expect(ban).toContain('cannot ban yourself');
		expect(demote).toContain('cannot change your own role');

		// Still an admin who can reach the admin area.
		await visit(page, '/admin/users');
		await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
	});

	test('keeps an admin account manageable by another admin', async ({ page }) => {
		const second = await createUser(page, { role: 'admin' });
		await manage(page, second.email);

		await page.getByLabel('Role').selectOption('user');
		await page.getByRole('button', { name: 'Save role' }).click();

		await expect(page.getByRole('status')).toHaveText('Role updated');
	});
});

async function waitForLoginForm(page: Page) {
	await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
	await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
}
