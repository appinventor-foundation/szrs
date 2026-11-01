// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { demoInputSchema } from '#lib/schemas/demo.js';
import { getDemoService } from '#lib/server/container.js';
import { parseForm } from '#lib/server/forms.js';
import type { Actions } from './$types';

export const actions: Actions = {
	create: async ({ request }) => {
		const form = parseForm(demoInputSchema, await request.formData());
		if (!form.ok) return fail(400, { errors: form.errors, values: form.values });

		const demo = await getDemoService().create(form.data);
		redirect(303, resolve('/(protected)/demos/[id]', { id: demo.id }));
	}
};
