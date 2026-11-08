// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/**
 * D24a: what can be checked about a Semantic block's anchor (the first Detail
 * block it `covers`, which gives the zoom block its colour) from the stored
 * output alone, with no model and no golden annotation. Two rules:
 *
 *  - shape: a zoom block that is a statement is anchored on a statement block
 *    and one that is a value on a value block. A "print count" block anchored
 *    on the comparison inside a loop fails it.
 *  - bindings: every Detail value a zoom block's own bindings edit lies inside
 *    its anchor (the anchor and what is nested in its inputs, not what follows
 *    it). A "decrement count by 1" block bound to the 1 of one block and
 *    anchored on a different block fails it.
 *
 * These catch an anchor that is plainly the wrong block. They cannot say an
 * anchor is the right one: a block with no bindings passes the second rule
 * whatever it is anchored on, and a statement anchored on the wrong statement
 * passes the first. Whether the anchor is the block the label describes is the
 * rest of D24 (golden labels or a judge). The rules were written after reading
 * the pictures of `v3`'s first smoke run, so on that run they are fitted, not
 * tested.
 */
import type { ZoomPlan, ZoomResponse } from '@szrs/llm-proxy-contracts';
import { anchorsOf } from '@szrs/llm-proxy-contracts/anchors';

import { allBlocks, byId, type SavedBlock } from '@szrs/llm-proxy/zoom/saved-blocks.js';
import { blockShape } from './headless.js';

type Json = Record<string, unknown>;

export interface AnchorProblem {
	/** The Semantic block, and the Detail block it is anchored on. */
	block: string;
	anchor: string;
	rule: 'shape' | 'bindings';
	message: string;
}

export interface AnchorChecks {
	/** Semantic blocks whose anchor is a Detail block (the others are D23's). */
	checked: number;
	/** Of those, the blocks with bindings, which the second rule can check. */
	withBindings: number;
	/** Blocks that break at least one rule. */
	flagged: number;
	problems: AnchorProblem[];
}

const zoomShape = (def: Json | undefined): 'statement' | 'value' | 'other' =>
	def === undefined
		? 'other'
		: 'output' in def
			? 'value'
			: 'previousStatement' in def || 'nextStatement' in def
				? 'statement'
				: 'other';

/** The anchor and the blocks nested in its inputs, without those that follow it. */
function within(anchor: SavedBlock): Set<string> {
	const alone = { ...anchor, next: undefined };
	return new Set(allBlocks({ blocks: { blocks: [alone] } }).flatMap((b) => (b.id ? [b.id] : [])));
}

export function checkAnchors(
	plan: ZoomPlan | undefined,
	result: ZoomResponse,
	detail: Json,
	detailBlockDefs: Json[] = []
): AnchorChecks {
	const anchors = anchorsOf(plan, 'semantic');
	const detailBlocks = byId(allBlocks(detail));
	const zoomBlocks = byId(allBlocks(result.semantic.workspaceJson as Json));
	const problems: AnchorProblem[] = [];
	let checked = 0;
	let withBindings = 0;
	const flagged = new Set<string>();

	for (const [id, anchorId] of Object.entries(anchors)) {
		const zoom = zoomBlocks.get(id);
		const anchor = detailBlocks.get(anchorId);
		if (!zoom || !anchor) continue;
		checked++;

		const def = result.semantic.blockDefs.find((d) => d.type === zoom.type) as Json | undefined;
		const want = zoomShape(def);
		const got = blockShape(anchor.type, detailBlockDefs);
		if (want !== 'other' && got !== 'other' && want !== got) {
			flagged.add(id);
			problems.push({
				block: id,
				anchor: anchorId,
				rule: 'shape',
				message: `${id} is a ${want} block but its anchor ${anchorId} (${anchor.type}) is a ${got} block`
			});
		}

		const bound = result.semantic.bindings
			.filter((binding) => binding.block === id)
			.flatMap((binding) => binding.detail.map((ref) => ref.block));
		if (bound.length > 0) {
			withBindings++;
			const inside = within(anchor);
			const outside = [...new Set(bound.filter((ref) => !inside.has(ref)))];
			if (outside.length > 0) {
				flagged.add(id);
				problems.push({
					block: id,
					anchor: anchorId,
					rule: 'bindings',
					message: `${id} edits ${outside.join(', ')}, which is not inside its anchor ${anchorId} (${anchor.type})`
				});
			}
		}
	}
	return { checked, withBindings, flagged: flagged.size, problems };
}
