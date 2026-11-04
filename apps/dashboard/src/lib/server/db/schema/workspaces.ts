// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { demos } from './demos';

// Each person's own saved workspace for a demo. Saving overwrites it: one row
// per (demo, user), no history.
export const demoWorkspaces = pgTable(
	'demo_workspaces',
	{
		demoId: uuid('demo_id')
			.notNull()
			.references(() => demos.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		workspace: jsonb('workspace').$type<Record<string, unknown>>().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(table) => [primaryKey({ columns: [table.demoId, table.userId] })]
);
