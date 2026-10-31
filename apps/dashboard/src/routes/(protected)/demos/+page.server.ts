// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { fail } from '@sveltejs/kit';
import { demoIdFormSchema, demoInputSchema } from '#lib/schemas/demo.js';
import { getDemoService } from '#lib/server/container.js';
import { mapDomainErrors, parseForm } from '#lib/server/forms.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ demos: await getDemoService().list() });

export const actions: Actions = {
	create: async ({ request }) => {
		const form = parseForm(demoInputSchema, await request.formData());
		if (!form.ok) return fail(400, { errors: form.errors, values: form.values });

		await getDemoService().create(form.data);
		return { created: true };
	},

	delete: async ({ request }) => {
		const form = parseForm(demoIdFormSchema, await request.formData());
		if (!form.ok) return fail(400, { errors: form.errors, values: form.values });

		await mapDomainErrors(() => getDemoService().delete(form.data.id));
		return { deleted: true };
	}
};
