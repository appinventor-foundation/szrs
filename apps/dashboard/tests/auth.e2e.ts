// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { expect, test } from '@playwright/test';
import { adminCredentials, baseURL } from './support/auth.js';
import { resetDatabase } from './support/database.js';
import {
	accountMenuTrigger,
	openAccountMenu,
	signIn,
	signOut,
	visit,
	waitForHydration
} from './support/page.js';
import { createUser } from './support/users.js';

test.beforeEach(async () => {
	await resetDatabase();
});

test.describe('signing in and out', () => {
	test('signs in, shows who is signed in, and signs out', async ({ page }) => {
		await signIn(page, adminCredentials);

		await openAccountMenu(page);
		await expect(page.getByText(adminCredentials.name)).toBeVisible();
		await expect(page.getByText(adminCredentials.email)).toBeVisible();
		await expect(page.getByRole('link', { name: 'Demos' })).toBeVisible();

		await signOut(page);

		await expect(page).toHaveURL('/');
		await expect(page.getByRole('link', { name: 'Demos' })).toHaveCount(0);
	});

	test('rejects a wrong password and keeps the email', async ({ page }) => {
		await visit(page, '/login');
		await page.getByLabel('Email').fill(adminCredentials.email);
		await page.getByLabel('Password').fill('not-the-password');
		await page.getByRole('button', { name: 'Sign in' }).click();

		await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
		await expect(page.getByLabel('Email')).toHaveValue(adminCredentials.email);
		await expect(page).toHaveURL(/\/login/);
	});

	test('gives the same error for an unknown email', async ({ page }) => {
		await visit(page, '/login');
		await page.getByLabel('Email').fill('nobody@example.com');
		await page.getByLabel('Password').fill('whatever-password');
		await page.getByRole('button', { name: 'Sign in' }).click();

		await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
	});

	test('sends someone who is already signed in away from the login page', async ({ page }) => {
		await signIn(page, adminCredentials);

		await page.goto('/login');

		await expect(page).toHaveURL('/');
	});
});

test.describe('protected pages', () => {
	test('send a visitor to the login page and back after signing in', async ({ page }) => {
		await page.goto('/demos');

		await expect(page).toHaveURL('/login?redirectTo=%2Fdemos');
		await waitForHydration(page);
		await page.getByLabel('Email').fill(adminCredentials.email);
		await page.getByLabel('Password').fill(adminCredentials.password);
		await page.getByRole('button', { name: 'Sign in' }).click();

		await expect(page).toHaveURL('/demos');
		await expect(page.getByRole('heading', { name: 'Demos' })).toBeVisible();
	});

	test('ignore a redirectTo that points off the site', async ({ page }) => {
		await visit(page, '/login?redirectTo=https%3A%2F%2Fevil.example');
		await page.getByLabel('Email').fill(adminCredentials.email);
		await page.getByLabel('Password').fill(adminCredentials.password);
		await page.getByRole('button', { name: 'Sign in' }).click();

		await expect(accountMenuTrigger(page)).toBeVisible();
		await expect(page).toHaveURL('/');
	});

	test('reject an unauthenticated form post', async ({ request }) => {
		const response = await request.post('/demos/new?/create', {
			form: { title: 'sneaky' },
			headers: { Origin: baseURL }
		});

		expect(response.status()).toBe(401);
	});

	test('reject an unauthenticated delete and edit', async ({ request }) => {
		const id = '3f1c2b6e-9a4d-4c52-8f0e-2a7b1d5e6c90';

		const remove = await request.post(`/demos/${id}?/delete`, { headers: { Origin: baseURL } });
		const update = await request.post(`/demos/${id}/edit?/update`, {
			form: { title: 'sneaky' },
			headers: { Origin: baseURL }
		});

		expect(remove.status()).toBe(401);
		expect(update.status()).toBe(401);
	});

	test('reject an unauthenticated admin request', async ({ page }) => {
		await page.goto('/admin/users');

		await expect(page).toHaveURL('/login?redirectTo=%2Fadmin%2Fusers');
	});
});

test.describe('public pages', () => {
	test('stay open without signing in', async ({ page, request }) => {
		await visit(page, '/');
		await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

		await visit(page, '/login');
		await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

		expect((await request.get('/healthz')).status()).toBe(200);
	});
});

test.describe('registration', () => {
	test('is closed', async ({ page, request }) => {
		const response = await request.post('/api/auth/sign-up/email', {
			data: { name: 'Sneaky', email: 'sneaky@example.com', password: 'sneaky-password-1' },
			headers: { Origin: baseURL }
		});

		expect(response.ok()).toBe(false);

		await visit(page, '/login');
		await page.getByLabel('Email').fill('sneaky@example.com');
		await page.getByLabel('Password').fill('sneaky-password-1');
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
	});
});

test.describe('roles', () => {
	test('a member can use the demos but not the admin area', async ({ page }) => {
		await signIn(page, adminCredentials);
		const member = await createUser(page);
		await signOut(page);

		await signIn(page, member);
		await expect(page.getByRole('link', { name: 'Demos' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0);

		const response = await page.goto('/admin/users');

		expect(response?.status()).toBe(403);
	});

	test('an admin sees the admin area', async ({ page }) => {
		await signIn(page, adminCredentials);

		await page.getByRole('link', { name: 'Users' }).click();

		await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
	});
});
