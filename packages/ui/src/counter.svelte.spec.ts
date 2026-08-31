// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';
import { newCounter } from './counter.svelte';

describe('counter store', () => {
	const counter = newCounter();

	it('starts with 0', () => {
		expect(counter.count).toBe(0);
	});
});
