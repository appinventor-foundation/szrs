// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { demoView } from '#lib/schemas/demo.js';
import { isAdmin } from '#lib/server/auth/roles.js';
import { getDemoService } from '#lib/server/container.js';
import { parseDemoForm } from '#lib/server/demo-form.js';
import { parseDemoId } from '#lib/server/demo-params.js';
import { mapDomainErrors } from '#lib/server/forms.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => ({
	demo: demoView(await mapDomainErrors(() => getDemoService().get(parseDemoId(params.id))))
});

export const actions: Actions = {
	update: async ({ params, request, locals }) => {
		const form = parseDemoForm(await request.formData(), isAdmin(locals.user));
		if (!form.ok) return fail(400, { errors: form.errors, values: form.values });

		await mapDomainErrors(() =>
			getDemoService().update(parseDemoId(params.id), form.data.input, form.data.setup)
		);
		redirect(303, resolve('/(protected)/demos/[id]', { id: params.id }));
	}
};
