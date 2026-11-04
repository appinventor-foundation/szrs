// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import type { Demo } from '#lib/schemas/demo.js';
import type { Workspace } from '#lib/schemas/workspace.js';
import { isSampleId, samples } from '#lib/samples/index.js';
import { NotFoundError } from '#lib/server/errors.js';
import type { DemoRepository } from '#lib/server/repositories/demos.js';
import type { WorkspaceRepository } from '#lib/server/repositories/workspaces.js';

// Where the workspace a person opens came from.
export type WorkspaceSource = 'saved' | 'starter' | 'empty';

export interface WorkspaceService {
	// The person's own copy, else the demo's starter, else nothing (an empty workspace).
	load(
		demoId: string,
		userId: string
	): Promise<{ workspace: Workspace | null; source: WorkspaceSource }>;
	save(demoId: string, userId: string, workspace: Workspace): Promise<void>;
	// Drops the person's copy, so the starter shows again.
	reset(demoId: string, userId: string): Promise<void>;
}

// An unknown sample id (a sample removed from the code later) falls back to empty.
function starterOf(demo: Demo): Workspace | null {
	if (demo.starterKind === 'custom') return demo.starterWorkspace;
	if (demo.starterKind === 'sample' && isSampleId(demo.sampleId)) {
		return samples[demo.sampleId].workspace;
	}
	return null;
}

export function createWorkspaceService(
	workspaces: WorkspaceRepository,
	demos: DemoRepository
): WorkspaceService {
	// Only an entry with a demo can be run, opened or saved to.
	async function requireDemo(demoId: string): Promise<Demo> {
		const demo = await demos.find(demoId);
		if (!demo) throw new NotFoundError('Demo', demoId);
		if (demo.demoKind === 'none') throw new NotFoundError('Runnable demo', demoId);
		return demo;
	}

	return {
		async load(demoId, userId) {
			const demo = await requireDemo(demoId);
			const saved = await workspaces.find(demoId, userId);
			if (saved) return { workspace: saved, source: 'saved' };
			const starter = starterOf(demo);
			return starter
				? { workspace: starter, source: 'starter' }
				: { workspace: null, source: 'empty' };
		},

		async save(demoId, userId, workspace) {
			await requireDemo(demoId);
			await workspaces.upsert(demoId, userId, workspace);
		},

		async reset(demoId, userId) {
			await requireDemo(demoId);
			await workspaces.remove(demoId, userId);
		}
	};
}
