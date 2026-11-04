// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';
import { parseDemoForm } from './demo-form.js';

function formData(fields: Record<string, string>): FormData {
	const data = new FormData();
	for (const [key, value] of Object.entries(fields)) data.set(key, value);
	return data;
}

describe('parseDemoForm', () => {
	it('ignores the demo fields for someone who is not an admin', () => {
		const result = parseDemoForm(
			formData({
				title: 'T',
				demoKind: 'plugin',
				starterKind: 'sample',
				sampleId: 'counting-loop'
			}),
			false
		);

		expect(result).toEqual({ ok: true, data: { input: { title: 'T' } } });
	});

	it('sets no demo for an admin who chose none, and leaves the starting program alone', () => {
		const result = parseDemoForm(
			formData({ title: 'T', demoKind: 'none', starterKind: 'sample', sampleId: 'counting-loop' }),
			true
		);

		expect(result).toMatchObject({ ok: true, data: { setup: { demoKind: 'none' } } });
		expect(result.ok && result.data.setup?.starter).toBeUndefined();
	});

	it('reads the plugin demo that opens empty', () => {
		const result = parseDemoForm(
			formData({ title: 'T', demoKind: 'plugin', starterKind: 'empty' }),
			true
		);

		expect(result).toMatchObject({
			ok: true,
			data: { setup: { demoKind: 'plugin', starter: { kind: 'empty' } } }
		});
	});

	it('reads the plugin demo that opens with an example', () => {
		const result = parseDemoForm(
			formData({
				title: 'T',
				demoKind: 'plugin',
				starterKind: 'sample',
				sampleId: 'greeting-function'
			}),
			true
		);

		expect(result).toMatchObject({
			ok: true,
			data: {
				setup: { demoKind: 'plugin', starter: { kind: 'sample', sampleId: 'greeting-function' } }
			}
		});
	});

	it('keeps the saved program when an admin leaves it chosen', () => {
		const result = parseDemoForm(
			formData({ title: 'T', demoKind: 'plugin', starterKind: 'custom' }),
			true
		);

		expect(result).toMatchObject({ ok: true, data: { setup: { demoKind: 'plugin' } } });
		expect(result.ok && result.data.setup?.starter).toBeUndefined();
	});

	it('asks for an example when the example starter has none', () => {
		const result = parseDemoForm(
			formData({ title: 'T', demoKind: 'plugin', starterKind: 'sample' }),
			true
		);

		expect(result.ok).toBe(false);
		expect(!result.ok && result.errors.sampleId).toBeDefined();
	});

	it('rejects an unknown example and an unknown demo', () => {
		expect(
			parseDemoForm(
				formData({ title: 'T', demoKind: 'plugin', starterKind: 'sample', sampleId: 'made-up' }),
				true
			).ok
		).toBe(false);
		expect(parseDemoForm(formData({ title: 'T', demoKind: 'other' }), true).ok).toBe(false);
	});

	it('still validates the title', () => {
		expect(parseDemoForm(formData({ title: ' ', demoKind: 'none' }), true).ok).toBe(false);
		expect(parseDemoForm(formData({ title: ' ' }), false).ok).toBe(false);
	});
});
