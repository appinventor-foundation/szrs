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

	it('embeds the project video', async () => {
		await render(Page);

		await expect
			.element(page.getByTestId('youtube-embed'))
			.toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/0neGKVIlDJs');
	});
});
