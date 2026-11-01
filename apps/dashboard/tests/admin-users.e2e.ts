// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { expect, test, type Page } from '@playwright/test';
import { adminCredentials, baseURL } from './support/auth.js';
import { resetDatabase } from './support/database.js';
import { newSession, openAccountMenu, signIn, signOut, visit } from './support/page.js';
import { createUser } from './support/users.js';

test.beforeEach(async ({ page }) => {
	await resetDatabase();
	await signIn(page, adminCredentials);
});

// The row of the users table for an email address.
const rowFor = (page: Page, email: string) =>
	page.getByRole('table', { name: 'Users' }).getByRole('row', { name: new RegExp(email) });

// Opens a user's management page from the list. The breadcrumb only exists
// there, so it tells us the client-side navigation has finished.
async function manage(page: Page, email: string) {
	await visit(page, '/admin/users');
	await rowFor(page, email).getByRole('link').click();
	await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Sign out everywhere' })).toBeVisible();
}

// Fills the "New user" page and submits it.
async function createViaForm(
	page: Page,
	user: { name: string; email: string; password: string; role?: string }
) {
	await visit(page, '/admin/users/new');
	await page.getByLabel('Name').fill(user.name);
	await page.getByLabel('Email').fill(user.email);
	await page.getByLabel('Password').fill(user.password);
	if (user.role) await page.getByLabel('Role').selectOption(user.role);
	await page.getByRole('button', { name: 'Create user' }).click();
}

test.describe('the list', () => {
	test('shows users in a table with their role and status', async ({ page }) => {
		const member = await createUser(page, { name: 'Listed Member' });
		await visit(page, '/admin/users');

		const table = page.getByRole('table', { name: 'Users' });
		await expect(table.getByRole('columnheader')).toHaveText(['Name', 'Email', 'Role', 'Status']);
		await expect(rowFor(page, adminCredentials.email)).toContainText('admin');
		await expect(rowFor(page, member.email)).toContainText('Listed Member');
		await expect(rowFor(page, member.email)).toContainText('user');
		await expect(rowFor(page, member.email)).toContainText('Active');
	});

	test('does not show the creation form, only a New user button', async ({ page }) => {
		await visit(page, '/admin/users');

		await expect(page.getByLabel('Password')).toHaveCount(0);
		await page.getByRole('link', { name: 'New user' }).click();

		await expect(page).toHaveURL('/admin/users/new');
		await expect(page.getByRole('heading', { name: 'New user' })).toBeVisible();
	});

	test('opens the user from the name, and from anywhere in the row', async ({ page }) => {
		const member = await createUser(page, { name: 'Row Target' });
		await visit(page, '/admin/users');

		await page.getByRole('link', { name: 'Row Target' }).click();
		await expect(page.getByRole('heading', { level: 1, name: 'Row Target' })).toBeVisible();

		await visit(page, '/admin/users');
		// The name link is stretched over the row, so it takes this click.
		await rowFor(page, member.email).getByRole('cell').nth(1).click({ force: true });
		await expect(page.getByRole('heading', { level: 1, name: 'Row Target' })).toBeVisible();
	});

	test('marks a banned user', async ({ page }) => {
		const member = await createUser(page);
		await manage(page, member.email);
		await page.getByRole('button', { name: 'Ban', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Unban' })).toBeVisible();

		await visit(page, '/admin/users');

		await expect(rowFor(page, member.email)).toContainText('Banned');
	});
});

test.describe('creating users', () => {
	test('creates a user, shows their page, and they can then sign in', async ({ page }) => {
		await createViaForm(page, {
			name: 'Grace Hopper',
			email: 'grace@example.com',
			password: 'compiler-password-1'
		});

		await expect(page.getByRole('heading', { level: 1, name: 'Grace Hopper' })).toBeVisible();
		await expect(page).toHaveURL(/\/admin\/users\/[^/]+$/);

		await visit(page, '/admin/users');
		await expect(rowFor(page, 'grace@example.com')).toBeVisible();

		await signOut(page);
		await signIn(page, { email: 'grace@example.com', password: 'compiler-password-1' });
		await openAccountMenu(page);
		await expect(page.getByText('Grace Hopper')).toBeVisible();
	});

	test('rejects a duplicate email', async ({ page }) => {
		const existing = await createUser(page);

		await createViaForm(page, {
			name: 'Someone Else',
			email: existing.email,
			password: 'another-password-1'
		});

		await expect(page.getByRole('alert')).toHaveText('A user with this email already exists');
	});

	test('rejects a short password and keeps what was typed', async ({ page }) => {
		await createViaForm(page, {
			name: 'Short Pass',
			email: 'short@example.com',
			password: 'short'
		});

		await expect(page.getByRole('alert')).toHaveText('Password must be at least 8 characters');
		await expect(page.getByLabel('Email')).toHaveValue('short@example.com');
		await expect(page).toHaveURL('/admin/users/new');
	});

	test('lets an admin create another admin', async ({ page }) => {
		await createViaForm(page, {
			name: 'Second Admin',
			email: 'second@example.com',
			password: 'second-admin-pass-1',
			role: 'admin'
		});
		await expect(page.getByRole('heading', { level: 1, name: 'Second Admin' })).toBeVisible();

		await visit(page, '/admin/users');

		await expect(rowFor(page, 'second@example.com')).toContainText('admin');
	});

	test('cancel goes back to the list without creating anyone', async ({ page }) => {
		await visit(page, '/admin/users/new');

		await page.getByRole('link', { name: 'Cancel' }).click();

		await expect(page).toHaveURL('/admin/users');
		await expect(page.getByRole('table', { name: 'Users' }).getByRole('row')).toHaveCount(2);
	});

	test('a member cannot open the new user page', async ({ page }) => {
		const member = await createUser(page);
		await signOut(page);
		await signIn(page, member);

		const response = await page.goto('/admin/users/new');

		expect(response?.status()).toBe(403);
	});
});

test.describe('the detail page', () => {
	test('has breadcrumbs back to the list', async ({ page }) => {
		const member = await createUser(page, { name: 'Crumb Member' });
		await manage(page, member.email);

		const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
		await expect(crumbs.getByText('Crumb Member')).toHaveAttribute('aria-current', 'page');
		await crumbs.getByRole('link', { name: 'Users' }).click();

		await expect(page).toHaveURL('/admin/users');
		await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
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

		await expect(page).toHaveURL('/admin/users?deleted=1');
		await expect(page.getByRole('status')).toHaveText('User deleted.');
		await expect(rowFor(page, member.email)).toHaveCount(0);

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
		const href = await rowFor(page, adminCredentials.email).getByRole('link').getAttribute('href');
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
