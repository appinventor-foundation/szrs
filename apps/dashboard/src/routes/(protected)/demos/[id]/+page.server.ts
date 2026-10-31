// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { error, fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { demoIdSchema, demoInputSchema } from '#lib/schemas/demo.js';
import { getDemoService } from '#lib/server/container.js';
import { mapDomainErrors, parseForm } from '#lib/server/forms.js';
import type { Actions, PageServerLoad } from './$types';

function parseId(raw: string): string {
	const id = demoIdSchema.safeParse(raw);
	if (!id.success) error(404, 'Demo not found');
	return id.data;
}

export const load: PageServerLoad = async ({ params }) => ({
	demo: await mapDomainErrors(() => getDemoService().get(parseId(params.id)))
});

export const actions: Actions = {
	update: async ({ params, request }) => {
		const form = parseForm(demoInputSchema, await request.formData());
		if (!form.ok) return fail(400, { errors: form.errors, values: form.values });

		await mapDomainErrors(() => getDemoService().update(parseId(params.id), form.data));
		redirect(303, resolve('/(protected)/demos'));
	}
};
