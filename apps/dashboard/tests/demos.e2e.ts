// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { expect, test, type Page } from '@playwright/test';
import { adminCredentials } from './support/auth.js';
import { resetDatabase } from './support/database.js';
import { signIn, visit } from './support/page.js';

test.beforeEach(async ({ page }) => {
	await resetDatabase();
	await signIn(page, adminCredentials);
});

async function createDemo(page: Page, title: string, description = '') {
	await page.getByLabel('Title').fill(title);
	await page.getByLabel('Description').fill(description);
	await page.getByRole('button', { name: 'Create demo' }).click();
}

// The Edit link navigates on the client. Wait until the edit page has actually
// replaced the list: until then `getByLabel('Title')` still matches the create
// form, and a fill would go to the wrong input.
async function openEditor(page: Page, title: string) {
	await page.getByRole('link', { name: `Edit ${title}` }).click();
	await expect(page.getByRole('heading', { name: 'Edit demo' })).toBeVisible();
	await expect(page.getByLabel('Title')).toHaveValue(title);
}

test('shows an empty state', async ({ page }) => {
	await visit(page, '/demos');

	await expect(page.getByText('No demos yet.')).toBeVisible();
});

test('creates a demo and keeps it after a reload', async ({ page }) => {
	await visit(page, '/demos');

	await createDemo(page, 'First demo', 'About the first demo');

	const list = page.getByRole('list', { name: 'Demos' });
	await expect(list.getByText('First demo', { exact: true })).toBeVisible();
	await expect(list.getByText('About the first demo')).toBeVisible();

	await page.reload();
	await expect(list.getByText('First demo', { exact: true })).toBeVisible();
});

test('lists the newest demo first', async ({ page }) => {
	await visit(page, '/demos');

	await createDemo(page, 'Older');
	await expect(page.getByText('Older')).toBeVisible();
	await createDemo(page, 'Newer');

	await expect(page.getByRole('listitem').first()).toContainText('Newer');
});

test('rejects a blank title and keeps what was typed', async ({ page }) => {
	await visit(page, '/demos');

	await createDemo(page, '   ', 'Keep this text');

	await expect(page.getByRole('alert')).toHaveText('Title is required');
	await expect(page.getByLabel('Description')).toHaveValue('Keep this text');
	await expect(page.getByText('No demos yet.')).toBeVisible();
});

test('rejects a title over 120 characters', async ({ page }) => {
	await visit(page, '/demos');

	await createDemo(page, 'x'.repeat(121));

	await expect(page.getByRole('alert')).toHaveText('Title is too long');
});

test('edits a demo', async ({ page }) => {
	await visit(page, '/demos');
	await createDemo(page, 'Before', 'Old text');
	await openEditor(page, 'Before');

	await page.getByLabel('Title').fill('After');
	await page.getByRole('button', { name: 'Save changes' }).click();

	await expect(page).toHaveURL('/demos');
	await expect(page.getByText('After')).toBeVisible();
	await expect(page.getByText('Before')).toHaveCount(0);
});

test('shows validation errors when editing', async ({ page }) => {
	await visit(page, '/demos');
	await createDemo(page, 'Keep me');
	await openEditor(page, 'Keep me');

	await page.getByLabel('Title').fill('   ');
	await page.getByRole('button', { name: 'Save changes' }).click();

	await expect(page.getByRole('alert')).toHaveText('Title is required');
});

test('deletes a demo', async ({ page }) => {
	await visit(page, '/demos');
	await createDemo(page, 'Doomed');

	await page.getByRole('button', { name: 'Delete Doomed' }).click();

	await expect(page.getByText('No demos yet.')).toBeVisible();
});

test('answers 404 for a missing or malformed demo id', async ({ page }) => {
	const missing = await page.goto('/demos/3f1c2b6e-9a4d-4c52-8f0e-2a7b1d5e6c90');
	expect(missing?.status()).toBe(404);

	const malformed = await page.goto('/demos/not-a-uuid');
	expect(malformed?.status()).toBe(404);
});
