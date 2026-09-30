import { describe, expect, it } from 'vitest';

import { repairZoomResult } from '../../../src/zoom/repair.js';
import { parseZoomResponse } from '../../../src/zoom/zoom.js';

const workspace = (...blocks: unknown[]) => ({ blocks: { languageVersion: 0, blocks } });

// Detail: repeat (count in a nested math_number) with a print inside.
const detail = workspace({
	type: 'controls_repeat_ext',
	id: 'repeat',
	inputs: {
		TIMES: { shadow: { type: 'math_number', id: 'times', fields: { NUM: 5 } } },
		DO: {
			block: {
				type: 'text_print',
				id: 'print',
				inputs: { TEXT: { shadow: { type: 'text', id: 'msg', fields: { TEXT: 'hi' } } } }
			}
		}
	}
});

const plainLevel = () => ({
	blockDefs: [{ type: 'zoom_x_op', message0: 'do it' }],
	workspaceJson: workspace({ type: 'zoom_x_op', id: 'p1' }),
	bindings: []
});

/** A result whose semantic level is `semantic`, with a plain concept level. */
const zoom = (semantic: Record<string, unknown>): Record<string, Record<string, unknown>> => ({
	semantic: { ...plainLevel(), ...semantic },
	concept: plainLevel()
});

describe('repairZoomResult', () => {
	it('moves a binding from the outer block to the one nested block holding the field', () => {
		const raw = zoom({
			bindings: [{ block: 's1', field: 'TIMES', detail: [{ block: 'repeat', field: 'NUM' }] }]
		});

		const repairs = repairZoomResult(raw, detail);

		expect(raw.semantic.bindings).toEqual([
			{ block: 's1', field: 'TIMES', detail: [{ block: 'times', field: 'NUM' }] }
		]);
		expect(repairs).toEqual([
			'semantic.bindings[0]: moved from controls_repeat_ext "repeat" to the math_number "times" inside it, which holds NUM'
		]);
	});

	it('leaves a binding alone when several nested blocks hold the field', () => {
		const twoNumbers = workspace({
			type: 'math_arithmetic',
			id: 'sum',
			inputs: {
				A: { shadow: { type: 'math_number', id: 'a', fields: { NUM: 1 } } },
				B: { shadow: { type: 'math_number', id: 'b', fields: { NUM: 2 } } }
			}
		});
		const raw = zoom({
			bindings: [{ block: 's1', field: 'N', detail: [{ block: 'sum', field: 'NUM' }] }]
		});

		expect(repairZoomResult(raw, twoNumbers)).toEqual([]);
		expect(raw.semantic.bindings).toEqual([
			{ block: 's1', field: 'N', detail: [{ block: 'sum', field: 'NUM' }] }
		]);
	});

	it('appends missing placeholders to a message', () => {
		const raw = zoom({
			blockDefs: [
				{
					type: 'zoom_x_op',
					message0: 'repeat up to',
					args0: [
						{ type: 'field_number', name: 'LIMIT' },
						{ type: 'input_statement', name: 'DO' }
					]
				}
			]
		});

		expect(repairZoomResult(raw, detail)).toEqual([
			"semantic: added %1 %2 to zoom_x_op's message0"
		]);
		expect((raw.semantic.blockDefs as Record<string, unknown>[])[0].message0).toBe(
			'repeat up to %1 %2'
		);
	});

	it.each([
		['out of range', 'repeat %1 %3'],
		['repeated', 'repeat %1 %1']
	])('leaves a message alone when a placeholder is %s', (_, message0) => {
		const def = {
			type: 'zoom_x_op',
			message0,
			args0: [
				{ type: 'field_number', name: 'A' },
				{ type: 'field_number', name: 'B' }
			]
		};
		const raw = zoom({ blockDefs: [def] });

		expect(repairZoomResult(raw, detail)).toEqual([]);
		expect(def.message0).toBe(message0);
	});

	it('adds nextStatement to a definition whose block has a block after it', () => {
		const raw = zoom({
			workspaceJson: workspace({
				type: 'zoom_x_op',
				id: 's1',
				next: { block: { type: 'text_print', id: 's2' } }
			})
		});

		expect(repairZoomResult(raw, detail)).toEqual([
			'semantic: added "nextStatement" to zoom_x_op, which has a block after it'
		]);
		expect((raw.semantic.blockDefs as Record<string, unknown>[])[0]).toHaveProperty(
			'nextStatement',
			null
		);
	});

	it('declares an input when the child block shows which kind it needs', () => {
		const raw = zoom({
			blockDefs: [
				{ type: 'zoom_x_op', message0: 'do' },
				{ type: 'zoom_x_value', message0: 'value', output: null },
				{ type: 'zoom_x_step', message0: 'step', previousStatement: null }
			],
			workspaceJson: workspace({
				type: 'zoom_x_op',
				id: 's1',
				inputs: {
					BODY: {
						block: {
							type: 'text_print',
							id: 's2',
							next: { block: { type: 'text_print', id: 's3' } }
						}
					},
					VALUE: { block: { type: 'zoom_x_value', id: 's4' } },
					STEP: { block: { type: 'zoom_x_step', id: 's5' } }
				}
			})
		});

		expect(repairZoomResult(raw, detail)).toEqual([
			'semantic: added input_statement "BODY" to zoom_x_op, which has a block in it',
			'semantic: added input_value "VALUE" to zoom_x_op, which has a block in it',
			'semantic: added input_statement "STEP" to zoom_x_op, which has a block in it'
		]);
		expect((raw.semantic.blockDefs as Record<string, unknown>[])[0]).toMatchObject({
			message0: 'do %1 %2 %3',
			args0: [
				{ type: 'input_statement', name: 'BODY' },
				{ type: 'input_value', name: 'VALUE' },
				{ type: 'input_statement', name: 'STEP' }
			]
		});
	});

	it('leaves an input alone when the child is a built-in block with nothing after it', () => {
		const raw = zoom({
			workspaceJson: workspace({
				type: 'zoom_x_op',
				id: 's1',
				inputs: { DO: { block: { type: 'text_print', id: 's2' } } }
			})
		});

		expect(repairZoomResult(raw, detail)).toEqual([]);
	});

	it('ignores malformed results without throwing', () => {
		for (const raw of [
			null,
			'text',
			{ semantic: 'x' },
			{ semantic: { blockDefs: 'x', bindings: {} } }
		]) {
			expect(repairZoomResult(raw, detail)).toEqual([]);
		}
	});
});

describe('parseZoomResponse with repairs', () => {
	it('accepts the live-run result that was missing %2 and a nested binding', () => {
		const semantic = {
			blockDefs: [
				{
					type: 'zoom_playground_repeat',
					message0: 'repeat up to %1',
					args0: [
						{ type: 'field_number', name: 'LIMIT', value: 0 },
						{ type: 'input_statement', name: 'DO' }
					],
					previousStatement: null,
					nextStatement: null
				}
			],
			workspaceJson: workspace({
				type: 'zoom_playground_repeat',
				id: 's1',
				inputs: { DO: { block: { type: 'text_print', id: 's2' } } }
			}),
			bindings: [{ block: 's1', field: 'LIMIT', detail: [{ block: 'repeat', field: 'NUM' }] }]
		};

		const { result, repairs } = parseZoomResponse(
			JSON.stringify({ semantic, concept: plainLevel() }),
			detail
		);

		expect(repairs).toEqual([
			"semantic: added %2 to zoom_playground_repeat's message0",
			'semantic.bindings[0]: moved from controls_repeat_ext "repeat" to the math_number "times" inside it, which holds NUM'
		]);
		expect(result.semantic.blockDefs[0].message0).toBe('repeat up to %1 %2');
		expect(result.semantic.bindings[0].detail).toEqual([{ block: 'times', field: 'NUM' }]);
	});
});
