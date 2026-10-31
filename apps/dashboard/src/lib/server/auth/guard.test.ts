// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';
import { decideAccess } from './guard.js';

const admin = { role: 'admin' };
const member = { role: 'user' };

describe('decideAccess', () => {
	it.each([null, '/', '/login', '/healthz', '/logout'])('leaves %s public', (routeId) => {
		expect(decideAccess(routeId, undefined)).toBe('allow');
	});

	it.each(['/(protected)/demos', '/(protected)/demos/[id]'])(
		'sends a visitor to the login page for %s',
		(routeId) => {
			expect(decideAccess(routeId, undefined)).toBe('login');
			expect(decideAccess(routeId, null)).toBe('login');
		}
	);

	it('lets a signed-in user into the protected group', () => {
		expect(decideAccess('/(protected)/demos', member)).toBe('allow');
		expect(decideAccess('/(protected)/demos/[id]', admin)).toBe('allow');
	});

	it.each(['/(protected)/admin/users', '/(protected)/admin/users/[id]'])(
		'keeps %s for admins',
		(routeId) => {
			expect(decideAccess(routeId, undefined)).toBe('login');
			expect(decideAccess(routeId, member)).toBe('forbidden');
			expect(decideAccess(routeId, { role: null })).toBe('forbidden');
			expect(decideAccess(routeId, admin)).toBe('allow');
		}
	);

	it('accepts an admin who has several roles', () => {
		expect(decideAccess('/(protected)/admin/users', { role: 'user,admin' })).toBe('allow');
	});

	it('does not treat a lookalike route as protected', () => {
		expect(decideAccess('/(protectedish)/x', undefined)).toBe('allow');
	});
});
