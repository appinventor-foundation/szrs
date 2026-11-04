// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { error, fail } from '@sveltejs/kit';
import { ZOOM_DEFAULT_MODEL } from '$app/env/private';
import { workspaceFormSchema } from '#lib/schemas/workspace.js';
import { isAdmin } from '#lib/server/auth/roles.js';
import { getDemoService, getWorkspaceService } from '#lib/server/container.js';
import { parseDemoId } from '#lib/server/demo-params.js';
import { mapDomainErrors, parseForm } from '#lib/server/forms.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) error(401, 'Sign in required');
	const id = parseDemoId(params.id);
	const demo = await mapDomainErrors(() => getDemoService().get(id));
	if (demo.demoKind === 'iframe' && demo.iframeUrl) {
		return {
			kind: 'iframe' as const,
			demo: { id: demo.id, title: demo.title },
			url: demo.iframeUrl
		};
	}
	// An entry without a demo cannot be run: a 404, like a missing one.
	const { workspace, source } = await mapDomainErrors(() =>
		getWorkspaceService().load(id, locals.user!.id)
	);

	return {
		kind: 'plugin' as const,
		demo: { id: demo.id, title: demo.title },
		workspace,
		source,
		canSetStarter: isAdmin(locals.user),
		model: ZOOM_DEFAULT_MODEL
	};
};

export const actions: Actions = {
	// Saves the signed-in person's own copy, overwriting their last one.
	save: async ({ params, request, locals }) => {
		if (!locals.user) error(401, 'Sign in required');
		const form = parseForm(workspaceFormSchema, await request.formData());
		if (!form.ok) return fail(400, { message: 'The workspace could not be saved.' });

		await mapDomainErrors(() =>
			getWorkspaceService().save(parseDemoId(params.id), locals.user!.id, form.data.workspace)
		);
		return { done: 'saved' as const };
	},

	// Drops the person's copy, so the demo's starting program shows again.
	reset: async ({ params, locals }) => {
		if (!locals.user) error(401, 'Sign in required');
		await mapDomainErrors(() =>
			getWorkspaceService().reset(parseDemoId(params.id), locals.user!.id)
		);
		return { done: 'reset' as const };
	},

	// Admins only: what the workspace is now becomes the demo's starting program.
	saveStarter: async ({ params, request, locals }) => {
		if (!isAdmin(locals.user)) error(403, 'Only admins can set the starting program');
		const form = parseForm(workspaceFormSchema, await request.formData());
		if (!form.ok) return fail(400, { message: 'The workspace could not be saved.' });

		await mapDomainErrors(() =>
			getDemoService().setStarter(parseDemoId(params.id), {
				kind: 'custom',
				workspace: form.data.workspace
			})
		);
		return { done: 'starter' as const };
	}
};
