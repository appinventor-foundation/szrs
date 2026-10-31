// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { getTableColumns } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { describe, expect, it } from 'vitest';
import { demoInputSchema, demoSchema } from '#lib/schemas/demo.js';
import { demos } from './demos.js';

// The shared Zod schemas are written by hand so the browser never loads the
// database layer. These tests are what stops them drifting from the table.
describe('demo schemas match the demos table', () => {
	it('describes exactly the table columns', () => {
		expect(Object.keys(demoSchema.shape).sort()).toEqual(
			Object.keys(getTableColumns(demos)).sort()
		);
	});

	it('agrees on which columns are nullable', () => {
		for (const [name, column] of Object.entries(getTableColumns(demos))) {
			const field = demoSchema.shape[name as keyof typeof demoSchema.shape];
			expect(field.safeParse(null).success, name).toBe(!column.notNull);
		}
	});

	it('accepts the same rows as the table', () => {
		const row = {
			id: '3f1c2b6e-9a4d-4c52-8f0e-2a7b1d5e6c90',
			title: 'A demo',
			description: null,
			createdAt: new Date(),
			updatedAt: new Date()
		};

		expect(demoSchema.safeParse(row).success).toBe(true);
		expect(createSelectSchema(demos).safeParse(row).success).toBe(true);
	});

	it('produces input the table accepts', () => {
		const inputs = [
			{ title: ' A ' },
			{ title: 'B', description: '  ' },
			{ title: 'C', description: 'text' }
		];

		for (const input of inputs) {
			const parsed = demoInputSchema.parse(input);
			expect(createInsertSchema(demos).safeParse(parsed).success).toBe(true);
		}
	});
});
