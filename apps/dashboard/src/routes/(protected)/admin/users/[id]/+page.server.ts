// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { z } from 'zod';
import {
	banFormSchema,
	setPasswordFormSchema,
	setRoleFormSchema,
	userIdSchema
} from '#lib/schemas/user.js';
import { getUserService } from '#lib/server/container.js';
import { attempt, formError, mapDomainErrors, parseForm } from '#lib/server/forms.js';
import type { UserService } from '#lib/server/services/users.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const id = userIdSchema.parse(event.params.id);
	const user = await mapDomainErrors(() => getUserService(event).get(id));
	return { user, isSelf: event.locals.user?.id === id };
};

// Each form on the page posts to its own action. Validation problems and rule
// violations come back tagged with the action name so only that form shows them.
async function run<S extends z.ZodType>(
	event: RequestEvent<{ id: string }>,
	name: string,
	schema: S,
	act: (service: UserService, id: string, data: z.output<S>) => Promise<unknown>,
	omitValues: string[] = []
) {
	const form = parseForm(schema, await event.request.formData(), omitValues);
	if (!form.ok) return fail(400, { action: name, errors: form.errors, values: form.values });

	const id = userIdSchema.parse(event.params.id);
	const result = await attempt(() =>
		mapDomainErrors(() => act(getUserService(event), id, form.data))
	);
	if (!result.ok) return fail(400, { action: name, errors: formError(result.message), values: {} });
	return { action: name, success: true };
}

// Forms that only post a button press, with nothing to validate.
const noFields = z.object({});

export const actions: Actions = {
	setRole: (event) =>
		run(event, 'setRole', setRoleFormSchema, (service, id, data) =>
			service.changeRole(id, data.role)
		),

	setPassword: (event) =>
		run(
			event,
			'setPassword',
			setPasswordFormSchema,
			(service, id, data) => service.setPassword(id, data.password),
			['password']
		),

	ban: (event) =>
		run(event, 'ban', banFormSchema, (service, id, data) => service.ban(id, data.reason)),

	unban: (event) => run(event, 'unban', noFields, (service, id) => service.unban(id)),

	revokeSessions: (event) =>
		run(event, 'revokeSessions', noFields, (service, id) => service.revokeSessions(id)),

	remove: async (event) => {
		const outcome = await run(event, 'remove', noFields, (service, id) => service.remove(id));
		if ('success' in outcome) redirect(303, resolve('/(protected)/admin/users'));
		return outcome;
	}
};
