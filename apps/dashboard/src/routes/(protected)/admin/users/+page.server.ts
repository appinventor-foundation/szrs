// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { fail } from '@sveltejs/kit';
import { createUserInputSchema } from '#lib/schemas/user.js';
import { getUserService } from '#lib/server/container.js';
import { attempt, formError, parseForm } from '#lib/server/forms.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
	users: await getUserService(event).list()
});

export const actions: Actions = {
	create: async (event) => {
		const form = parseForm(createUserInputSchema, await event.request.formData(), ['password']);
		if (!form.ok) return fail(400, { errors: form.errors, values: form.values });

		const { name, email, role } = form.data;
		const result = await attempt(() => getUserService(event).create(form.data));
		if (!result.ok) {
			return fail(400, { errors: formError(result.message), values: { name, email, role } });
		}
		return { created: true };
	}
};
