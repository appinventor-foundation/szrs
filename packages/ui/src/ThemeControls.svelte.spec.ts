// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import ThemeControls from './ThemeControls.svelte';
import { MODE_STORAGE_KEY, THEME_STORAGE_KEY, THEMES } from './theme.svelte.js';

const root = document.documentElement;

afterEach(() => {
	vi.restoreAllMocks();
	root.removeAttribute('data-theme');
	root.removeAttribute('data-mode');
	localStorage.clear();
});

describe('ThemeControls', () => {
	it('offers every theme', async () => {
		await render(ThemeControls);

		for (const theme of THEMES) {
			await expect.element(page.getByRole('option', { name: theme.label })).toBeInTheDocument();
		}
	});

	it('adopts the theme and mode already on <html>', async () => {
		root.setAttribute('data-theme', 'seafoam');
		root.setAttribute('data-mode', 'dark');

		await render(ThemeControls);

		await expect.element(page.getByRole('combobox', { name: 'Theme' })).toHaveValue('seafoam');
		await expect
			.element(page.getByRole('button', { name: 'Switch to light mode' }))
			.toBeInTheDocument();
	});

	it('applies and remembers the chosen theme', async () => {
		await render(ThemeControls);

		await page.getByRole('combobox', { name: 'Theme' }).selectOptions('mona');

		expect(root.getAttribute('data-theme')).toBe('mona');
		expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('mona');
	});

	it('toggles between light and dark and remembers the mode', async () => {
		root.setAttribute('data-mode', 'light');
		await render(ThemeControls);

		await page.getByRole('button', { name: 'Switch to dark mode' }).click();

		expect(root.getAttribute('data-mode')).toBe('dark');
		expect(localStorage.getItem(MODE_STORAGE_KEY)).toBe('dark');
		await expect
			.element(page.getByRole('button', { name: 'Switch to light mode' }))
			.toBeInTheDocument();

		await page.getByRole('button', { name: 'Switch to light mode' }).click();

		expect(root.getAttribute('data-mode')).toBe('light');
		expect(localStorage.getItem(MODE_STORAGE_KEY)).toBe('light');
	});

	it('still switches when storage is blocked', async () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('blocked');
		});
		root.setAttribute('data-mode', 'light');
		await render(ThemeControls);

		await page.getByRole('button', { name: 'Switch to dark mode' }).click();

		expect(root.getAttribute('data-mode')).toBe('dark');
	});
});
