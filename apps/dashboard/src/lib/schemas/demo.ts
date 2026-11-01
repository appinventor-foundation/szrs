// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { z } from 'zod';

// Plain Zod, safe for the browser: nothing here imports the database layer.
// server/db/schema/demos.test.ts checks these stay in step with the table.
export const DEMO_TITLE_MAX = 120;
export const DEMO_DESCRIPTION_MAX = 2000;

export const demoSchema = z.object({
	id: z.uuid(),
	title: z.string(),
	description: z.string().nullable(),
	createdAt: z.date(),
	updatedAt: z.date()
});

// A blank description is stored as null, so the form and the API agree.
export const demoInputSchema = z.object({
	title: z.string().trim().min(1, 'Title is required').max(DEMO_TITLE_MAX, 'Title is too long'),
	description: z
		.string()
		.trim()
		.max(DEMO_DESCRIPTION_MAX)
		.transform((value) => (value === '' ? null : value))
		.nullish()
});

export const demoIdSchema = z.uuid();

export type Demo = z.infer<typeof demoSchema>;
export type DemoInput = z.infer<typeof demoInputSchema>;
