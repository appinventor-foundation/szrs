// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { error } from '@sveltejs/kit';
import { z } from 'zod';
import type { FormErrors, FormValues } from '#lib/forms.js';
import { NotFoundError } from '#lib/server/errors.js';

export type ParsedForm<T> =
	{ ok: true; data: T } | { ok: false; errors: FormErrors; values: FormValues };

// Validates submitted form data. On failure it returns what to show next to the
// fields, plus the submitted values so the form can be refilled.
export function parseForm<S extends z.ZodType>(
	schema: S,
	formData: FormData
): ParsedForm<z.output<S>> {
	const raw = Object.fromEntries(formData);
	const result = schema.safeParse(raw);
	if (result.success) return { ok: true, data: result.data };

	const values: FormValues = {};
	for (const [key, value] of Object.entries(raw)) {
		if (typeof value === 'string') values[key] = value;
	}
	return { ok: false, errors: z.flattenError(result.error).fieldErrors, values };
}

// Maps domain errors thrown by services to HTTP errors.
export async function mapDomainErrors<T>(run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (err) {
		if (err instanceof NotFoundError) error(404, err.message);
		throw err;
	}
}
