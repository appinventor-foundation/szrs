// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { expect, type Browser, type Page } from '@playwright/test';
import { baseURL } from './auth.js';

export type Credentials = { email: string; password: string };

// Waits until the app has hydrated (see the root layout). Hydration resets form
// fields to their initial values, so typing before it finishes is a race that
// only shows up on slow machines such as CI.
export async function waitForHydration(page: Page) {
	await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
}

// Opens a page and waits until it is interactive.
export async function visit(page: Page, path: string) {
	await page.goto(path);
	await waitForHydration(page);
}

// Signs in through the real login form and waits for the account menu to appear.
export async function signIn(page: Page, { email, password }: Credentials) {
	await visit(page, '/login');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(accountMenuTrigger(page)).toBeVisible();
}

// The header's account menu: a disclosure holding the profile, theme and Sign out.
export function accountMenuTrigger(page: Page) {
	return page.getByLabel('Account menu');
}

// Opens the menu unless it is already open (the trigger toggles it).
export async function openAccountMenu(page: Page) {
	if (!(await page.getByRole('button', { name: 'Sign out', exact: true }).isVisible())) {
		await accountMenuTrigger(page).click();
	}
	await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
}

export async function signOut(page: Page) {
	await openAccountMenu(page);
	await page.getByRole('button', { name: 'Sign out', exact: true }).click();
	await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
}

// A second, independent browser session (its own cookies). Contexts made by
// hand do not inherit the config's `use` options, so repeat the ones we need.
export async function newSession(browser: Browser) {
	const context = await browser.newContext({
		baseURL,
		extraHTTPHeaders: { 'x-forwarded-proto': 'http' }
	});
	return { context, page: await context.newPage() };
}
