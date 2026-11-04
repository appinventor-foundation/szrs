// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { test, expect } from '@playwright/test';
import { adminCredentials, baseURL } from './support/auth.js';
import { newSession, signIn } from './support/page.js';

test.beforeEach(async ({ page }) => {
	await signIn(page, adminCredentials);
});

test.describe('the forwarder to the proxy', () => {
	test('passes a zoom request through with the person’s address', async ({ page }) => {
		const response = await page.request.post('/api/szrs/v1/zoom/stream', {
			data: { model: 'fake-model', slug: 'x', workspaceJson: {} },
			headers: { Origin: baseURL }
		});

		expect(response.status()).toBe(200);
		expect(response.headers()['content-type']).toContain('text/event-stream');
		const text = await response.text();
		const event = JSON.parse(text.replace(/^data: /, '').trim());
		expect(event.type).toBe('echo');
		expect(JSON.parse(event.body)).toMatchObject({ model: 'fake-model' });
		expect(event.forwardedFor).toBeTruthy();
	});

	test('turns away someone who is not signed in', async ({ browser }) => {
		const session = await newSession(browser);

		const response = await session.page.request.get('/api/szrs/v1/models', { maxRedirects: 0 });

		expect(response.status()).toBe(303);
		expect(response.headers()['location']).toContain('/login');
		await session.context.close();
	});
});
