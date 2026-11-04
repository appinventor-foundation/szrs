// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { sql } from 'drizzle-orm';
import { check, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Where a demo's workspace starts for someone who has not saved their own:
// empty, one of the bundled samples (by id) or a program an admin saved from
// the runner. schemas/demo.ts mirrors this list (this file cannot import it:
// drizzle-kit reads the schema without alias support); demos.test.ts checks.
export const STARTER_KINDS = ['empty', 'sample', 'custom'] as const;

// Which bundled demo an entry runs: none, or the plugin demo (the semantic-zoom
// plugin's playground). A new bundled demo is a new value here and in
// schemas/demo.ts.
export const DEMO_KINDS = ['none', 'plugin'] as const;

export const demos = pgTable(
	'demos',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		title: text('title').notNull(),
		description: text('description'),
		demoKind: text('demo_kind', { enum: DEMO_KINDS }).notNull().default('none'),
		starterKind: text('starter_kind', { enum: STARTER_KINDS }).notNull().default('empty'),
		sampleId: text('sample_id'),
		starterWorkspace: jsonb('starter_workspace').$type<Record<string, unknown>>(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(table) => [
		// The starter columns must agree with the kind.
		check(
			'demos_starter_matches_kind',
			sql`(${table.starterKind} = 'sample') = (${table.sampleId} IS NOT NULL) AND (${table.starterKind} = 'custom') = (${table.starterWorkspace} IS NOT NULL)`
		)
	]
);
