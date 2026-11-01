// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { expect, test, type Page } from '@playwright/test';
import { adminCredentials } from './support/auth.js';
import { resetDatabase } from './support/database.js';
import { accountMenuTrigger, openAccountMenu, signIn, signOut, visit } from './support/page.js';
import { createUser } from './support/users.js';

test.beforeEach(async () => {
	await resetDatabase();
});

const signOutButton = (page: Page) => page.getByRole('button', { name: 'Sign out', exact: true });

test.describe('the account menu', () => {
	test('keeps Sign out and the theme controls out of the header bar', async ({ page }) => {
		await signIn(page, adminCredentials);

		await expect(signOutButton(page)).toBeHidden();
		await expect(page.getByRole('combobox', { name: 'Theme' })).toBeHidden();
		await expect(page.getByRole('button', { name: /Switch to (dark|light) mode/ })).toBeHidden();
	});

	test('shows the profile, theme controls and Sign out when opened', async ({ page }) => {
		await signIn(page, adminCredentials);

		await openAccountMenu(page);

		await expect(page.getByText(adminCredentials.name)).toBeVisible();
		await expect(page.getByText(adminCredentials.email)).toBeVisible();
		await expect(page.getByText('Administrator')).toBeVisible();
		await expect(page.getByRole('combobox', { name: 'Theme' })).toBeVisible();
		await expect(page.getByRole('button', { name: /Switch to (dark|light) mode/ })).toBeVisible();
		await expect(signOutButton(page)).toBeVisible();
	});

	test('labels a regular user as a member', async ({ page }) => {
		await signIn(page, adminCredentials);
		const member = await createUser(page);
		await signOut(page);
		await signIn(page, member);

		await openAccountMenu(page);

		await expect(page.getByText('Member', { exact: true })).toBeVisible();
	});

	test('closes with Escape and returns focus to the trigger', async ({ page }) => {
		await signIn(page, adminCredentials);
		await openAccountMenu(page);

		await page.keyboard.press('Escape');

		await expect(signOutButton(page)).toBeHidden();
		await expect(accountMenuTrigger(page)).toBeFocused();
	});

	test('closes when clicking outside, and toggles from the trigger', async ({ page }) => {
		await signIn(page, adminCredentials);
		await openAccountMenu(page);

		await page.getByRole('heading', { name: 'Dashboard' }).click();
		await expect(signOutButton(page)).toBeHidden();

		await accountMenuTrigger(page).click();
		await expect(signOutButton(page)).toBeVisible();
		await accountMenuTrigger(page).click();
		await expect(signOutButton(page)).toBeHidden();
	});

	test('stays open while changing the theme and switching mode', async ({ page }) => {
		await signIn(page, adminCredentials);
		await openAccountMenu(page);

		await page.getByRole('combobox', { name: 'Theme' }).selectOption({ index: 1 });
		await expect(signOutButton(page)).toBeVisible();

		const html = page.locator('html');
		const before = await html.getAttribute('data-mode');
		await page.getByRole('button', { name: /Switch to (dark|light) mode/ }).click();
		await expect(html).not.toHaveAttribute('data-mode', before ?? '');
		await expect(signOutButton(page)).toBeVisible();
	});

	test('signs out from the menu', async ({ page }) => {
		await signIn(page, adminCredentials);

		await signOut(page);

		await expect(page).toHaveURL('/');
		await expect(accountMenuTrigger(page)).toHaveCount(0);
	});

	test('is absent for visitors, who see only a Sign in link, with no theme controls', async ({
		page
	}) => {
		await visit(page, '/');

		await expect(accountMenuTrigger(page)).toHaveCount(0);
		await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
		await expect(page.getByRole('combobox', { name: 'Theme' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: /Switch to (dark|light) mode/ })).toHaveCount(0);
	});
});
