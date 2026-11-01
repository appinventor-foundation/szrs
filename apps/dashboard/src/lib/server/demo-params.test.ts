// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';
import { parseDemoId } from './demo-params.js';

function statusOf(fn: () => unknown): number | undefined {
	try {
		fn();
	} catch (thrown) {
		return (thrown as { status?: number }).status;
	}
}

describe('parseDemoId', () => {
	it('returns a valid uuid unchanged', () => {
		const id = '3f1c2b6e-9a4d-4c52-8f0e-2a7b1d5e6c90';

		expect(parseDemoId(id)).toBe(id);
	});

	it.each(['not-a-uuid', '', '123', '3f1c2b6e-9a4d-4c52-8f0e-2a7b1d5e6c9'])(
		'answers 404 for %j',
		(raw) => {
			expect(statusOf(() => parseDemoId(raw))).toBe(404);
		}
	);
});
