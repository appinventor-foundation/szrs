// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { expect, test, type Page } from '@playwright/test';
import { adminCredentials } from './support/auth.js';
import { resetDatabase } from './support/database.js';
import { signIn, visit } from './support/page.js';
import { createUser } from './support/users.js';

// Sorting, searching and filtering are the shared DataTable's, so they are
// tested once on each list rather than once per feature.

test.beforeEach(async ({ page }) => {
	await resetDatabase();
	await signIn(page, adminCredentials);
});

const rows = (page: Page) => page.getByTestId('list-row');
const count = (page: Page) => page.getByTestId('list-count');
const sortBy = (page: Page, key: string) => page.getByTestId(`sort-${key}`);
const columnHeader = (page: Page, name: string) => page.getByRole('columnheader', { name });

async function createDemo(page: Page, title: string, description = '', plugin = false) {
	await visit(page, '/demos/new');
	await page.getByLabel('Title').fill(title);
	await page.getByLabel('Description').fill(description);
	if (plugin) await page.getByRole('radio', { name: 'Plugin demo', exact: true }).check();
	await page.getByRole('button', { name: 'Create demo' }).click();
	await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

test.describe('the demos list', () => {
	test.beforeEach(async ({ page }) => {
		await createDemo(page, 'Banana', 'a yellow fruit');
		await createDemo(page, 'Apple', 'a red fruit', true);
		await createDemo(page, 'Cherry', 'tiny and red');
		await visit(page, '/demos');
	});

	test('starts newest first and sorts by a column, then back', async ({ page }) => {
		await expect(rows(page)).toHaveCount(3);
		await expect(rows(page).first()).toContainText('Cherry');

		await sortBy(page, 'title').click();
		await expect(columnHeader(page, 'Title')).toHaveAttribute('aria-sort', 'ascending');
		await expect(rows(page).first()).toContainText('Apple');
		await expect(rows(page).last()).toContainText('Cherry');

		await sortBy(page, 'title').click();
		await expect(columnHeader(page, 'Title')).toHaveAttribute('aria-sort', 'descending');
		await expect(rows(page).first()).toContainText('Cherry');
		await expect(rows(page).last()).toContainText('Apple');

		await sortBy(page, 'title').click();
		await expect(columnHeader(page, 'Title')).toHaveAttribute('aria-sort', 'none');
		await expect(rows(page).first()).toContainText('Cherry');
		await expect(rows(page).last()).toContainText('Banana');
	});

	test('sorting by one column clears the mark on the other', async ({ page }) => {
		await sortBy(page, 'title').click();
		await sortBy(page, 'created').click();

		await expect(columnHeader(page, 'Created')).toHaveAttribute('aria-sort', 'ascending');
		await expect(columnHeader(page, 'Title')).toHaveAttribute('aria-sort', 'none');
		await expect(rows(page).first()).toContainText('Banana');
	});

	test('the description has no sort button', async ({ page }) => {
		await expect(page.getByTestId('sort-description')).toHaveCount(0);
		await expect(page.getByTestId('sort-kind')).toHaveCount(1);
	});

	test('searches the title and the description', async ({ page }) => {
		await page.getByTestId('list-search').fill('red');
		await expect(rows(page)).toHaveCount(2);
		await expect(count(page)).toHaveText('2 of 3');

		await page.getByTestId('list-search').fill('red tiny');
		await expect(rows(page)).toHaveCount(1);
		await expect(rows(page).first()).toContainText('Cherry');
	});

	test('filters by demo kind', async ({ page }) => {
		await page.getByTestId('list-filter-kind').selectOption('plugin');

		await expect(rows(page)).toHaveCount(1);
		await expect(rows(page).first()).toContainText('Apple');
	});

	test('combines search, filter and sort, and keeps the sort while filtering', async ({ page }) => {
		await sortBy(page, 'title').click();
		await page.getByTestId('list-filter-kind').selectOption('none');
		await page.getByTestId('list-search').fill('fruit');

		await expect(rows(page)).toHaveCount(1);
		await expect(rows(page).first()).toContainText('Banana');
		await expect(columnHeader(page, 'Title')).toHaveAttribute('aria-sort', 'ascending');
	});

	test('says so when nothing matches and clears the filters', async ({ page }) => {
		await page.getByTestId('list-filter-kind').selectOption('iframe');
		await page.getByTestId('list-search').fill('banana');

		await expect(page.getByTestId('list-no-results')).toBeVisible();
		await expect(rows(page)).toHaveCount(0);

		await page.getByTestId('list-clear').click();
		await expect(rows(page)).toHaveCount(3);
		await expect(page.getByTestId('list-search')).toHaveValue('');
		await expect(page.getByTestId('list-filter-kind')).toHaveValue('');
	});

	test('a filtered row still opens its demo', async ({ page }) => {
		await page.getByTestId('list-search').fill('apple');
		await rows(page).first().getByRole('link').click();

		await expect(page.getByRole('heading', { level: 1, name: 'Apple' })).toBeVisible();
	});
});

test.describe('the users list', () => {
	test.beforeEach(async ({ page }) => {
		await createUser(page, { name: 'Zed Member', email: 'zed@example.com' });
		await createUser(page, { name: 'Amy Admin', email: 'amy@example.com', role: 'admin' });
		await visit(page, '/admin/users');
	});

	test('sorts by name and by role', async ({ page }) => {
		await sortBy(page, 'name').click();
		await expect(rows(page).first()).toContainText('Amy Admin');
		await expect(rows(page).last()).toContainText('Zed Member');

		await sortBy(page, 'role').click();
		await expect(columnHeader(page, 'Role')).toHaveAttribute('aria-sort', 'ascending');
		await expect(columnHeader(page, 'Name')).toHaveAttribute('aria-sort', 'none');
		await expect(rows(page).last()).toContainText('Zed Member');
	});

	test('searches the name and the email', async ({ page }) => {
		await page.getByTestId('list-search').fill('zed@');
		await expect(rows(page)).toHaveCount(1);

		await page.getByTestId('list-search').fill('amy');
		await expect(rows(page)).toHaveCount(1);
		await expect(rows(page).first()).toContainText('amy@example.com');
	});

	test('filters by role', async ({ page }) => {
		await expect(rows(page)).toHaveCount(3); // the seeded admin and the two above

		await page.getByTestId('list-filter-role').selectOption('admin');
		await expect(rows(page)).toHaveCount(2);

		await page.getByTestId('list-filter-role').selectOption('user');
		await expect(rows(page)).toHaveCount(1);
		await expect(rows(page).first()).toContainText('zed@example.com');
	});

	test('filters by status', async ({ page }) => {
		await page.getByTestId('list-filter-status').selectOption('Banned');
		await expect(page.getByTestId('list-no-results')).toBeVisible();

		await page.getByTestId('list-filter-status').selectOption('Active');
		await expect(rows(page)).toHaveCount(3);
	});
});
