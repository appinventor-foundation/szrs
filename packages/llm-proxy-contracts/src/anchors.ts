// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

// A subpath of its own (`@szrs/llm-proxy-contracts/anchors`) that imports no
// value from the schemas, so the plugin can use it without bundling zod.
import type { ZoomPlan } from './zoom.js';

/** Zoom block id -> id of the Detail block it stands for (its anchor). */
export type ZoomAnchors = Record<string, string>;

/** The levels a plan has anchors for. */
export type AnchoredLevel = 'semantic' | 'concept';

/**
 * The anchors a plan gives for one level: for a concept block, the first Detail
 * stack of its concept (the concept's id is its block's id); for a Semantic
 * block, the first Detail block it covers. A level a plan says nothing about has
 * none. The plugin shows each zoom block in its anchor's colour, and the evals
 * count how many anchors are Detail blocks, so both read the plan through this.
 */
export function anchorsOf(plan: ZoomPlan | undefined, level: AnchoredLevel): ZoomAnchors {
	const anchors: ZoomAnchors = {};
	if (!plan) return anchors;
	if (level === 'concept') {
		for (const concept of plan.concepts) {
			if (concept.id !== undefined && concept.stacks.length > 0)
				anchors[concept.id] = concept.stacks[0];
		}
	} else {
		const covers = plan.covers ?? {};
		for (const id of Object.keys(covers)) {
			if (covers[id].length > 0) anchors[id] = covers[id][0];
		}
	}
	return anchors;
}
