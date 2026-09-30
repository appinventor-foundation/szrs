import type { ZoomResponse } from '@szrs/llm-proxy-contracts';
import { describe, expect, it } from 'vitest';

import { normalizeWorkspace, restoreIds } from '../../../src/zoom/normalize.js';

const workspace = (blocks: unknown[], extra: Record<string, unknown> = {}) => ({
	blocks: { languageVersion: 0, blocks },
	...extra
});

// repeat (nested number, with a print inside, followed by another print)
const program = (ids: string[], x = 10, y = 20) =>
	workspace([
		{
			type: 'controls_repeat_ext',
			id: ids[0],
			x,
			y,
			inputs: {
				TIMES: { shadow: { type: 'math_number', id: ids[1], fields: { NUM: 5 } } },
				DO: {
					block: {
						type: 'text_print',
						id: ids[2],
						inputs: { TEXT: { shadow: { type: 'text', id: ids[3], fields: { TEXT: 'hi' } } } }
					}
				}
			},
			next: { block: { type: 'text_print', id: ids[4] } }
		}
	]);

describe('normalizeWorkspace', () => {
	it('numbers blocks in traversal order, inputs by name, then the next block', () => {
		const { workspaceJson, originalIds } = normalizeWorkspace(
			program(['r', 'times', 'print', 'msg', 'after'])
		);

		const repeat = (workspaceJson.blocks as { blocks: Record<string, any>[] }).blocks[0];
		expect(repeat.id).toBe('b1');
		// DO sorts before TIMES.
		expect(repeat.inputs.DO.block.id).toBe('b2');
		expect(repeat.inputs.DO.block.inputs.TEXT.shadow.id).toBe('b3');
		expect(repeat.inputs.TIMES.shadow.id).toBe('b4');
		expect(repeat.next.block.id).toBe('b5');
		expect(Object.fromEntries(originalIds)).toEqual({
			b1: 'r',
			b2: 'print',
			b3: 'msg',
			b4: 'times',
			b5: 'after'
		});
	});

	it('gives the same program the same result whatever its ids, positions and key order', () => {
		const a = normalizeWorkspace(program(['r', 'times', 'print', 'msg', 'after'], 10, 20));
		const b = normalizeWorkspace(program(['Xq1', 'k9', 'Zz', 'p0', 'T5'], 400, -75));
		const reordered = program(['r', 'times', 'print', 'msg', 'after']);
		const repeat = (reordered.blocks.blocks as Record<string, any>[])[0];
		repeat.inputs = { DO: repeat.inputs.DO, TIMES: repeat.inputs.TIMES };

		expect(JSON.stringify(b.workspaceJson)).toBe(JSON.stringify(a.workspaceJson));
		// Same content; only the order of the input keys in the JSON text differs.
		expect(normalizeWorkspace(reordered).workspaceJson).toEqual(a.workspaceJson);
		expect(JSON.stringify(a.workspaceJson)).not.toMatch(/"[xy]"/);
	});

	it('gives different programs different results', () => {
		const a = normalizeWorkspace(program(['r', 't', 'p', 'm', 'a']));
		const changed = program(['r', 't', 'p', 'm', 'a']);
		(changed.blocks.blocks as Record<string, any>[])[0].inputs.TIMES.shadow.fields.NUM = 6;

		expect(JSON.stringify(normalizeWorkspace(changed).workspaceJson)).not.toBe(
			JSON.stringify(a.workspaceJson)
		);
	});

	it('renames variable ids in the list and in fields', () => {
		const { workspaceJson } = normalizeWorkspace(
			workspace([{ type: 'variables_set', id: 'set', fields: { VAR: { id: 'rand-var-id' } } }], {
				variables: [{ name: 'count', id: 'rand-var-id' }]
			})
		);

		expect(workspaceJson.variables).toEqual([{ name: 'count', id: 'v1' }]);
		const block = (workspaceJson.blocks as { blocks: Record<string, any>[] }).blocks[0];
		expect(block.fields.VAR).toEqual({ id: 'v1' });
	});

	it('leaves blocks without an id without one, so they still cannot be bound', () => {
		const { workspaceJson, originalIds } = normalizeWorkspace(
			workspace([{ type: 'text_print' }, { type: 'text_print', id: 'kept' }])
		);

		const blocks = (workspaceJson.blocks as { blocks: Record<string, any>[] }).blocks;
		expect(blocks[0]).toEqual({ type: 'text_print' });
		expect(blocks[1].id).toBe('b1');
		expect(Object.fromEntries(originalIds)).toEqual({ b1: 'kept' });
	});

	it('does not change its input, and copes with a workspace that has no blocks', () => {
		const input = program(['r', 't', 'p', 'm', 'a']);
		const before = JSON.stringify(input);

		normalizeWorkspace(input);

		expect(JSON.stringify(input)).toBe(before);
		expect(normalizeWorkspace({ blocks: {} }).workspaceJson).toEqual({ blocks: {} });
		expect(normalizeWorkspace({}).originalIds.size).toBe(0);
	});
});

describe('restoreIds', () => {
	const level = (binding: { block: string; detail: { block: string; field: string }[] }) => ({
		blockDefs: [{ type: 'zoom_x_op' }],
		workspaceJson: {},
		bindings: [{ field: 'F', ...binding }]
	});
	const result = (): ZoomResponse => ({
		semantic: level({ block: 's1', detail: [{ block: 'b4', field: 'NUM' }] }),
		concept: level({
			block: 'c1',
			detail: [
				{ block: 'b1', field: 'NUM' },
				{ block: 'b9', field: 'NUM' }
			]
		})
	});

	it('maps Detail block ids back and leaves zoomed block ids alone', () => {
		const restored = restoreIds(
			result(),
			new Map([
				['b1', 'r'],
				['b4', 'times']
			])
		);

		expect(restored.semantic.bindings[0]).toEqual({
			block: 's1',
			field: 'F',
			detail: [{ block: 'times', field: 'NUM' }]
		});
		expect(restored.concept.bindings[0].block).toBe('c1');
		// An id the map doesn't know stays as it is.
		expect(restored.concept.bindings[0].detail.map((ref) => ref.block)).toEqual(['r', 'b9']);
	});

	it('does not change the result it is given', () => {
		const original = result();
		const before = JSON.stringify(original);

		restoreIds(original, new Map([['b4', 'times']]));

		expect(JSON.stringify(original)).toBe(before);
	});
});
