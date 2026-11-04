// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';
import { clientAddressOf } from './client-address.js';

describe('clientAddressOf', () => {
	it('returns the address SvelteKit knows', () => {
		expect(clientAddressOf(() => '203.0.113.7')).toBe('203.0.113.7');
	});

	it('returns nothing instead of throwing when SvelteKit cannot tell', () => {
		expect(
			clientAddressOf(() => {
				throw new Error('Could not determine clientAddress');
			})
		).toBeUndefined();
	});
});
