// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import type { Demo, DemoInput, DemoSetup, Starter } from '#lib/schemas/demo.js';
import type { DemoRepository } from '#lib/server/repositories/demos.js';

// An in-memory stand-in for the Drizzle-backed repository, for unit tests.
export function fakeDemoRepository(): DemoRepository {
	const rows = new Map<string, Demo>();
	let next = 0;

	const starterFields = (starter?: Starter) => {
		if (starter?.kind === 'sample') {
			return { starterKind: 'sample', sampleId: starter.sampleId, starterWorkspace: null } as const;
		}
		if (starter?.kind === 'custom') {
			return {
				starterKind: 'custom',
				sampleId: null,
				starterWorkspace: starter.workspace
			} as const;
		}
		return { starterKind: 'empty', sampleId: null, starterWorkspace: null } as const;
	};

	const toDemo = (id: string, input: DemoInput, setup?: DemoSetup, before?: Demo): Demo => ({
		demoKind: 'none',
		iframeUrl: null,
		...(before ?? starterFields()),
		...(setup ? { demoKind: setup.demoKind } : {}),
		...(setup?.starter ? starterFields(setup.starter) : {}),
		...(setup?.iframeUrl !== undefined ? { iframeUrl: setup.iframeUrl } : {}),
		id,
		title: input.title,
		description: input.description ?? null,
		createdAt: before?.createdAt ?? new Date(2026, 0, 1, 0, 0, next),
		updatedAt: new Date(2026, 0, 1, 0, 0, next)
	});

	return {
		list: async () => [...rows.values()].reverse(),
		find: async (id) => rows.get(id),
		insert: async (input, setup) => {
			const id = `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`;
			const row = toDemo(id, input, setup);
			rows.set(id, row);
			return row;
		},
		update: async (id, input, setup) => {
			const before = rows.get(id);
			if (!before) return undefined;
			const row = toDemo(id, input, setup, before);
			rows.set(id, row);
			return row;
		},
		setStarter: async (id, starter) => {
			const before = rows.get(id);
			if (!before) return undefined;
			const row = { ...before, ...starterFields(starter) };
			rows.set(id, row);
			return row;
		},
		remove: async (id) => rows.delete(id)
	};
}
