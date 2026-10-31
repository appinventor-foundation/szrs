// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { fail, redirect } from '@sveltejs/kit';
import { signInSchema } from '#lib/schemas/auth.js';
import { safeRedirectPath } from '#lib/server/auth/redirect.js';
import { getAuthService } from '#lib/server/container.js';
import { attempt, formError, parseForm } from '#lib/server/forms.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const redirectTo = safeRedirectPath(url.searchParams.get('redirectTo'));
	if (locals.user) redirect(303, redirectTo);
	return { redirectTo };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const form = parseForm(signInSchema, await request.formData(), ['password']);
		if (!form.ok) return fail(400, { errors: form.errors, values: form.values });

		const { email, password, redirectTo } = form.data;
		const result = await attempt(() => getAuthService().signIn(email, password, request.headers));
		if (!result.ok) {
			return fail(400, {
				errors: formError(result.message),
				values: { email, redirectTo: redirectTo ?? '' }
			});
		}
		redirect(303, safeRedirectPath(redirectTo));
	}
};
