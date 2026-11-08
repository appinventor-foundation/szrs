// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import type { ZoomResponse } from '@szrs/llm-proxy-contracts';

import type { ZoomPlan } from './plan.js';
import { isRecord } from './saved-blocks.js';

/**
 * What a valid zoom can still get wrong that the prompts state as rules. These
 * are not errors: the zoom is valid and can be shown. They are reasons to ask
 * the model once more, and the zoom is kept as the answer if asking does not
 * help (see the retry loops in routes/zoom.ts). Returns one message for the
 * model per rule that failed, none when all hold.
 *
 *  - A. The plan lists every top-level Detail block in exactly one concept. A
 *    plan with no ids to check against (the program's blocks have none), or no
 *    plan at all (v0 asks for none), passes.
 *  - B. The Concept level has at least one block and no more than the program
 *    has top-level stacks. A concept is a feature or responsibility; a stack is
 *    never split into several, so more concepts than stacks means a stack was
 *    split, usually into its own steps.
 *
 * Chosen from the baseline (plan v3, section 7, step 5): on the stored runs `v1`
 * trips neither on any valid zoom, and `v2` trips one of them on 9 of 182, all
 * from the two weakest models.
 */
export function checkPlan(
	plan: ZoomPlan | undefined,
	result: ZoomResponse,
	detailWorkspace: Record<string, unknown>
): string[] {
	const problems: string[] = [];
	const detailTop = topLevel(detailWorkspace);

	const ids = detailTop.flatMap((block) => (typeof block.id === 'string' ? [block.id] : []));
	if (plan && ids.length > 0 && ids.length === detailTop.length) {
		const counts = ids.map(
			(id) => plan.concepts.filter((concept) => concept.stacks.includes(id)).length
		);
		const missing = ids.filter((_, i) => counts[i] === 0);
		const repeated = ids.filter((_, i) => counts[i] > 1);
		if (missing.length > 0 || repeated.length > 0) {
			const said = [
				missing.length > 0 && `not in any concept: ${list(missing)}`,
				repeated.length > 0 && `in more than one concept: ${list(repeated)}`
			].filter(Boolean);
			problems.push(
				`plan.concepts: every top-level Detail block (${list(ids)}) belongs to exactly one concept's "stacks", but ${said.join('; ')}. List each id in one concept`
			);
		}
	}

	const stacks = detailTop.length;
	const concepts = topLevel(result.concept.workspaceJson).length;
	if (stacks > 0) {
		if (concepts === 0) {
			problems.push(
				'concept: the Concept level has no blocks. It needs one block per feature or responsibility'
			);
		} else if (concepts > stacks) {
			problems.push(
				`concept: ${concepts} concept blocks for a program with ${stacks} top-level stack${stacks === 1 ? '' : 's'}. A concept is a feature or responsibility, never one step of a stack, and a stack is never split into several concepts: use at most ${stacks}${stacks === 1 ? ', which means exactly one for this program' : ''}`
			);
		}
	}
	return problems;
}

const list = (ids: string[]): string => ids.map((id) => `"${id}"`).join(', ');

function topLevel(workspaceJson: Record<string, unknown>): Record<string, unknown>[] {
	const blocks = isRecord(workspaceJson.blocks) ? workspaceJson.blocks.blocks : undefined;
	return (Array.isArray(blocks) ? blocks : []).filter(
		(block): block is Record<string, unknown> => isRecord(block) && typeof block.type === 'string'
	);
}
