// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { ZoomResponseSchema } from '@szrs/llm-proxy-contracts';
import { describe, expect, it } from 'vitest';

import { expandPlaceholders } from '../../../src/zoom/placeholders.js';
import { checkZoomResult } from '../../../src/zoom/validate.js';
import { parseZoomResponse } from '../../../src/zoom/zoom.js';

const workspace = (...blocks: unknown[]) => ({ blocks: { languageVersion: 0, blocks } });

// Detail (canonical ids): repeat 10 { print "hi" }, then set total to 5 and
// a comparison with a dropdown operator.
const detail = workspace({
	type: 'controls_repeat_ext',
	id: 'b1',
	inputs: {
		TIMES: { shadow: { type: 'math_number', id: 'b2', fields: { NUM: 10 } } },
		DO: {
			block: {
				type: 'text_print',
				id: 'b3',
				inputs: { TEXT: { block: { type: 'text', id: 'b4', fields: { TEXT: 'hi' } } } }
			}
		}
	},
	next: {
		block: {
			type: 'math_number',
			id: 'b5',
			fields: { NUM: 5 },
			next: { block: { type: 'logic_compare', id: 'b6', fields: { OP: 'EQ' } } }
		}
	}
});

const level = (message0: string, extra: Record<string, unknown> = {}) => ({
	blockDefs: [{ type: 'zoom_x_op', message0, ...extra }],
	workspaceJson: workspace({ type: 'zoom_x_op', id: 's1' })
});

const response = (semanticMessage: string, extra?: Record<string, unknown>) => ({
	semantic: level(semanticMessage, extra),
	concept: {
		blockDefs: [{ type: 'zoom_x_concept', message0: 'say hello' }],
		workspaceJson: workspace({ type: 'zoom_x_concept', id: 'c1' })
	}
});

function expand(raw: unknown) {
	const { repairs, problems } = expandPlaceholders(raw, detail);
	return { raw: raw as ReturnType<typeof response>, repairs, problems };
}

describe('expandPlaceholders', () => {
	it('turns a number reference into a field_number, its %N and a binding', () => {
		const { raw, problems } = expand(response('repeat {b2.NUM} times'));
		const semantic = ZoomResponseSchema.shape.semantic.parse(raw.semantic);

		expect(problems).toEqual([]);
		expect(semantic.blockDefs[0]).toMatchObject({
			message0: 'repeat %1 times',
			args0: [{ type: 'field_number', name: 'V1', value: 10 }]
		});
		expect(semantic.bindings).toEqual([
			{ block: 's1', field: 'V1', detail: [{ block: 'b2', field: 'NUM' }] }
		]);
	});

	it('turns a text reference into a field_input holding the Detail text', () => {
		const { raw } = expand(response('say {b4.TEXT}'));

		expect(raw.semantic.blockDefs[0]).toMatchObject({
			message0: 'say %1',
			args0: [{ type: 'field_input', name: 'V1', text: 'hi' }]
		});
	});

	it('numbers new fields after the args the model wrote, leaving its own %N alone', () => {
		const { raw, problems } = expand(
			response('do %1 up to {b2.NUM}', { args0: [{ type: 'input_statement', name: 'DO' }] })
		);

		expect(problems).toEqual([]);
		expect(raw.semantic.blockDefs[0]).toMatchObject({
			message0: 'do %1 up to %2',
			args0: [
				{ type: 'input_statement', name: 'DO' },
				{ type: 'field_number', name: 'V2', value: 10 }
			]
		});
	});

	it('gives each reference of one label its own field and binding', () => {
		const { raw } = expand(response('{b4.TEXT} {b2.NUM} times'));
		const semantic = ZoomResponseSchema.shape.semantic.parse(raw.semantic);

		expect(semantic.blockDefs[0].message0).toBe('%1 %2 times');
		expect(semantic.bindings.map((binding) => binding.field)).toEqual(['V1', 'V2']);
	});

	it('does not reuse a field name the model already used', () => {
		const { raw } = expand(
			response('{b2.NUM} and %1', { args0: [{ type: 'field_label', name: 'V2' }] })
		);

		expect(raw.semantic.blockDefs[0]).toMatchObject({
			args0: [{ name: 'V2' }, { type: 'field_number', name: 'V3' }]
		});
	});

	it('binds one field to several Detail fields of the same kind', () => {
		const { raw, problems } = expand(response('up to {b2.NUM|b5.NUM}'));
		const semantic = ZoomResponseSchema.shape.semantic.parse(raw.semantic);

		expect(problems).toEqual([]);
		expect(semantic.bindings[0].detail).toEqual([
			{ block: 'b2', field: 'NUM' },
			{ block: 'b5', field: 'NUM' }
		]);
	});

	it('leaves braces that are not references alone', () => {
		const { raw, problems } = expand(response('use {curly} braces, a {b1} and {b2.num.x}'));

		expect(problems).toEqual([]);
		expect(raw.semantic.blockDefs[0].message0).toBe('use {curly} braces, a {b1} and {b2.num.x}');
		expect((raw.semantic as { bindings?: unknown[] }).bindings).toEqual([]);
	});

	it('moves a reference to the one block inside that holds the field, as a repair', () => {
		const { raw, repairs, problems } = expand(response('repeat {b1.NUM} times'));
		const semantic = ZoomResponseSchema.shape.semantic.parse(raw.semantic);

		expect(problems).toEqual([]);
		expect(semantic.bindings[0].detail).toEqual([{ block: 'b2', field: 'NUM' }]);
		expect(repairs).toHaveLength(1);
		expect(repairs[0]).toContain('moved from controls_repeat_ext "b1" to the math_number "b2"');
	});

	it('drops a definition with references that no block uses, as a repair, and keeps the rest', () => {
		const raw = response('repeat {b2.NUM} times');
		raw.semantic.blockDefs.push({ type: 'zoom_x_unused', message0: 'never shown {b4.TEXT}' });

		const { repairs, problems } = expand(raw);

		expect(problems).toEqual([]);
		expect(raw.semantic.blockDefs.map((def) => def.type)).toEqual(['zoom_x_op']);
		expect(repairs).toEqual([
			'semantic.blockDefs "zoom_x_unused" dropped: it has {…} references and no block in semantic.workspaceJson uses it'
		]);
	});

	it('drops the only definition when it is unused, and leaves the schema to say a level needs one', () => {
		const raw = response('repeat {b2.NUM} times');
		raw.semantic.workspaceJson = workspace();
		expand(raw);
		expect(raw.semantic.blockDefs).toEqual([]);
	});

	describe('problems, as messages for the model', () => {
		it('reports an unknown Detail block', () => {
			const { problems } = expand(response('repeat {b99.NUM} times'));
			expect(problems).toEqual([
				'semantic.blockDefs "zoom_x_op": {b99.NUM}: the Detail workspace has no block with id "b99"'
			]);
		});

		it('reports a field the block does not have, and where it is when several hold it', () => {
			const sum = workspace({
				type: 'math_arithmetic',
				id: 'b1',
				inputs: {
					A: { shadow: { type: 'math_number', id: 'b2', fields: { NUM: 1 } } },
					B: { shadow: { type: 'math_number', id: 'b3', fields: { NUM: 2 } } }
				}
			});
			const { problems } = expandPlaceholders(response('add {b1.NUM}'), sum);
			expect(problems[0]).toContain('Detail block "b1" (math_arithmetic) has no field "NUM"');
			expect(problems[0]).toContain('"b2" (math_number), "b3" (math_number)');
		});

		it('reports a value that is neither a number nor text', () => {
			const withVariable = workspace({
				type: 'variables_set',
				id: 'b1',
				fields: { VAR: { id: 'v1' } }
			});
			const { problems } = (() => {
				const raw = response('set {b1.VAR}');
				return { problems: expandPlaceholders(raw, withVariable).problems };
			})();
			expect(problems[0]).toContain('only numbers and text can be referenced');
		});

		it('reports fields of different kinds in one reference', () => {
			const { problems } = expand(response('x {b2.NUM|b4.TEXT}'));
			expect(problems[0]).toContain('values of different kinds (number, string)');
		});

		it('reports a type with references that is used by several blocks', () => {
			const raw = response('repeat {b2.NUM} times');
			raw.semantic.workspaceJson = workspace(
				{ type: 'zoom_x_op', id: 's1' },
				{ type: 'zoom_x_op', id: 's2' }
			);
			const { problems } = expand(raw);
			expect(problems[0]).toContain('is used by 2 blocks');
			expect(problems[0]).toContain('Define one type for each block');
		});

		it('still reports a definition with references that two blocks use', () => {
			const raw = response('repeat {b2.NUM} times');
			raw.semantic.workspaceJson = workspace(
				{ type: 'zoom_x_op', id: 's1' },
				{ type: 'zoom_x_op', id: 's2' }
			);
			expect(expand(raw).problems[0]).toContain('is used by 2 blocks');
		});

		it('reports a reference in the tooltip, where it would show as text', () => {
			const { problems } = expand(response('do it', { tooltip: 'repeats {b2.NUM} times' }));
			expect(problems[0]).toContain('"tooltip" has a {…} reference');
		});

		it('reports a block without an id', () => {
			const raw = response('repeat {b2.NUM} times');
			raw.semantic.workspaceJson = workspace({ type: 'zoom_x_op' });
			expect(expand(raw).problems[0]).toContain('has no "id"');
		});
	});

	it('produces a level that passes the checks against Detail', () => {
		const { raw } = expand(response('repeat {b2.NUM} times, saying {b4.TEXT}'));
		const parsed = ZoomResponseSchema.parse(raw);
		expect(checkZoomResult(parsed, detail)).toEqual([]);
	});

	it('is a no-op on something that is not a zoom', () => {
		expect(expandPlaceholders(null, detail)).toEqual({ repairs: [], problems: [] });
		expect(expandPlaceholders({ semantic: 1 }, detail)).toEqual({ repairs: [], problems: [] });
	});
});

describe('parseZoomResponse with the v2 prompt', () => {
	const text = (raw: unknown) => JSON.stringify(raw);

	it('expands the references before the schema and the checks', () => {
		const { result } = parseZoomResponse(text(response('repeat {b2.NUM} times')), detail, 'v2');

		expect(result.semantic.bindings).toEqual([
			{ block: 's1', field: 'V1', detail: [{ block: 'b2', field: 'NUM' }] }
		]);
		expect(result.semantic.blockDefs[0]).toMatchObject({ message0: 'repeat %1 times' });
	});

	it('fails as a validation error when a reference is wrong', () => {
		expect(() => parseZoomResponse(text(response('repeat {b99.NUM}')), detail, 'v2')).toThrow(
			/no block with id "b99"/
		);
	});

	it('leaves v1 output alone: its braces are text, it has its own bindings', () => {
		const { result } = parseZoomResponse(text(response('repeat {b2.NUM} times')), detail, 'v1');

		expect(result.semantic.blockDefs[0]).toMatchObject({ message0: 'repeat {b2.NUM} times' });
		expect(result.semantic.bindings).toEqual([]);
	});
});
