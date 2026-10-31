// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';
import { hasRole, isAdmin } from './roles.js';

describe('roles', () => {
	it('reads comma-separated roles', () => {
		expect(hasRole('admin', 'admin')).toBe(true);
		expect(hasRole('user, admin', 'admin')).toBe(true);
		expect(hasRole('user', 'admin')).toBe(false);
		expect(hasRole('superadmin', 'admin')).toBe(false);
		expect(hasRole(null, 'admin')).toBe(false);
	});

	it('knows who is an admin', () => {
		expect(isAdmin({ role: 'admin' })).toBe(true);
		expect(isAdmin({ role: 'user' })).toBe(false);
		expect(isAdmin(null)).toBe(false);
	});
});
