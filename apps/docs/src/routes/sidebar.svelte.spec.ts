// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Sidebar from '$lib/components/Sidebar.svelte';
import { buildNav, buildPages } from '$lib/nav';

const nav = buildNav(
	buildPages({
		'/content/index.md': { title: 'Welcome' },
		'/content/guide/index.md': { title: 'Guide' },
		'/content/guide/intro.md': { title: 'Introduction' },
		'/content/api/events.md': { title: 'Events' }
	})
);

describe('Sidebar', () => {
	it('links to every page, with folders as sections', async () => {
		await render(Sidebar, { nav, currentSlug: '' });

		await expect.element(page.getByRole('link', { name: 'Welcome' })).toBeInTheDocument();
		await expect.element(page.getByRole('link', { name: 'Guide' })).toBeInTheDocument();
		await expect.element(page.getByRole('link', { name: 'Introduction' })).toBeInTheDocument();
		await expect.element(page.getByRole('link', { name: 'Events' })).toBeInTheDocument();
		await expect.element(page.getByText('Api')).toBeInTheDocument();
		await expect.element(page.getByRole('link', { name: 'Api' })).not.toBeInTheDocument();
	});

	it('links with a trailing slash, as the site is served', async () => {
		await render(Sidebar, { nav, currentSlug: '' });

		await expect
			.element(page.getByRole('link', { name: 'Introduction' }))
			.toHaveAttribute('href', expect.stringMatching(/guide\/intro\/$/));
	});

	it('marks the current page', async () => {
		await render(Sidebar, { nav, currentSlug: 'guide/intro' });

		await expect
			.element(page.getByRole('link', { name: 'Introduction' }))
			.toHaveAttribute('aria-current', 'page');
		await expect
			.element(page.getByRole('link', { name: 'Guide' }))
			.not.toHaveAttribute('aria-current');
	});
});
