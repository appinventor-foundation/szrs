// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { desc, eq } from 'drizzle-orm';
import { demos } from '#lib/server/db/schema/index.js';
import type { Demo, DemoInput } from '#lib/schemas/demo.js';
import type { Database } from '#lib/server/db/client.js';

export interface DemoRepository {
	list(): Promise<Demo[]>;
	find(id: string): Promise<Demo | undefined>;
	insert(input: DemoInput): Promise<Demo>;
	update(id: string, input: DemoInput): Promise<Demo | undefined>;
	remove(id: string): Promise<boolean>;
}

export function createDemoRepository(db: Database): DemoRepository {
	return {
		list: () => db.select().from(demos).orderBy(desc(demos.createdAt)),

		async find(id) {
			const [row] = await db.select().from(demos).where(eq(demos.id, id));
			return row;
		},

		async insert(input) {
			const [row] = await db.insert(demos).values(input).returning();
			return row;
		},

		async update(id, input) {
			const [row] = await db.update(demos).set(input).where(eq(demos.id, id)).returning();
			return row;
		},

		async remove(id) {
			const rows = await db.delete(demos).where(eq(demos.id, id)).returning({ id: demos.id });
			return rows.length > 0;
		}
	};
}
