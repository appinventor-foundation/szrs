// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { and, eq } from 'drizzle-orm';
import { demoWorkspaces } from '#lib/server/db/schema/index.js';
import type { Workspace } from '#lib/schemas/workspace.js';
import type { Database } from '#lib/server/db/client.js';

export interface WorkspaceRepository {
	find(demoId: string, userId: string): Promise<Workspace | undefined>;
	// Overwrites the person's copy: one row per demo and user, no history.
	upsert(demoId: string, userId: string, workspace: Workspace): Promise<void>;
	remove(demoId: string, userId: string): Promise<void>;
}

export function createWorkspaceRepository(db: Database): WorkspaceRepository {
	return {
		async find(demoId, userId) {
			const [row] = await db
				.select({ workspace: demoWorkspaces.workspace })
				.from(demoWorkspaces)
				.where(and(eq(demoWorkspaces.demoId, demoId), eq(demoWorkspaces.userId, userId)));
			return row?.workspace;
		},

		async upsert(demoId, userId, workspace) {
			await db
				.insert(demoWorkspaces)
				.values({ demoId, userId, workspace })
				.onConflictDoUpdate({
					target: [demoWorkspaces.demoId, demoWorkspaces.userId],
					set: { workspace, updatedAt: new Date() }
				});
		},

		async remove(demoId, userId) {
			await db
				.delete(demoWorkspaces)
				.where(and(eq(demoWorkspaces.demoId, demoId), eq(demoWorkspaces.userId, userId)));
		}
	};
}
