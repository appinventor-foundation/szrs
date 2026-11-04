// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import {
	demoChoiceSchema,
	demoInputSchema,
	starterChoiceSchema,
	type DemoInput,
	type DemoSetup,
	type Starter,
	type StarterChoice
} from '#lib/schemas/demo.js';
import { parseForm, type ParsedForm } from '#lib/server/forms.js';

export type DemoFormData = {
	input: DemoInput;
	// Undefined means "leave the entry's demo and starting program as they are".
	setup?: DemoSetup;
};

// 'custom' is the program an admin saved from the runner, which a form cannot
// carry, so choosing it keeps what is there.
function toStarter(choice: StarterChoice): Starter | undefined {
	if (choice.starterKind === 'empty') return { kind: 'empty' };
	if (choice.starterKind === 'sample') return { kind: 'sample', sampleId: choice.sampleId };
	return undefined;
}

// Everyone can edit an entry's title and description; only admins can change its
// demo and starting program, so anyone else's demo fields are ignored.
export function parseDemoForm(formData: FormData, admin: boolean): ParsedForm<DemoFormData> {
	if (!admin) {
		const form = parseForm(demoInputSchema, formData);
		return form.ok ? { ok: true, data: { input: form.data } } : form;
	}

	const form = parseForm(demoInputSchema.and(demoChoiceSchema), formData);
	if (!form.ok) return form;
	const { title, description, demoKind } = form.data;
	const input = { title, description };

	// Without a demo the starting program means nothing: keep whatever is stored,
	// so switching the demo off and on again loses nothing.
	if (demoKind === 'none') return { ok: true, data: { input, setup: { demoKind } } };

	const starter = parseForm(starterChoiceSchema, formData);
	if (!starter.ok) return starter;
	return {
		ok: true,
		data: { input, setup: { demoKind, starter: toStarter(starter.data) } }
	};
}
