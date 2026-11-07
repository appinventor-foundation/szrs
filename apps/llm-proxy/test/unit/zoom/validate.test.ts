import type { ZoomLevel, ZoomResponse } from '@szrs/llm-proxy-contracts';
import { describe, expect, it } from 'vitest';

import { allBlocks } from '../../../src/zoom/saved-blocks.js';
import { checkZoomResult } from '../../../src/zoom/validate.js';

const workspace = (...blocks: unknown[]) => ({ blocks: { languageVersion: 0, blocks } });

// Detail: print(text "hi") inside a repeat of 10, followed by a colour choice.
const detailWorkspace = workspace({
	type: 'controls_repeat_ext',
	id: 'repeat',
	inputs: {
		TIMES: { shadow: { type: 'math_number', id: 'times', fields: { NUM: 10 } } },
		DO: {
			block: {
				type: 'text_print',
				id: 'print',
				inputs: { TEXT: { block: { type: 'text', id: 'msg', fields: { TEXT: 'hi' } } } }
			}
		}
	},
	next: {
		block: {
			type: 'colour_choice',
			id: 'choice',
			fields: { COLOUR: 'RED', VAR: { id: 'v1' } }
		}
	}
});

const conceptDef = {
	type: 'zoom_x_concept',
	message0: 'say %1 %2 times in %3',
	args0: [
		{ type: 'field_input', name: 'MESSAGE' },
		{ type: 'field_number', name: 'TIMES' },
		{
			type: 'field_dropdown',
			name: 'COLOUR',
			options: [
				['red', 'RED'],
				['blue', 'BLUE']
			]
		},
		{ type: 'field_label', name: 'NOTE' }
	]
};

function result(concept: Partial<ZoomLevel>): ZoomResponse {
	const level: ZoomLevel = {
		blockDefs: [conceptDef],
		workspaceJson: workspace({ type: 'zoom_x_concept', id: 'c1' }),
		bindings: [],
		...concept
	};
	return { semantic: level, concept: level };
}

const concept = (bindings: ZoomLevel['bindings']) =>
	checkZoomResult(result({ bindings }), detailWorkspace).filter((e) => e.startsWith('concept'));

describe('allBlocks', () => {
	it('finds nested, shadow and following blocks', () => {
		expect(allBlocks(detailWorkspace).map((block) => block.id)).toEqual([
			'repeat',
			'times',
			'print',
			'msg',
			'choice'
		]);
	});
});

describe('checkZoomResult', () => {
	it('accepts valid bindings, including several Detail targets', () => {
		expect(
			concept([
				{ block: 'c1', field: 'MESSAGE', detail: [{ block: 'msg', field: 'TEXT' }] },
				{ block: 'c1', field: 'TIMES', detail: [{ block: 'times', field: 'NUM' }] },
				{ block: 'c1', field: 'COLOUR', detail: [{ block: 'choice', field: 'COLOUR' }] }
			])
		).toEqual([]);
		expect(
			concept([
				{
					block: 'c1',
					field: 'TIMES',
					detail: [
						{ block: 'times', field: 'NUM' },
						{ block: 'times', field: 'NUM' }
					]
				}
			])
		).toEqual([]);
	});

	it('rejects zoom_ block types the level does not define', () => {
		const errors = checkZoomResult(
			result({ workspaceJson: workspace({ type: 'zoom_x_missing', id: 'c1' }) }),
			detailWorkspace
		);
		expect(errors).toContain(
			`concept.workspaceJson uses "zoom_x_missing", which concept.blockDefs doesn't define`
		);
	});

	it('allows built-in block types without a definition', () => {
		const errors = checkZoomResult(
			result({ workspaceJson: workspace({ type: 'controls_if', id: 'c2' }) }),
			detailWorkspace
		);
		expect(errors).toEqual([]);
	});

	it('rejects a child in an input the definition does not declare', () => {
		const errors = checkZoomResult(
			result({
				blockDefs: [
					{
						type: 'zoom_x_repeat',
						message0: 'repeat up to %1',
						args0: [{ type: 'field_number', name: 'LIMIT' }],
						previousStatement: null
					}
				],
				workspaceJson: workspace({
					type: 'zoom_x_repeat',
					id: 's1',
					inputs: { DO: { block: { type: 'text_print', id: 's2' } } }
				})
			}),
			detailWorkspace
		);
		expect(errors[0]).toMatch(
			/^semantic\.workspaceJson: block "s1" \(zoom_x_repeat\) puts a block in input "DO", but its definition has no input_value or input_statement named "DO"/
		);
	});

	it('rejects a following block when the definition has no nextStatement', () => {
		const errors = checkZoomResult(
			result({
				workspaceJson: workspace({
					type: 'zoom_x_concept',
					id: 'c1',
					next: { block: { type: 'zoom_x_concept', id: 'c2' } }
				})
			}),
			detailWorkspace
		);
		expect(errors[0]).toMatch(
			/block "c1" \(zoom_x_concept\) has a block after it, but its definition has no "nextStatement"/
		);
	});

	it('accepts a child in an input_statement the definition declares', () => {
		const errors = checkZoomResult(
			result({
				blockDefs: [
					{
						type: 'zoom_x_repeat',
						message0: 'repeat %1',
						args0: [{ type: 'input_statement', name: 'DO' }],
						nextStatement: null
					}
				],
				workspaceJson: workspace({
					type: 'zoom_x_repeat',
					id: 's1',
					inputs: { DO: { block: { type: 'text_print', id: 's2' } } },
					next: { block: { type: 'text_print', id: 's3' } }
				})
			}),
			detailWorkspace
		);
		expect(errors).toEqual([]);
	});

	it('rejects a binding to a missing zoomed block', () => {
		expect(
			concept([{ block: 'nope', field: 'TIMES', detail: [{ block: 'times', field: 'NUM' }] }])
		).toEqual(['concept.bindings[0]: concept.workspaceJson has no block with id "nope"']);
	});

	it('rejects a binding to a field that cannot be edited', () => {
		const [error] = concept([
			{ block: 'c1', field: 'NOTE', detail: [{ block: 'times', field: 'NUM' }] }
		]);
		expect(error).toMatch(/has no field_number, field_input or field_dropdown named "NOTE"/);
	});

	it('rejects a missing Detail block or field', () => {
		expect(
			concept([
				{
					block: 'c1',
					field: 'TIMES',
					detail: [
						{ block: 'gone', field: 'NUM' },
						{ block: 'times', field: 'OTHER' }
					]
				}
			])
		).toEqual([
			'concept.bindings[0]: the Detail workspace has no block with id "gone"',
			'concept.bindings[0]: Detail block "times" (math_number) has no field "OTHER"'
		]);
	});

	it('points to the nested block that holds a field', () => {
		expect(
			concept([{ block: 'c1', field: 'TIMES', detail: [{ block: 'repeat', field: 'NUM' }] }])
		).toEqual([
			'concept.bindings[0]: Detail block "repeat" (controls_repeat_ext) has no field "NUM". "NUM" is on block "times" (math_number) inside it; bind that block instead'
		]);
	});

	it('does not point to blocks that come after the bound block', () => {
		const after = workspace({
			type: 'text_print',
			id: 'first',
			next: { block: { type: 'math_number', id: 'later', fields: { NUM: 3 } } }
		});
		const errors = checkZoomResult(
			result({
				bindings: [{ block: 'c1', field: 'TIMES', detail: [{ block: 'first', field: 'NUM' }] }]
			}),
			after
		);
		expect(errors[0]).toBe(
			'semantic.bindings[0]: Detail block "first" (text_print) has no field "NUM"'
		);
	});

	it('rejects fields bound to a value of another kind', () => {
		const errors = concept([
			{ block: 'c1', field: 'TIMES', detail: [{ block: 'msg', field: 'TEXT' }] },
			{ block: 'c1', field: 'MESSAGE', detail: [{ block: 'times', field: 'NUM' }] },
			{ block: 'c1', field: 'COLOUR', detail: [{ block: 'msg', field: 'TEXT' }] },
			{ block: 'c1', field: 'MESSAGE', detail: [{ block: 'choice', field: 'VAR' }] }
		]);
		expect(errors).toEqual([
			'concept.bindings[0]: field_number is bound to a string value (Detail block "msg", field "TEXT")',
			'concept.bindings[1]: field_input is bound to a number value (Detail block "times", field "NUM")',
			'concept.bindings[2]: field_dropdown has no option with the Detail value "hi" (Detail block "msg", field "TEXT")',
			'concept.bindings[3]: field_input is bound to a object value (Detail block "choice", field "VAR")'
		]);
	});
});

describe('checkZoomResult: connections Blockly would refuse', () => {
	const parentDef = {
		type: 'zoom_x_parent',
		message0: 'when %1 do %2',
		args0: [
			{ type: 'input_value', name: 'COND' },
			{ type: 'input_statement', name: 'DO' }
		],
		previousStatement: null,
		nextStatement: null
	};
	const valueDef = { type: 'zoom_x_value', message0: 'a value', output: null };
	const stepDef = {
		type: 'zoom_x_step',
		message0: 'a step',
		previousStatement: null,
		nextStatement: null
	};
	const level = (blockDefs: unknown[], ...blocks: unknown[]) =>
		result({ blockDefs: blockDefs as ZoomLevel['blockDefs'], workspaceJson: workspace(...blocks) });
	const parent = (inputs: Record<string, unknown>, next?: unknown) => ({
		type: 'zoom_x_parent',
		id: 's1',
		inputs,
		...(next === undefined ? {} : { next: { block: next } })
	});

	it('accepts blocks that fit where they are put', () => {
		const ok = level(
			[parentDef, valueDef, stepDef],
			parent(
				{
					COND: { block: { type: 'zoom_x_value', id: 's2' } },
					DO: {
						block: {
							type: 'zoom_x_step',
							id: 's3',
							next: { block: { type: 'zoom_x_step', id: 's4' } }
						}
					}
				},
				{ type: 'zoom_x_step', id: 's5' }
			)
		);
		expect(checkZoomResult(ok, detailWorkspace)).toEqual([]);
	});

	it('reports a block with no output in a value input', () => {
		const errors = checkZoomResult(
			level([parentDef, stepDef], parent({ COND: { block: { type: 'zoom_x_step', id: 's2' } } })),
			detailWorkspace
		);
		expect(
			errors.some((e) => e.includes('is in a value input ("COND")') && e.includes('"output": null'))
		).toBe(true);
	});

	it('reports a block with no previousStatement in a statement input', () => {
		const errors = checkZoomResult(
			level([parentDef, valueDef], parent({ DO: { block: { type: 'zoom_x_value', id: 's2' } } })),
			detailWorkspace
		);
		expect(
			errors.some(
				(e) => e.includes('statement input ("DO")') && e.includes('"previousStatement": null')
			)
		).toBe(true);
	});

	it('reports a block after another that cannot follow', () => {
		const errors = checkZoomResult(
			level([parentDef, valueDef], parent({}, { type: 'zoom_x_value', id: 's2' })),
			detailWorkspace
		);
		expect(errors.some((e) => e.includes('cannot follow a block'))).toBe(true);
	});

	it('reports a child with no type, and a top-level block with no type', () => {
		const nested = checkZoomResult(
			level([parentDef], parent({ DO: { block: { id: 's2' } } })),
			detailWorkspace
		);
		expect(nested.some((e) => e.includes('the block in input "DO" has no "type"'))).toBe(true);

		const topLevel = checkZoomResult(level([parentDef], { id: 's1' }), detailWorkspace);
		expect(topLevel.some((e) => e.includes('top-level block 0 has no "type"'))).toBe(true);
	});

	it('leaves built-in blocks alone, as their shapes are not known here', () => {
		const builtIn = level(
			[parentDef],
			parent({ COND: { block: { type: 'logic_boolean', id: 's2' } } })
		);
		expect(checkZoomResult(builtIn, detailWorkspace)).toEqual([]);
	});
});
