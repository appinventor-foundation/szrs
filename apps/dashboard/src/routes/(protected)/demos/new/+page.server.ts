// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { isAdmin } from '#lib/server/auth/roles.js';
import { getDemoService } from '#lib/server/container.js';
import { parseDemoForm } from '#lib/server/demo-form.js';
import type { Actions } from './$types';

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = parseDemoForm(await request.formData(), isAdmin(locals.user));
		if (!form.ok) return fail(400, { errors: form.errors, values: form.values });

		const demo = await getDemoService().create(form.data.input, form.data.setup);
		redirect(303, resolve('/(protected)/demos/[id]', { id: demo.id }));
	}
};
