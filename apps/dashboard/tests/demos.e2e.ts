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

// Creates a demo through the "New demo" page and lands on its detail page.
async function createDemo(page: Page, title: string, description = '') {
	await visit(page, '/demos/new');
	await page.getByLabel('Title').fill(title);
	await page.getByLabel('Description').fill(description);
	await page.getByRole('button', { name: 'Create demo' }).click();
	await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

const breadcrumb = (page: Page) => page.getByRole('navigation', { name: 'Breadcrumb' });

test.describe('the list', () => {
	test('shows an empty state with a way to create a demo', async ({ page }) => {
		await visit(page, '/demos');

		await expect(page.getByText('No demos yet.')).toBeVisible();
		await expect(page.getByRole('link', { name: 'Create your first demo' })).toBeVisible();
		await expect(page.getByRole('table', { name: 'Demos' })).toHaveCount(0);
	});

	test('does not show the creation form, only a New demo button', async ({ page }) => {
		await visit(page, '/demos');

		await expect(page.getByLabel('Title')).toHaveCount(0);
		await page.getByRole('link', { name: 'New demo' }).click();

		await expect(page).toHaveURL('/demos/new');
		await expect(page.getByRole('heading', { name: 'New demo' })).toBeVisible();
	});

	test('lists demos in a table, newest first', async ({ page }) => {
		await createDemo(page, 'Older', 'About the older demo');
		await createDemo(page, 'Newer');
		await visit(page, '/demos');

		const table = page.getByRole('table', { name: 'Demos' });
		await expect(table.getByRole('columnheader')).toHaveText(['Title', 'Description', 'Created']);
		const rows = table.getByRole('row');
		await expect(rows).toHaveCount(3); // header + two demos
		await expect(rows.nth(1)).toContainText('Newer');
		await expect(rows.nth(2)).toContainText('Older');
		await expect(rows.nth(2)).toContainText('About the older demo');
	});

	test('keeps a very long description inside the page', async ({ page }) => {
		await createDemo(page, 'Wordy', 'x'.repeat(2000));
		await visit(page, '/demos');

		await expect(page.getByRole('link', { name: 'Wordy' })).toBeVisible();
		const overflows = await page.evaluate(
			() => document.documentElement.scrollWidth > document.documentElement.clientWidth
		);
		expect(overflows).toBe(false);
	});

	test('keeps demos after a reload', async ({ page }) => {
		await createDemo(page, 'Persistent');
		await visit(page, '/demos');
		await page.reload();

		await expect(page.getByRole('link', { name: 'Persistent' })).toBeVisible();
	});

	test('opens the detail page from a demo title', async ({ page }) => {
		await createDemo(page, 'Open me', 'Some details');
		await visit(page, '/demos');

		await page.getByRole('link', { name: 'Open me' }).click();

		await expect(page.getByRole('heading', { level: 1, name: 'Open me' })).toBeVisible();
		await expect(page.getByText('Some details')).toBeVisible();
	});

	test('opens the detail page when the row itself is clicked', async ({ page }) => {
		await createDemo(page, 'Row target', 'Click the description cell');
		await visit(page, '/demos');

		// The title link is stretched over the whole row, so it takes this click.
		await page.getByRole('cell', { name: 'Click the description cell' }).click({ force: true });

		await expect(page.getByRole('heading', { level: 1, name: 'Row target' })).toBeVisible();
	});
});

test.describe('creating', () => {
	test('creates a demo and shows its detail page', async ({ page }) => {
		await createDemo(page, 'First demo', 'About the first demo');

		await expect(page).toHaveURL(/\/demos\/[0-9a-f-]{36}$/);
		await expect(page.getByText('About the first demo')).toBeVisible();
		await expect(page.getByText('Created', { exact: true })).toBeVisible();
	});

	test('rejects a blank title and keeps what was typed', async ({ page }) => {
		await visit(page, '/demos/new');
		await page.getByLabel('Title').fill('   ');
		await page.getByLabel('Description').fill('Keep this text');
		await page.getByRole('button', { name: 'Create demo' }).click();

		await expect(page.getByRole('alert')).toHaveText('Title is required');
		await expect(page.getByLabel('Description')).toHaveValue('Keep this text');
		await expect(page).toHaveURL('/demos/new');
	});

	test('rejects a title over 120 characters', async ({ page }) => {
		await visit(page, '/demos/new');
		await page.getByLabel('Title').fill('x'.repeat(121));
		await page.getByRole('button', { name: 'Create demo' }).click();

		await expect(page.getByRole('alert')).toHaveText('Title is too long');
	});

	test('cancel goes back to the list without creating anything', async ({ page }) => {
		await visit(page, '/demos/new');

		await page.getByRole('link', { name: 'Cancel' }).click();

		await expect(page).toHaveURL('/demos');
		await expect(page.getByText('No demos yet.')).toBeVisible();
	});
});

test.describe('the detail page', () => {
	test('shows a placeholder when there is no description', async ({ page }) => {
		await createDemo(page, 'Bare');

		await expect(page.getByText('No description.')).toBeVisible();
	});

	test('has breadcrumbs back to the list', async ({ page }) => {
		await createDemo(page, 'Crumbs');

		const crumbs = breadcrumb(page);
		await expect(crumbs.getByText('Crumbs')).toHaveAttribute('aria-current', 'page');

		await crumbs.getByRole('link', { name: 'Demos' }).click();

		await expect(page).toHaveURL('/demos');
		await expect(page.getByRole('heading', { name: 'Demos' })).toBeVisible();
	});

	test('answers 404 for a missing or malformed demo id', async ({ page }) => {
		const missing = await page.goto('/demos/3f1c2b6e-9a4d-4c52-8f0e-2a7b1d5e6c90');
		expect(missing?.status()).toBe(404);

		const malformed = await page.goto('/demos/not-a-uuid');
		expect(malformed?.status()).toBe(404);

		const missingEditor = await page.goto('/demos/3f1c2b6e-9a4d-4c52-8f0e-2a7b1d5e6c90/edit');
		expect(missingEditor?.status()).toBe(404);
	});
});

test.describe('editing', () => {
	// The Edit link navigates on the client. Wait until the edit page has replaced
	// the detail page before typing.
	async function openEditor(page: Page, title: string) {
		await page.getByRole('link', { name: 'Edit', exact: true }).click();
		await expect(page.getByRole('heading', { name: 'Edit demo' })).toBeVisible();
		await expect(page.getByLabel('Title')).toHaveValue(title);
	}

	test('edits a demo and returns to its detail page', async ({ page }) => {
		await createDemo(page, 'Before', 'Old text');
		await openEditor(page, 'Before');

		await page.getByLabel('Title').fill('After');
		await page.getByRole('button', { name: 'Save changes' }).click();

		await expect(page.getByRole('heading', { level: 1, name: 'After' })).toBeVisible();
		await expect(page.getByText('Old text')).toBeVisible();
		await expect(page.getByText('Before')).toHaveCount(0);
	});

	test('breadcrumbs lead back to the demo and the list', async ({ page }) => {
		await createDemo(page, 'Trail');
		await openEditor(page, 'Trail');

		await expect(breadcrumb(page).getByText('Edit')).toHaveAttribute('aria-current', 'page');
		await breadcrumb(page).getByRole('link', { name: 'Trail' }).click();

		await expect(page.getByRole('heading', { level: 1, name: 'Trail' })).toBeVisible();
	});

	test('shows validation errors', async ({ page }) => {
		await createDemo(page, 'Keep me');
		await openEditor(page, 'Keep me');

		await page.getByLabel('Title').fill('   ');
		await page.getByRole('button', { name: 'Save changes' }).click();

		await expect(page.getByRole('alert')).toHaveText('Title is required');
	});

	test('cancel returns to the detail page unchanged', async ({ page }) => {
		await createDemo(page, 'Unchanged');
		await openEditor(page, 'Unchanged');

		await page.getByLabel('Title').fill('Changed');
		await page.getByRole('link', { name: 'Cancel' }).click();

		await expect(page.getByRole('heading', { level: 1, name: 'Unchanged' })).toBeVisible();
	});
});

test.describe('deleting', () => {
	test('needs a second step, then removes the demo and returns to the list', async ({ page }) => {
		await createDemo(page, 'Doomed');
		const confirm = page.getByRole('button', { name: 'Yes, delete this demo' });

		await expect(confirm).toBeHidden();
		await page.getByText('Delete this demo', { exact: true }).click();
		await confirm.click();

		await expect(page).toHaveURL('/demos?deleted=1');
		await expect(page.getByRole('status')).toHaveText('Demo deleted.');
		await expect(page.getByText('No demos yet.')).toBeVisible();
	});

	test('keeps the other demos and says what happened', async ({ page }) => {
		await createDemo(page, 'Keeper');
		await createDemo(page, 'Goner');

		await page.getByText('Delete this demo', { exact: true }).click();
		await page.getByRole('button', { name: 'Yes, delete this demo' }).click();

		await expect(page.getByRole('status')).toHaveText('Demo deleted.');
		await expect(page.getByRole('link', { name: 'Keeper' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Goner' })).toHaveCount(0);
	});
});
