// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { z } from 'zod';
import { SAMPLE_IDS } from '#lib/samples/index.js';
import { workspaceSchema } from './workspace.js';

// Plain Zod, safe for the browser: nothing here imports the database layer.
// server/db/schema/demos.test.ts checks these stay in step with the table.
export const DEMO_TITLE_MAX = 120;
export const DEMO_DESCRIPTION_MAX = 2000;
export const STARTER_KINDS = ['empty', 'sample', 'custom'] as const;
export const DEMO_KINDS = ['none', 'plugin', 'iframe'] as const;
export const IFRAME_URL_MAX = 2048;

// How each demo reads on a page.
export const DEMO_LABELS: Record<(typeof DEMO_KINDS)[number], string> = {
	none: 'No demo',
	plugin: 'Plugin demo',
	iframe: 'Embedded page'
};

export const demoSchema = z.object({
	id: z.uuid(),
	title: z.string(),
	description: z.string().nullable(),
	demoKind: z.enum(DEMO_KINDS),
	starterKind: z.enum(STARTER_KINDS),
	sampleId: z.string().nullable(),
	starterWorkspace: workspaceSchema.nullable(),
	iframeUrl: z.string().nullable(),
	createdAt: z.date(),
	updatedAt: z.date()
});

// A blank description is stored as null, so the form and the API agree.
export const demoInputSchema = z.object({
	title: z.string().trim().min(1, 'Title is required').max(DEMO_TITLE_MAX, 'Title is too long'),
	description: z
		.string()
		.trim()
		.max(DEMO_DESCRIPTION_MAX)
		.transform((value) => (value === '' ? null : value))
		.nullish()
});

// Where a demo's workspace starts. Only admins set it.
export const starterSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('empty') }),
	z.object({ kind: z.literal('sample'), sampleId: z.enum(SAMPLE_IDS) }),
	z.object({ kind: z.literal('custom'), workspace: workspaceSchema })
]);

// What the admin's demo form can ask for. 'custom' means "keep the program
// saved from the runner": that program cannot be typed into a form, so the
// form never carries it.
export const starterChoiceSchema = z.discriminatedUnion('starterKind', [
	z.object({ starterKind: z.literal('empty') }),
	z.object({ starterKind: z.literal('sample'), sampleId: z.enum(SAMPLE_IDS, 'Pick a sample') }),
	z.object({ starterKind: z.literal('custom') })
]);

// What the admin's demo form says about the entry's demo: which one it runs.
// The starting program only matters for the plugin demo.
export const demoChoiceSchema = z.object({ demoKind: z.enum(DEMO_KINDS) });

// The address an 'iframe' demo embeds: http or https only, so a page can never be
// a javascript: or data: URL.
export const iframeUrlSchema = z
	.string()
	.trim()
	.min(1, 'Enter the address of the page to embed')
	.max(IFRAME_URL_MAX, 'The address is too long')
	.pipe(z.url({ protocol: /^https?$/, error: 'Enter a full address starting with https://' }));

export const iframeChoiceSchema = z.object({ iframeUrl: iframeUrlSchema });

export const demoIdSchema = z.uuid();

// What pages get: a demo without its saved starter program, which can be large
// and which only the runner needs.
export type DemoView = Omit<Demo, 'starterWorkspace'>;

export function demoView(demo: Demo): DemoView {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropped on purpose
	const { starterWorkspace, ...view } = demo;
	return view;
}

export type Demo = z.infer<typeof demoSchema>;
export type DemoInput = z.infer<typeof demoInputSchema>;
export type DemoKind = (typeof DEMO_KINDS)[number];
export type Starter = z.infer<typeof starterSchema>;
// What an admin sets on an entry: its demo, where the plugin demo starts, or the
// page an iframe demo embeds.
export type DemoSetup = { demoKind: DemoKind; starter?: Starter; iframeUrl?: string };
export type StarterChoice = z.infer<typeof starterChoiceSchema>;
