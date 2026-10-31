// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';
import { demoIdSchema, demoInputSchema } from './demo.js';

describe('demoInputSchema', () => {
	it('trims the title', () => {
		expect(demoInputSchema.parse({ title: '  Hello  ' }).title).toBe('Hello');
	});

	it('rejects a blank title', () => {
		const result = demoInputSchema.safeParse({ title: '   ' });

		expect(result.success).toBe(false);
	});

	it('rejects a title over 120 characters', () => {
		const result = demoInputSchema.safeParse({ title: 'x'.repeat(121) });

		expect(result.success).toBe(false);
	});

	it('turns a blank description into null', () => {
		expect(demoInputSchema.parse({ title: 'a', description: '  ' }).description).toBeNull();
	});

	it('keeps a description', () => {
		expect(demoInputSchema.parse({ title: 'a', description: ' text ' }).description).toBe('text');
	});

	it('allows a missing description', () => {
		expect(demoInputSchema.parse({ title: 'a' }).description).toBeUndefined();
	});
});

describe('demoIdSchema', () => {
	it('accepts a uuid and rejects anything else', () => {
		expect(demoIdSchema.safeParse('3f1c2b6e-9a4d-4c52-8f0e-2a7b1d5e6c90').success).toBe(true);
		expect(demoIdSchema.safeParse('nope').success).toBe(false);
	});
});
