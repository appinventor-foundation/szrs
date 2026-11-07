// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/**
 * Blockly without a browser (`new Blockly.Workspace()`), for the two things the
 * baseline needs a Blockly runtime for: saving a corpus program the way the
 * plugin does (so it has block ids, as the proxy expects), and checking that a
 * zoomed level loads (metric D5, as `ZoomLevelLoader.load` does it). Layout and
 * rendering need a browser and are not covered here (D25).
 */
import * as Blockly from 'blockly';

type Json = Record<string, unknown>;

/** Registers block definitions for the duration of `run`, then removes them again. */
function withDefinitions<T>(defs: Json[], run: () => T): T {
	const types = defs.flatMap((def) => (typeof def.type === 'string' ? [def.type] : []));
	const before = new Map(types.map((type) => [type, Blockly.Blocks[type]]));
	try {
		Blockly.common.defineBlocksWithJsonArray(defs as never);
		return run();
	} finally {
		for (const [type, previous] of before) {
			if (previous === undefined) delete Blockly.Blocks[type];
			else Blockly.Blocks[type] = previous;
		}
	}
}

/**
 * A program as the plugin sends it: loaded into a workspace and saved again, so
 * every block has the id Blockly gave it and every variable its own.
 */
export function saveAsBlockly(workspaceJson: Json, blockDefs: Json[] = []): Json {
	return withDefinitions(blockDefs, () => {
		const workspace = new Blockly.Workspace();
		try {
			Blockly.serialization.workspaces.load(workspaceJson, workspace);
			return Blockly.serialization.workspaces.save(workspace) as Json;
		} finally {
			workspace.dispose();
		}
	});
}

export interface LoadResult {
	ok: boolean;
	/** Blockly's complaint, when it could not load. */
	error?: string;
	/** Blocks that ended up in the workspace. */
	blocks?: number;
}

/** Whether a level's definitions register and its workspace loads (D5). */
export function loadsInBlockly(level: { blockDefs: Json[]; workspaceJson: Json }): LoadResult {
	try {
		return withDefinitions(level.blockDefs, () => {
			const workspace = new Blockly.Workspace();
			try {
				Blockly.serialization.workspaces.load(level.workspaceJson, workspace, {
					recordUndo: false
				});
				return { ok: true, blocks: workspace.getAllBlocks(false).length };
			} finally {
				workspace.dispose();
			}
		});
	} catch (error) {
		return {
			ok: false,
			error: String(error instanceof Error ? error.message : error).slice(0, 300)
		};
	}
}
