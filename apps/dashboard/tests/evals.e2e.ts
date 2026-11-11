// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { expect, test } from '@playwright/test';
import { adminCredentials, baseURL } from './support/auth.js';
import { resetDatabase } from './support/database.js';
import { signIn, visit } from './support/page.js';

// The server reads a small fixture (tests/support/evals-fixture) in place of
// apps/evals/results; see EVALS_DIR in playwright.config.ts.

test.describe('without signing in', () => {
	test('the results are not served', async ({ request }) => {
		for (const path of [
			'/evals/index.html',
			'/evals/2026-01-01-sample.html',
			'/evals/shots/dot.png'
		]) {
			const response = await request.get(path, { maxRedirects: 0 });

			expect(response.status(), path).toBe(303);
			expect(response.headers().location).toContain('/login');
		}
	});
});

test.describe('signed in', () => {
	test.beforeEach(async ({ page }) => {
		await resetDatabase();
		await signIn(page, adminCredentials);
	});

	test('the bare address goes to the index', async ({ page }) => {
		const response = await page.request.get('/evals', { maxRedirects: 0 });

		expect(response.status()).toBe(303);
		expect(response.headers().location).toContain('/evals/index.html');
	});

	test('serves the index, a report, its picture and its write-up', async ({ page }) => {
		const index = await page.request.get('/evals/index.html');
		expect(index.status()).toBe(200);
		expect(index.headers()['content-type']).toContain('text/html');
		expect(index.headers()['content-security-policy']).toContain("default-src 'none'");
		expect(index.headers()['x-content-type-options']).toBe('nosniff');

		const picture = await page.request.get('/evals/shots/dot.png');
		expect(picture.status()).toBe(200);
		expect(picture.headers()['content-type']).toBe('image/png');

		const writeUp = await page.request.get('/evals/2026-01-01-sample.md');
		expect(writeUp.status()).toBe(200);
		expect(writeUp.headers()['content-type']).toContain('text/plain');
	});

	test('follows the index to a report whose picture loads', async ({ page }) => {
		// A plain page, not a dashboard one: there is no hydration marker to wait for.
		await page.goto('/evals/index.html');
		await page.getByTestId('report-link').click();

		await expect(page.getByTestId('report-title')).toBeVisible();
		await expect(page.getByTestId('report-picture')).toHaveJSProperty('complete', true);
		expect(
			await page.getByTestId('report-picture').evaluate((img: HTMLImageElement) => img.naturalWidth)
		).toBeGreaterThan(0);
	});

	test('does not serve other kinds of file, missing files or anything outside the folder', async ({
		page
	}) => {
		for (const path of [
			'/evals/data.json',
			'/evals/missing.html',
			'/evals/shots',
			'/evals/%2e%2e/%2e%2e/package.json',
			'/evals/..%2fplaywright.config.ts',
			'/evals/shots/..%2f..%2fplaywright.config.ts'
		]) {
			const response = await page.request.get(path, { maxRedirects: 0 });

			expect(response.status(), path).toBe(404);
		}
	});

	test('an embedded-page demo shows the index inside the dashboard', async ({ page }) => {
		await visit(page, '/demos/new');
		await page.getByLabel('Title').fill('Results');
		await page.getByRole('radio', { name: 'Embedded page', exact: true }).check();
		await page.getByLabel('Page to embed').fill(`${baseURL}/evals/index.html`);
		await page.getByRole('button', { name: 'Create demo' }).click();
		await expect(page.getByRole('heading', { level: 1, name: 'Results' })).toBeVisible();

		await page.getByRole('link', { name: 'Start demo' }).click();

		const frame = page.frameLocator('iframe[title="Results"]');
		await expect(frame.getByTestId('report')).toBeVisible();
		await frame.getByTestId('report-link').click();
		await expect(frame.getByTestId('report-title')).toBeVisible();
	});
});
