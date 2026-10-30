// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, THEMES, isMode, isTheme } from './theme.svelte.js';

describe('isTheme', () => {
	it('accepts each offered theme', () => {
		for (const theme of THEMES) {
			expect(isTheme(theme.id)).toBe(true);
		}
	});

	it('rejects anything else', () => {
		expect(isTheme('cerberus')).toBe(false);
		expect(isTheme('')).toBe(false);
		expect(isTheme(null)).toBe(false);
	});

	it('includes the default theme', () => {
		expect(isTheme(DEFAULT_THEME)).toBe(true);
	});
});

describe('isMode', () => {
	it('accepts light and dark only', () => {
		expect(isMode('light')).toBe(true);
		expect(isMode('dark')).toBe(true);
		expect(isMode('system')).toBe(false);
		expect(isMode(undefined)).toBe(false);
	});
});
