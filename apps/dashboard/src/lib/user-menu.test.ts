// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';
import { avatarInitial, roleLabel } from './user-menu.js';

describe('avatarInitial', () => {
	it('uses the first letter of the name, upper-cased', () => {
		expect(avatarInitial('ada lovelace', 'ada@example.com')).toBe('A');
	});

	it('ignores leading whitespace', () => {
		expect(avatarInitial('  grace', 'g@example.com')).toBe('G');
	});

	it('falls back to the email when the name is blank', () => {
		expect(avatarInitial('   ', 'zed@example.com')).toBe('Z');
	});

	it('keeps a whole character that needs two UTF-16 units', () => {
		expect(avatarInitial('😀 smile', 'a@example.com')).toBe('😀');
	});

	it('returns a placeholder when there is nothing to show', () => {
		expect(avatarInitial('', '')).toBe('?');
	});
});

describe('roleLabel', () => {
	it('names the roles', () => {
		expect(roleLabel(true)).toBe('Administrator');
		expect(roleLabel(false)).toBe('Member');
	});
});
