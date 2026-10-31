// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { error } from '@sveltejs/kit';
import { z } from 'zod';
import type { FormErrors, FormValues } from '#lib/forms.js';
import { InvalidCredentialsError, NotFoundError, RuleViolationError } from '#lib/server/errors.js';

export type ParsedForm<T> =
	{ ok: true; data: T } | { ok: false; errors: FormErrors; values: FormValues };

// Validates submitted form data. On failure it returns what to show next to the
// fields, plus the submitted values so the form can be refilled. Fields named in
// `omitValues` (passwords) are never sent back.
export function parseForm<S extends z.ZodType>(
	schema: S,
	formData: FormData,
	omitValues: string[] = []
): ParsedForm<z.output<S>> {
	const raw = Object.fromEntries(formData);
	const result = schema.safeParse(raw);
	if (result.success) return { ok: true, data: result.data };

	const values: FormValues = {};
	for (const [key, value] of Object.entries(raw)) {
		if (typeof value === 'string' && !omitValues.includes(key)) values[key] = value;
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

export type Attempt<T> = { ok: true; data: T } | { ok: false; message: string };

// Runs an action that may be refused by a business rule. The refusal comes back
// as a message to show; anything else is a real error and still throws.
export async function attempt<T>(run: () => Promise<T>): Promise<Attempt<T>> {
	try {
		return { ok: true, data: await run() };
	} catch (err) {
		if (err instanceof RuleViolationError || err instanceof InvalidCredentialsError) {
			return { ok: false, message: err.message };
		}
		throw err;
	}
}

// A message about the form as a whole (not one field), in the shape the form
// components read.
export function formError(message: string): FormErrors {
	return { form: [message] };
}
