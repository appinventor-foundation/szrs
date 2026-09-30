import type { ZoomLevel, ZoomResponse } from '@szrs/llm-proxy-contracts';
import { describe, expect, it } from 'vitest';

import { allBlocks, checkZoomResult } from '../../../src/zoom/validate.js';

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
