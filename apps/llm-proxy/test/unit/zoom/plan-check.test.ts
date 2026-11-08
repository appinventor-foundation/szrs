// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import type { ZoomResponse } from '@szrs/llm-proxy-contracts';
import { describe, expect, it } from 'vitest';

import { checkPlan } from '../../../src/zoom/plan-check.js';
import type { ZoomPlan } from '../../../src/zoom/plan.js';
import { parseZoomResponse } from '../../../src/zoom/zoom.js';

const workspace = (...blocks: unknown[]) => ({ blocks: { languageVersion: 0, blocks } });
const stack = (id?: string) => ({ type: 'text_print', ...(id && { id }) });

/** A zoom whose Concept level has `concepts` top-level blocks. */
function zoom(concepts: number): ZoomResponse {
	const blocks = Array.from({ length: concepts }, (_, i) => ({
		type: 'zoom_x_c',
		id: `c${i + 1}`
	}));
	return {
		semantic: {
			blockDefs: [{ type: 'zoom_x_op', message0: 'do it' }],
			workspaceJson: workspace({ type: 'zoom_x_op', id: 's1' }),
			bindings: []
		},
		concept: {
			blockDefs: [{ type: 'zoom_x_c', message0: 'a concept' }],
			workspaceJson: workspace(...blocks),
			bindings: []
		}
	};
}

const plan = (...concepts: string[][]): ZoomPlan => ({
	concepts: concepts.map((stacks) => ({ stacks, operations: [] }))
});

describe('checkPlan, rule C: covers names blocks that exist', () => {
	// Detail: a repeat (b1) with a number inside it (b2), a print (b3).
	const detail = workspace(
		{ type: 'controls_repeat_ext', id: 'b1', inputs: { TIMES: { block: stack('b2') } } },
		stack('b3')
	);
	const withCovers = (covers: Record<string, string[]>): ZoomPlan => ({
		concepts: [{ stacks: ['b1', 'b3'], operations: ['s1'] }],
		covers
	});

	it('passes covers that name a Semantic block and Detail blocks at any depth', () => {
		expect(checkPlan(withCovers({ s1: ['b2', 'b3'] }), zoom(1), detail)).toEqual([]);
	});

	it('passes a plan with no covers', () => {
		expect(checkPlan(plan(['b1', 'b3']), zoom(1), detail)).toEqual([]);
	});

	it('names a Detail id that does not exist', () => {
		const problems = checkPlan(withCovers({ s1: ['b2', 'b9'] }), zoom(1), detail);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain('not blocks of the Detail workspace: "b9"');
	});

	it('names a key that is not a block of the Semantic level', () => {
		const problems = checkPlan(withCovers({ s7: ['b1'] }), zoom(1), detail);
		expect(problems[0]).toContain('not blocks of the Semantic level: "s7"');
	});

	it('cannot check Detail ids when the program has none', () => {
		expect(checkPlan(withCovers({ s1: ['b9'] }), zoom(1), workspace(stack(), stack()))).toEqual([]);
	});
});

describe('checkPlan, rule A: the plan lists every top-level Detail block once', () => {
	const detail = workspace(stack('b1'), stack('b2'));

	it('passes a plan that lists each block in exactly one concept', () => {
		expect(checkPlan(plan(['b1'], ['b2']), zoom(2), detail)).toEqual([]);
		expect(checkPlan(plan(['b1', 'b2']), zoom(1), detail)).toEqual([]);
	});

	it('names a block that is in no concept', () => {
		const problems = checkPlan(plan(['b1']), zoom(1), detail);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain('not in any concept: "b2"');
		expect(problems[0]).toContain('every top-level Detail block ("b1", "b2")');
	});

	it('names a block that is in two concepts', () => {
		const problems = checkPlan(plan(['b1', 'b2'], ['b2']), zoom(2), detail);
		expect(problems[0]).toContain('in more than one concept: "b2"');
	});

	it('says both when a plan misses one block and repeats another', () => {
		const problems = checkPlan(plan(['b1'], ['b1']), zoom(2), detail);
		expect(problems[0]).toContain('not in any concept: "b2"; in more than one concept: "b1"');
	});

	it('has nothing to check without a plan, as for a prompt that asks for none', () => {
		expect(checkPlan(undefined, zoom(1), detail)).toEqual([]);
	});

	it('has nothing to check when the program’s blocks have no ids', () => {
		expect(checkPlan(plan(['x']), zoom(1), workspace(stack(), stack()))).toEqual([]);
		expect(checkPlan(plan(['b1']), zoom(1), workspace(stack('b1'), stack()))).toEqual([]);
	});

	it('does not mind an id in the plan that is not a top-level Detail block', () => {
		expect(checkPlan(plan(['b1', 'b2', 'b9']), zoom(1), detail)).toEqual([]);
	});
});

describe('checkPlan, rule B: at least one concept block and no more than the stacks', () => {
	it('passes from one block up to the number of stacks', () => {
		const detail = workspace(stack('b1'), stack('b2'), stack('b3'));
		for (const concepts of [1, 2, 3]) {
			expect(checkPlan(undefined, zoom(concepts), detail)).toEqual([]);
		}
	});

	it('flags more concept blocks than stacks, and says exactly one for a single stack', () => {
		const problems = checkPlan(undefined, zoom(4), workspace(stack('b1')));
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain('4 concept blocks for a program with 1 top-level stack.');
		expect(problems[0]).toContain('never one step of a stack');
		expect(problems[0]).toContain('use at most 1, which means exactly one for this program');
	});

	it('says stacks in the plural, without the single-stack sentence, for a bigger program', () => {
		const problems = checkPlan(
			undefined,
			zoom(4),
			workspace(stack('b1'), stack('b2'), stack('b3'))
		);
		expect(problems[0]).toContain('4 concept blocks for a program with 3 top-level stacks');
		expect(problems[0]).toContain('use at most 3');
		expect(problems[0]).not.toContain('exactly one');
	});

	it('flags a Concept level with no blocks', () => {
		const problems = checkPlan(undefined, zoom(0), workspace(stack('b1')));
		expect(problems).toEqual([
			'concept: the Concept level has no blocks. It needs one block per feature or responsibility'
		]);
	});

	it('has nothing to compare against for a program with no stacks', () => {
		expect(checkPlan(undefined, zoom(3), workspace())).toEqual([]);
		expect(checkPlan(undefined, zoom(0), workspace())).toEqual([]);
	});

	it('reports both rules at once', () => {
		const problems = checkPlan(plan(['b1']), zoom(3), workspace(stack('b1'), stack('b2')));
		expect(problems).toHaveLength(2);
		expect(problems[0]).toContain('plan.concepts');
		expect(problems[1]).toContain('concept: 3 concept blocks');
	});
});

describe('parseZoomResponse returns the messages as warnings and does not throw for them', () => {
	const detail = workspace({ type: 'text_print', id: 'b1' });
	const level = (type: string, count: number) => ({
		blockDefs: [{ type, message0: 'do it' }],
		workspaceJson: workspace(
			...Array.from({ length: count }, (_, i) => ({ type, id: `${type}${i}` }))
		),
		bindings: []
	});
	const text = (concepts: number, planStacks: string[][]) =>
		JSON.stringify({
			plan: { concepts: planStacks.map((stacks) => ({ stacks, operations: [] })) },
			semantic: level('zoom_x_op', 1),
			concept: level('zoom_x_concept', concepts)
		});

	it('has no warnings for a zoom that follows the rules', () => {
		const parsed = parseZoomResponse(text(1, [['b1']]), detail, 'v1');
		expect(parsed.warnings).toEqual([]);
		expect(parsed.result.concept.workspaceJson).toBeDefined();
	});

	it('has warnings, and still the zoom, for one that breaks them', () => {
		const parsed = parseZoomResponse(text(3, [['b1'], ['b1']]), detail, 'v1');
		expect(parsed.warnings).toHaveLength(2);
		expect(parsed.result.semantic.blockDefs[0].type).toBe('zoom_x_op');
	});

	it('does not check a plan that was not written, and so only rule B', () => {
		const noPlan = JSON.stringify({
			semantic: level('zoom_x_op', 1),
			concept: level('zoom_x_concept', 2)
		});
		const parsed = parseZoomResponse(noPlan, detail, 'v0');
		expect(parsed.warnings).toHaveLength(1);
		expect(parsed.warnings[0]).toContain('concept: 2 concept blocks');
	});

	it('warns when covers names a Detail block that is not there, and still returns the zoom', () => {
		// The Semantic block of `level` has the id "zoom_x_op0".
		const withCovers = (ids: string[]) =>
			JSON.stringify({
				plan: { concepts: [{ stacks: ['b1'], operations: [] }], covers: { zoom_x_op0: ids } },
				semantic: level('zoom_x_op', 1),
				concept: level('zoom_x_concept', 1)
			});

		expect(parseZoomResponse(withCovers(['b1']), detail, 'v1').warnings).toEqual([]);

		const bad = parseZoomResponse(withCovers(['b1', 'b77']), detail, 'v1');
		expect(bad.warnings).toHaveLength(1);
		expect(bad.warnings[0]).toContain('"b77"');
		expect(bad.result.plan?.covers).toEqual({ zoom_x_op0: ['b1', 'b77'] });
	});
});
