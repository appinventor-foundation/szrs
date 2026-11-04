// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { expect, test, type Page } from '@playwright/test';
import { adminCredentials, baseURL } from './support/auth.js';
import { resetDatabase } from './support/database.js';
import { newSession, signIn, visit } from './support/page.js';
import { createUser } from './support/users.js';

test.beforeEach(async ({ page }) => {
	await resetDatabase();
	await signIn(page, adminCredentials);
});

// Creates a demo through the form (the admin sees the starting-program choice)
// and lands on its detail page.
async function createDemo(page: Page, title: string, example?: string, withDemo = true) {
	await visit(page, '/demos/new');
	await page.getByLabel('Title').fill(title);
	if (withDemo) await page.getByRole('radio', { name: 'Plugin demo', exact: true }).check();
	if (example) {
		await page.getByLabel('An example', { exact: true }).check();
		await page.getByLabel('Example', { exact: true }).selectOption({ label: example });
	}
	await page.getByRole('button', { name: 'Create demo' }).click();
	await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

// Opens the runner from the detail page and waits for Blockly to be up.
async function startDemo(page: Page) {
	await page.getByRole('link', { name: 'Start demo' }).click();
	await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Run');
	await expect(workspace(page)).toHaveAttribute('data-workspace-ready', 'true');
}

const status = (page: Page) => page.getByTestId('run-status');
const workspace = (page: Page) => page.getByTestId('blockly-workspace');

// Top-level blocks on the main workspace (not the toolbox flyout).
const blocks = (page: Page) =>
	workspace(page).locator(
		'svg.blocklySvg > g.blocklyWorkspace > g.blocklyBlockCanvas > g.blocklyDraggable'
	);

// Drags the first block of a toolbox category onto the workspace.
async function addBlock(page: Page, category: string) {
	const before = await blocks(page).count();
	await workspace(page).locator('.blocklyToolboxCategory', { hasText: category }).click();
	const block = workspace(page).locator('.blocklyFlyout g.blocklyDraggable').first();
	await expect(block).toBeVisible();
	const box = (await block.boundingBox())!;
	await page.mouse.move(box.x + 6, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + 320, box.y + 120, { steps: 12 });
	await page.mouse.up();
	await expect(blocks(page)).toHaveCount(before + 1);
}

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

test.describe('starting a demo', () => {
	test('opens a workspace with the plugin’s zoom controls', async ({ page }) => {
		await createDemo(page, 'Zoomy');
		await startDemo(page);

		await expect(workspace(page).locator('.blocklySvg').first()).toBeVisible();
		// The plugin's own controls only appear when it runs on the same Blockly.
		await expect(workspace(page).locator('.zoom-slider')).toBeVisible();
		await expect(blocks(page)).toHaveCount(0);
		await expect(page.getByText('Starting from an empty workspace.')).toBeVisible();
	});

	test('the plugin reaches the proxy through the dashboard', async ({ page }) => {
		await createDemo(page, 'Zoomy');
		const models = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/szrs/v1/models');

		await startDemo(page);

		const response = await models;
		expect(response.status()).toBe(200);
		expect(await response.json()).toEqual({ models: ['fake-model', 'other-model'] });
	});

	test('opens the sample a demo points at', async ({ page }) => {
		await createDemo(page, 'Loops', 'Counting loop');
		await expect(page.getByText('Example: Counting loop')).toBeVisible();
		await startDemo(page);

		await expect(blocks(page)).toHaveCount(1);
		await expect(page.getByText('Showing the demo’s starting program.')).toBeVisible();
	});
});

test.describe('which demo an entry runs', () => {
	test('an entry has no demo until one is chosen', async ({ page }) => {
		await createDemo(page, 'Plain', undefined, false);
		const path = new URL(page.url()).pathname;

		await expect(page.getByText('No demo', { exact: true })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Start demo' })).toHaveCount(0);
		const response = await page.goto(`${path}/run`);
		expect(response?.status()).toBe(404);
	});

	test('an admin can attach the plugin demo to an entry, and take it away again', async ({
		page
	}) => {
		await createDemo(page, 'Switchable', undefined, false);
		await page.getByRole('link', { name: 'Edit' }).click();
		await page.getByRole('radio', { name: 'Plugin demo', exact: true }).check();
		await page.getByRole('button', { name: 'Save changes' }).click();

		await expect(page.getByText('Plugin demo', { exact: true })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Start demo' })).toBeVisible();

		await page.getByRole('link', { name: 'Edit' }).click();
		await page.getByRole('radio', { name: 'No demo', exact: true }).check();
		await page.getByRole('button', { name: 'Save changes' }).click();

		await expect(page.getByText('No demo', { exact: true })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Start demo' })).toHaveCount(0);
	});

	test('entries can share the plugin demo and still keep their own copies', async ({ page }) => {
		await createDemo(page, 'First');
		const first = new URL(page.url()).pathname;
		await createDemo(page, 'Second');
		const second = new URL(page.url()).pathname;

		await visit(page, `${first}/run`);
		await expect(workspace(page)).toHaveAttribute('data-workspace-ready', 'true');
		await addBlock(page, 'Math');
		await button(page, 'Save').click();
		await expect(status(page)).toHaveText('Saved.');

		await visit(page, `${second}/run`);
		await expect(workspace(page)).toHaveAttribute('data-workspace-ready', 'true');
		await expect(blocks(page)).toHaveCount(0);
	});
});

test.describe('examples in the runner', () => {
	test('loads an example into the workspace, and an empty one again', async ({ page }) => {
		await createDemo(page, 'Examples');
		await startDemo(page);
		await expect(blocks(page)).toHaveCount(0);

		await page.getByLabel('Load an example').selectOption({ label: 'Counting loop' });
		await expect(blocks(page)).toHaveCount(1);
		await expect(page.getByText('Unsaved changes.')).toBeVisible();

		await page.getByLabel('Load an example').selectOption({ label: 'Empty workspace' });
		await expect(blocks(page)).toHaveCount(0);
	});
});

test.describe('saving', () => {
	test('keeps what you saved when you come back', async ({ page }) => {
		await createDemo(page, 'Saver');
		await startDemo(page);

		await addBlock(page, 'Math');
		await expect(page.getByText('Unsaved changes.')).toBeVisible();
		await button(page, 'Save').click();
		await expect(status(page)).toHaveText('Saved.');
		await expect(page.getByText('Unsaved changes.')).toHaveCount(0);

		await page.reload();
		await expect(workspace(page)).toHaveAttribute('data-workspace-ready', 'true');
		await expect(blocks(page)).toHaveCount(1);
		await expect(page.getByText('Showing your saved copy.')).toBeVisible();
	});

	test('keeps each person’s copy to themselves', async ({ page, browser }) => {
		await createDemo(page, 'Shared');
		const demoUrl = page.url();
		const member = await createUser(page);
		await startDemo(page);
		await addBlock(page, 'Math');
		await button(page, 'Save').click();
		await expect(status(page)).toHaveText('Saved.');

		const other = await newSession(browser);
		await signIn(other.page, member);
		await visit(other.page, `${new URL(demoUrl).pathname}/run`);
		await expect(workspace(other.page)).toHaveAttribute('data-workspace-ready', 'true');
		await expect(blocks(other.page)).toHaveCount(0);
		await addBlock(other.page, 'Text');
		await addBlock(other.page, 'Text');
		await button(other.page, 'Save').click();
		await expect(status(other.page)).toHaveText('Saved.');
		await other.context.close();

		await page.reload();
		await expect(workspace(page)).toHaveAttribute('data-workspace-ready', 'true');
		await expect(blocks(page)).toHaveCount(1);
	});

	test('goes back to the starting program on reset', async ({ page }) => {
		await createDemo(page, 'Resettable', 'Counting loop');
		await startDemo(page);
		await addBlock(page, 'Math');
		await button(page, 'Save').click();
		await expect(status(page)).toHaveText('Saved.');
		await expect(blocks(page)).toHaveCount(2);

		await button(page, 'Reset to starting program').click();

		await expect(status(page)).toHaveText('Back to the starting program.');
		await expect(page.getByText('Showing the demo’s starting program.')).toBeVisible();
		await expect(workspace(page)).toHaveAttribute('data-workspace-ready', 'true');
		await expect(blocks(page)).toHaveCount(1);
	});
});

test.describe('the starting program', () => {
	test('an admin can save the workspace as the starting program', async ({ page, browser }) => {
		await createDemo(page, 'Starter');
		const demoPath = new URL(page.url()).pathname;
		const member = await createUser(page);
		await startDemo(page);
		await addBlock(page, 'Logic');
		await button(page, 'Save as starting program').click();
		await expect(status(page)).toHaveText('Saved as the starting program.');

		const other = await newSession(browser);
		await signIn(other.page, member);
		await visit(other.page, `${demoPath}/run`);
		await expect(workspace(other.page)).toHaveAttribute('data-workspace-ready', 'true');
		await expect(blocks(other.page)).toHaveCount(1);
		await expect(other.page.getByText('Showing the demo’s starting program.')).toBeVisible();
		await other.context.close();

		await visit(page, demoPath);
		await expect(page.getByText('A saved program')).toBeVisible();
	});

	test('an admin can switch a demo to an example from the edit page', async ({ page }) => {
		await createDemo(page, 'Switch');
		await page.getByRole('link', { name: 'Edit' }).click();
		await page.getByLabel('An example', { exact: true }).check();
		await page.getByLabel('Example', { exact: true }).selectOption({ label: 'Shopping total' });
		await page.getByRole('button', { name: 'Save changes' }).click();

		await expect(page.getByText('Example: Shopping total')).toBeVisible();
	});

	test('a member cannot choose it, and cannot save one', async ({ page, browser }) => {
		await createDemo(page, 'Locked');
		const demoPath = new URL(page.url()).pathname;
		const member = await createUser(page);

		const other = await newSession(browser);
		await signIn(other.page, member);
		await visit(other.page, `${demoPath}/edit`);
		await expect(other.page.getByLabel('Title')).toBeVisible();
		await expect(other.page.getByRole('radio', { name: 'Plugin demo', exact: true })).toHaveCount(
			0
		);

		await visit(other.page, `${demoPath}/run`);
		await expect(workspace(other.page)).toHaveAttribute('data-workspace-ready', 'true');
		await expect(button(other.page, 'Save as starting program')).toHaveCount(0);

		const response = await other.page.request.post(`${demoPath}/run?/saveStarter`, {
			form: { workspace: '{}' },
			headers: { Origin: baseURL }
		});
		expect(response.status()).toBe(403);
		await other.context.close();
	});
});
