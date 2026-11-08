// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import type { ZoomPlan, ZoomResponse } from '@szrs/llm-proxy-contracts';
import { describe, expect, it } from 'vitest';

import { checkAnchors } from '../../baseline/anchor-check.js';
import { blockShape } from '../../baseline/headless.js';

// Detail: set count to 10 (b1, with the number b2), then repeat while count > 0
// (b3, with the comparison b4 and the number b5), whose DO prints (b6).
const detail = {
	blocks: {
		languageVersion: 0,
		blocks: [
			{
				type: 'variables_set',
				id: 'b1',
				inputs: { VALUE: { block: { type: 'math_number', id: 'b2', fields: { NUM: 10 } } } },
				next: {
					block: {
						type: 'controls_whileUntil',
						id: 'b3',
						inputs: {
							BOOL: {
								block: {
									type: 'logic_compare',
									id: 'b4',
									inputs: { B: { block: { type: 'math_number', id: 'b5', fields: { NUM: 0 } } } }
								}
							},
							DO: { block: { type: 'text_print', id: 'b6' } }
						}
					}
				}
			}
		]
	}
};

type Def = { type: string; [key: string]: unknown };
const statement = (type: string): Def => ({
	type,
	message0: 'x',
	previousStatement: null,
	nextStatement: null
});
const level = (defs: Def[], ids: string[], bindings: [string, string][] = []) => ({
	blockDefs: defs,
	workspaceJson: {
		blocks: { languageVersion: 0, blocks: ids.map((id) => ({ type: defs[0].type, id })) }
	},
	bindings: bindings.map(([block, ref]) => ({
		block,
		field: 'N',
		detail: [{ block: ref, field: 'NUM' }]
	}))
});
const zoom = (semantic: ReturnType<typeof level>): ZoomResponse => ({
	semantic,
	concept: level([statement('zoom_x_c')], ['c1'])
});
const planWith = (covers: Record<string, string[]>): ZoomPlan => ({ concepts: [], covers });

describe('blockShape', () => {
	it('tells statement, value and other blocks apart, and an unknown type is other', () => {
		expect(blockShape('text_print')).toBe('statement');
		expect(blockShape('math_number')).toBe('value');
		// A definition has no connections above or below it, so the shape rule skips it.
		expect(blockShape('procedures_defnoreturn')).toBe('other');
		expect(blockShape('no_such_block')).toBe('other');
	});

	it('knows a custom block set’s types only with its definitions', () => {
		const defs = [{ type: 'host_event', message0: 'when', nextStatement: null }];
		expect(blockShape('host_event')).toBe('other');
		expect(blockShape('host_event', defs)).toBe('statement');
		expect(blockShape('host_event')).toBe('other');
	});
});

describe('checkAnchors (D24a)', () => {
	const ops = (...ids: string[]) => zoom(level([statement('zoom_x_op')], ids, [['s1', 'b2']]));

	it('passes an anchor that is a statement block holding the value the zoom block edits', () => {
		const checks = checkAnchors(planWith({ s1: ['b1', 'b2'] }), ops('s1'), detail);

		expect(checks).toMatchObject({ checked: 1, withBindings: 1, flagged: 0, problems: [] });
	});

	it('flags a statement zoom block anchored on a value block (shape)', () => {
		const checks = checkAnchors(
			planWith({ s1: ['b4'] }),
			zoom(level([statement('zoom_x_op')], ['s1'])),
			detail
		);

		expect(checks.flagged).toBe(1);
		expect(checks.problems).toEqual([
			expect.objectContaining({ block: 's1', anchor: 'b4', rule: 'shape' })
		]);
		expect(checks.problems[0].message).toContain(
			'statement block but its anchor b4 (logic_compare) is a value block'
		);
	});

	it('flags a value zoom block anchored on a statement block (shape)', () => {
		const value = { type: 'zoom_x_val', message0: 'x', output: null };
		const checks = checkAnchors(planWith({ s1: ['b6'] }), zoom(level([value], ['s1'])), detail);

		expect(checks.problems.map((p) => p.rule)).toEqual(['shape']);
	});

	it('flags a value the zoom block edits that is not inside its anchor (bindings)', () => {
		const checks = checkAnchors(planWith({ s1: ['b3', 'b2'] }), ops('s1'), detail);

		expect(checks.problems).toEqual([expect.objectContaining({ rule: 'bindings', anchor: 'b3' })]);
		expect(checks.problems[0].message).toContain('edits b2, which is not inside its anchor b3');
	});

	it('counts what is nested in the anchor’s inputs as inside, and what follows it as outside', () => {
		const bound = (ref: string) => zoom(level([statement('zoom_x_op')], ['s1'], [['s1', ref]]));

		expect(checkAnchors(planWith({ s1: ['b3'] }), bound('b5'), detail).flagged).toBe(0);
		expect(checkAnchors(planWith({ s1: ['b3'] }), bound('b6'), detail).flagged).toBe(0);
		// b3 follows b1, so it is not inside b1.
		expect(checkAnchors(planWith({ s1: ['b1'] }), bound('b5'), detail).flagged).toBe(1);
	});

	it('reports one flagged block once even when it breaks both rules', () => {
		const checks = checkAnchors(planWith({ s1: ['b4'] }), ops('s1'), detail);

		expect(checks.problems.map((p) => p.rule)).toEqual(['shape', 'bindings']);
		expect(checks.flagged).toBe(1);
	});

	it('leaves anchors that are not Detail blocks, and blocks the level lacks, to D23', () => {
		const checks = checkAnchors(planWith({ s1: ['b99'], s7: ['b1'] }), ops('s1'), detail);

		expect(checks).toEqual({ checked: 0, withBindings: 0, flagged: 0, problems: [] });
	});

	it('checks nothing without a plan or without covers', () => {
		expect(checkAnchors(undefined, ops('s1'), detail).checked).toBe(0);
		expect(checkAnchors({ concepts: [] }, ops('s1'), detail).checked).toBe(0);
	});
});
