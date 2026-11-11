// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';
import Page from './+page.svelte';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';

describe('+page.svelte', () => {
	it('renders the project summary', async () => {
		await render(Page);

		await expect.element(page.getByTestId('project-summary')).toBeInTheDocument();
	});

	it('shows the poster and loads no video until it is clicked', async () => {
		await render(Page);

		await expect.element(page.getByTestId('youtube-poster')).toBeInTheDocument();
		expect(page.getByTestId('youtube-embed').query()).toBeNull();
	});

	it('embeds the project video after the poster is clicked', async () => {
		await render(Page);

		// A DOM click: this page is rendered without the app's CSS, so a pointer click
		// would aim at the middle of an unstyled, oversized image. The e2e test clicks for real.
		(page.getByTestId('youtube-poster').element() as HTMLElement).click();

		await expect
			.element(page.getByTestId('youtube-embed'))
			.toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/0neGKVIlDJs?autoplay=1');
		expect(page.getByTestId('youtube-poster').query()).toBeNull();
	});
});
