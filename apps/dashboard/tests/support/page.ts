// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { expect, type Page } from '@playwright/test';

// Opens a page and waits until the app has hydrated (see the root layout).
// Hydration resets form fields to their initial values, so typing before it
// finishes is a race that only shows up on slow machines such as CI.
export async function visit(page: Page, path: string) {
	await page.goto(path);
	await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
}
