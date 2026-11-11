// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { expect, test } from '@playwright/test';
import { visit } from './support/page.js';

test('a visitor sees the project summary and the video poster without signing in', async ({
	page
}) => {
	await visit(page, '/');

	await expect(page.getByTestId('project-summary')).toBeVisible();
	await expect(page.getByTestId('youtube-poster')).toBeVisible();
	await expect(page.getByTestId('youtube-embed')).toHaveCount(0);
});

test('clicking the poster loads the video', async ({ page }) => {
	await visit(page, '/');

	await page.getByTestId('youtube-poster').click();

	await expect(page.getByTestId('youtube-embed')).toHaveAttribute(
		'src',
		'https://www.youtube-nocookie.com/embed/0neGKVIlDJs?autoplay=1'
	);
	await expect(page.getByTestId('youtube-poster')).toHaveCount(0);
});
