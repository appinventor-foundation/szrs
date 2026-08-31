// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';
import CounterView from './CounterView.svelte';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';

describe('CounterView', () => {
	it('renders a count based on clicked buttons', async () => {
		await render(CounterView, {});

		await expect.element(page.getByText('Current count: 0')).toBeInTheDocument();

		const incrementButton = page.getByRole('button', { name: '+' });
		await expect.element(incrementButton).toBeInTheDocument();
		await incrementButton.click();
		await expect.element(page.getByText('Current count: 1')).toBeInTheDocument();

		const decrementButton = page.getByRole('button', { name: '-' });
		await expect.element(decrementButton).toBeInTheDocument();
		await decrementButton.click();
		await expect.element(page.getByText('Current count: 0')).toBeInTheDocument();
	});
});
