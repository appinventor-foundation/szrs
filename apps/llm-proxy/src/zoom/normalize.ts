import type { ZoomResponse } from '@szrs/llm-proxy-contracts';

import { isRecord } from './saved-blocks.js';

export interface NormalizedWorkspace {
	/** The workspace with canonical ids, and without block positions. */
	workspaceJson: Record<string, unknown>;
	/** Canonical block id -> the id that block has in the caller's workspace. */
	originalIds: Map<string, string>;
}

/**
 * Rewrites a saved workspace so that the same program always looks the same:
 * blocks are numbered b1, b2, … in traversal order, variable ids become v1,
 * v2, …, and positions are dropped. Blockly's random ids and the user's layout
 * would otherwise make every user's copy of a program look different.
 *
 * Only blocks that have an id get a canonical one, so a block can be bound
 * exactly when it could be before. Returns a copy; `workspaceJson` is not
 * changed.
 */
export function normalizeWorkspace(workspaceJson: Record<string, unknown>): NormalizedWorkspace {
	const copy = structuredClone(workspaceJson);
	const originalIds = new Map<string, string>();
	const variableIds = new Map<string, string>();

	if (Array.isArray(copy.variables)) {
		for (const variable of copy.variables) {
			if (!isRecord(variable) || typeof variable.id !== 'string') continue;
			const canonical = `v${variableIds.size + 1}`;
			variableIds.set(variable.id, canonical);
			variable.id = canonical;
		}
	}

	const renameVariables = (fields: unknown): void => {
		if (!isRecord(fields)) return;
		for (const value of Object.values(fields)) {
			if (isRecord(value) && typeof value.id === 'string') {
				value.id = variableIds.get(value.id) ?? value.id;
			}
		}
	};

	let blockCount = 0;
	const visit = (block: unknown): void => {
		if (!isRecord(block) || typeof block.type !== 'string') return;
		if (typeof block.id === 'string') {
			const canonical = `b${++blockCount}`;
			originalIds.set(canonical, block.id);
			block.id = canonical;
		}
		delete block.x;
		delete block.y;
		renameVariables(block.fields);
		if (isRecord(block.inputs)) {
			// Sorted, so the same program gets the same ids however the keys were ordered.
			for (const name of Object.keys(block.inputs).sort()) {
				const input = block.inputs[name];
				if (!isRecord(input)) continue;
				visit(input.block);
				visit(input.shadow);
			}
		}
		if (isRecord(block.next)) visit(block.next.block);
	};

	const top = isRecord(copy.blocks) ? copy.blocks.blocks : undefined;
	if (Array.isArray(top)) top.forEach(visit);

	return { workspaceJson: copy, originalIds };
}

/**
 * Returns `result` with the Detail block ids in its bindings mapped back to
 * the ids in the caller's workspace. Works on a copy, so a result kept for
 * reuse is never changed.
 */
export function restoreIds(result: ZoomResponse, originalIds: Map<string, string>): ZoomResponse {
	const restored = structuredClone(result);
	for (const level of [restored.semantic, restored.concept]) {
		for (const binding of level.bindings) {
			for (const ref of binding.detail) {
				ref.block = originalIds.get(ref.block) ?? ref.block;
			}
		}
	}
	return restored;
}
