// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { isRecord } from './saved-blocks.js';

/** One feature or responsibility in the model's plan. */
export interface PlanConcept {
	id?: string;
	name?: string;
	/** Ids of the top-level Detail blocks the concept covers. */
	stacks: string[];
	/** Ids of the Semantic blocks that describe it. */
	operations: string[];
}

export interface ZoomPlan {
	purpose?: string;
	concepts: PlanConcept[];
}

/**
 * The model's `plan`, as far as it can be read. Never throws and never fails a
 * response: the plan is logged and scored but not enforced, so a missing or
 * malformed one is just `undefined`, and bad parts of a good one are dropped.
 */
export function readPlan(raw: unknown): ZoomPlan | undefined {
	if (!isRecord(raw) || !isRecord(raw.plan)) return undefined;
	const { plan } = raw;
	const concepts = Array.isArray(plan.concepts)
		? plan.concepts.filter(isRecord).map((concept): PlanConcept => ({
				...(typeof concept.id === 'string' && { id: concept.id }),
				...(typeof concept.name === 'string' && { name: concept.name }),
				stacks: strings(concept.stacks),
				operations: strings(concept.operations)
			}))
		: [];
	return { ...(typeof plan.purpose === 'string' && { purpose: plan.purpose }), concepts };
}

function strings(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: [];
}
