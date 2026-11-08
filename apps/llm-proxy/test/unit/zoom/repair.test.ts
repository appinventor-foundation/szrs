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

	it('adds the missing input arg without repeating a %N the message already has', () => {
		const raw = zoom({
			blockDefs: [
				{ type: 'zoom_x_loop', message0: 'repeat while it holds %1' },
				{ type: 'zoom_x_op', message0: 'do it', previousStatement: null, nextStatement: null }
			],
			workspaceJson: workspace({
				type: 'zoom_x_loop',
				id: 's1',
				inputs: { DO: { block: { type: 'zoom_x_op', id: 's2' } } }
			})
		});

		const repairs = repairZoomResult(raw, detail);

		const [def] = raw.semantic.blockDefs as Record<string, unknown>[];
		expect(def.message0).toBe('repeat while it holds %1');
		expect(def.args0).toEqual([{ type: 'input_statement', name: 'DO' }]);
		expect(repairs).toHaveLength(1);
	});

	it('still appends the %N when the message has no reference to it', () => {
		const raw = zoom({
			blockDefs: [
				{ type: 'zoom_x_loop', message0: 'repeat while it holds' },
				{ type: 'zoom_x_op', message0: 'do it', previousStatement: null, nextStatement: null }
			],
			workspaceJson: workspace({
				type: 'zoom_x_loop',
				id: 's1',
				inputs: { DO: { block: { type: 'zoom_x_op', id: 's2' } } }
			})
		});
		repairZoomResult(raw, detail);
		expect((raw.semantic.blockDefs as Record<string, unknown>[])[0].message0).toBe(
			'repeat while it holds %1'
		);
	});

	it('does not mistake %10 for %1', () => {
		const raw = zoom({
			blockDefs: [
				{ type: 'zoom_x_loop', message0: 'wait %10 times' },
				{ type: 'zoom_x_op', message0: 'do it', previousStatement: null, nextStatement: null }
			],
			workspaceJson: workspace({
				type: 'zoom_x_loop',
				id: 's1',
				inputs: { DO: { block: { type: 'zoom_x_op', id: 's2' } } }
			})
		});
		repairZoomResult(raw, detail);
		expect((raw.semantic.blockDefs as Record<string, unknown>[])[0].message0).toBe(
			'wait %10 times %1'
		);
	});

	describe('connection types', () => {
		const withDef = (def: Record<string, unknown>) =>
			zoom({ blockDefs: [{ type: 'zoom_x_op', message0: 'do it', ...def }] });
		const defOf = (raw: ReturnType<typeof zoom>) =>
			(raw.semantic.blockDefs as Record<string, unknown>[])[0];

		it('sets a block type written as a connection check to null, as a repair', () => {
			const raw = withDef({
				previousStatement: 'zoom_x_loop',
				nextStatement: ['zoom_x_a', 'zoom_x_b'],
				output: 'Number'
			});

			const repairs = repairZoomResult(raw, detail);

			expect(defOf(raw)).toMatchObject({
				previousStatement: null,
				nextStatement: null,
				output: null
			});
			expect(repairs).toEqual([
				'semantic: set "previousStatement", "nextStatement", "output" of zoom_x_op to null, because zoom blocks have no connection types'
			]);
		});

		it('leaves null and a value that is not a type check alone', () => {
			const raw = withDef({ previousStatement: null, nextStatement: false, output: 7 });

			expect(repairZoomResult(raw, detail)).toEqual([]);
			expect(defOf(raw)).toMatchObject({
				previousStatement: null,
				nextStatement: false,
				output: 7
			});
		});

		it('touches no other key of the definition', () => {
			const raw = withDef({ nextStatement: 'zoom_x_loop', tooltip: 'does it', colour: 30 });
			repairZoomResult(raw, detail);
			expect(defOf(raw)).toMatchObject({ message0: 'do it', tooltip: 'does it', colour: 30 });
		});

		it('is part of reading a model answer, whichever prompt asked for it', () => {
			const def = { type: 'zoom_x_op', message0: 'do it', nextStatement: 'zoom_x_op' };
			const level = {
				blockDefs: [def],
				workspaceJson: workspace({ type: 'zoom_x_op', id: 's1' }),
				bindings: []
			};
			const { result, repairs } = parseZoomResponse(
				JSON.stringify({ semantic: level, concept: plainLevel() }),
				detail,
				'v1'
			);
			expect(result.semantic.blockDefs[0].nextStatement).toBeNull();
			expect(repairs).toHaveLength(1);
		});
	});

	it('wraps a workspace saved without its outer "blocks" key, which has one meaning', () => {
		const raw = zoom({
			workspaceJson: { languageVersion: 0, blocks: [{ type: 'zoom_x_op', id: 'p1' }] }
		});

		const repairs = repairZoomResult(raw, detail);

		expect(raw.semantic.workspaceJson).toEqual({
			blocks: { languageVersion: 0, blocks: [{ type: 'zoom_x_op', id: 'p1' }] }
		});
		expect(repairs).toEqual(['semantic: wrapped workspaceJson in "blocks", which it was missing']);
	});

	it('leaves a workspace that already has its wrapper alone', () => {
		const raw = zoom({});
		expect(repairZoomResult(raw, detail)).toEqual([]);
		expect(raw.semantic.workspaceJson).toEqual(workspace({ type: 'zoom_x_op', id: 'p1' }));
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
