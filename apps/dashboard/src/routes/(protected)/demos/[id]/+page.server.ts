// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { getDemoService } from '#lib/server/container.js';
import { parseDemoId } from '#lib/server/demo-params.js';
import { mapDomainErrors } from '#lib/server/forms.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => ({
	demo: await mapDomainErrors(() => getDemoService().get(parseDemoId(params.id)))
});

export const actions: Actions = {
	delete: async ({ params }) => {
		await mapDomainErrors(() => getDemoService().delete(parseDemoId(params.id)));
		// The list shows a confirmation for this flag.
		redirect(303, `${resolve('/(protected)/demos')}?deleted=1`);
	}
};
