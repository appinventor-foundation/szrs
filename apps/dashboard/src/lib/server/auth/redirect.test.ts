// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from './redirect.js';

describe('safeRedirectPath', () => {
	it.each(['/demos', '/demos/123?x=1#top', '/admin/users'])('keeps the local path %s', (path) => {
		expect(safeRedirectPath(path)).toBe(path);
	});

	it.each([
		'https://evil.example',
		'//evil.example',
		'/\\evil.example',
		'javascript:alert(1)',
		'demos',
		'/ok\nSet-Cookie: x=1',
		''
	])('falls back for %j', (path) => {
		expect(safeRedirectPath(path)).toBe('/');
	});

	it('falls back when there is nothing', () => {
		expect(safeRedirectPath(null)).toBe('/');
		expect(safeRedirectPath(undefined, '/demos')).toBe('/demos');
	});
});
