// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { error } from '@sveltejs/kit';
import { demoIdSchema } from '#lib/schemas/demo.js';

// A malformed id can never match a demo, so it is a 404 like a missing one.
export function parseDemoId(raw: string): string {
	const id = demoIdSchema.safeParse(raw);
	if (!id.success) error(404, 'Demo not found');
	return id.data;
}
