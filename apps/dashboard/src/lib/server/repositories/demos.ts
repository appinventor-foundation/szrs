// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { desc, eq } from 'drizzle-orm';
import { demos } from '#lib/server/db/schema/index.js';
import type { Demo, DemoInput, DemoSetup, Starter } from '#lib/schemas/demo.js';
import type { Database } from '#lib/server/db/client.js';

export interface DemoRepository {
	list(): Promise<Demo[]>;
	find(id: string): Promise<Demo | undefined>;
	insert(input: DemoInput, setup?: DemoSetup): Promise<Demo>;
	// Leaves the demo and its starter alone unless a setup is given, and the
	// starter alone unless the setup has one.
	update(id: string, input: DemoInput, setup?: DemoSetup): Promise<Demo | undefined>;
	setStarter(id: string, starter: Starter): Promise<Demo | undefined>;
	remove(id: string): Promise<boolean>;
}

// The columns that hold a starter, all set together so they agree with the kind
// (the table has a check constraint for that).
function starterColumns(starter: Starter) {
	switch (starter.kind) {
		case 'empty':
			return { starterKind: 'empty', sampleId: null, starterWorkspace: null } as const;
		case 'sample':
			return { starterKind: 'sample', sampleId: starter.sampleId, starterWorkspace: null } as const;
		case 'custom':
			return {
				starterKind: 'custom',
				sampleId: null,
				starterWorkspace: starter.workspace
			} as const;
	}
}

function setupColumns(setup: DemoSetup | undefined) {
	if (!setup) return {};
	return {
		demoKind: setup.demoKind,
		...(setup.starter && starterColumns(setup.starter)),
		...(setup.iframeUrl !== undefined && { iframeUrl: setup.iframeUrl })
	};
}

export function createDemoRepository(db: Database): DemoRepository {
	return {
		list: () => db.select().from(demos).orderBy(desc(demos.createdAt)),

		async find(id) {
			const [row] = await db.select().from(demos).where(eq(demos.id, id));
			return row;
		},

		async insert(input, setup) {
			const values = { ...input, ...setupColumns(setup) };
			const [row] = await db.insert(demos).values(values).returning();
			return row;
		},

		async update(id, input, setup) {
			const values = { ...input, ...setupColumns(setup) };
			const [row] = await db.update(demos).set(values).where(eq(demos.id, id)).returning();
			return row;
		},

		async setStarter(id, starter) {
			const [row] = await db
				.update(demos)
				.set(starterColumns(starter))
				.where(eq(demos.id, id))
				.returning();
			return row;
		},

		async remove(id) {
			const rows = await db.delete(demos).where(eq(demos.id, id)).returning({ id: demos.id });
			return rows.length > 0;
		}
	};
}
