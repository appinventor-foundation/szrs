// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import type { ZoomPlan, ZoomPlanConcept as PlanConcept } from '@szrs/llm-proxy-contracts';

import { isRecord } from './saved-blocks.js';

export type { ZoomPlan, ZoomPlanConcept as PlanConcept } from '@szrs/llm-proxy-contracts';

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
	const covers = readCovers(plan.covers);
	return {
		...(typeof plan.purpose === 'string' && { purpose: plan.purpose }),
		concepts,
		...(covers && { covers })
	};
}

/** `covers` as far as it can be read: Semantic block id to a non-empty list of ids. Undefined when nothing is left. */
function readCovers(raw: unknown): Record<string, string[]> | undefined {
	if (!isRecord(raw)) return undefined;
	const entries = Object.entries(raw)
		.map(([id, value]): [string, string[]] => [id, strings(value)])
		.filter(([, ids]) => ids.length > 0);
	return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function strings(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: [];
}
