// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';

import { allBlocks } from '../../../src/zoom/saved-blocks.js';
import { buildStacks } from '../../../src/zoom/stacks.js';
import { parseZoomResponse } from '../../../src/zoom/zoom.js';

const block = (type: string, id: string, extra: Record<string, unknown> = {}) => ({
	type,
	id,
	...extra
});

const response = (
	semanticStacks: unknown,
	conceptStacks: unknown = [[block('zoom_x_c', 'c1')]]
) => ({
	semantic: { blockDefs: [{ type: 'zoom_x_a', message0: 'a' }], stacks: semanticStacks },
	concept: { blockDefs: [{ type: 'zoom_x_c', message0: 'c' }], stacks: conceptStacks }
});

const topOf = (raw: ReturnType<typeof response>, level: 'semantic' | 'concept') =>
	(raw[level] as unknown as { workspaceJson: { blocks: { blocks: unknown[] } } }).workspaceJson
		.blocks.blocks;

describe('buildStacks', () => {
	it('chains a stack with next, in order, and makes one top-level block per stack', () => {
		const raw = response([
			[block('zoom_x_a', 's1'), block('zoom_x_a', 's2'), block('zoom_x_a', 's3')],
			[block('zoom_x_a', 's4')]
		]);

		expect(buildStacks(raw)).toEqual([]);
		expect(topOf(raw, 'semantic')).toEqual([
			{
				type: 'zoom_x_a',
				id: 's1',
				next: {
					block: { type: 'zoom_x_a', id: 's2', next: { block: { type: 'zoom_x_a', id: 's3' } } }
				}
			},
			{ type: 'zoom_x_a', id: 's4' }
		]);
	});

	it('wraps the workspace the way Blockly saves it, and removes the stacks', () => {
		const raw = response([[block('zoom_x_a', 's1')]]);
		buildStacks(raw);

		expect(raw.semantic).not.toHaveProperty('stacks');
		expect((raw.semantic as unknown as { workspaceJson: unknown }).workspaceJson).toMatchObject({
			blocks: { languageVersion: 0 }
		});
	});

	it('puts a list in a statement input into a chain, and one object into a value input', () => {
		const raw = response([
			[
				block('zoom_x_a', 's1', {
					inputs: {
						DO: [block('zoom_x_a', 's2'), block('zoom_x_a', 's3')],
						COND: block('zoom_x_v', 's4')
					}
				})
			]
		]);

		expect(buildStacks(raw)).toEqual([]);
		const [first] = topOf(raw, 'semantic') as { inputs: Record<string, unknown> }[];
		expect(first.inputs.DO).toEqual({
			block: { type: 'zoom_x_a', id: 's2', next: { block: { type: 'zoom_x_a', id: 's3' } } }
		});
		expect(first.inputs.COND).toEqual({ block: { type: 'zoom_x_v', id: 's4' } });
	});

	it('leaves out an input whose list is empty: nothing runs inside it', () => {
		const raw = response([
			[block('zoom_x_a', 's1', { inputs: { DO: [], ELSE: [block('zoom_x_a', 's2')] } })]
		]);

		expect(buildStacks(raw)).toEqual([]);
		const [first] = topOf(raw, 'semantic') as { inputs: Record<string, unknown> }[];
		expect(Object.keys(first.inputs)).toEqual(['ELSE']);
	});

	it('keeps an input written the way Blockly saves it, and builds the stacks inside it', () => {
		const raw = response([
			[
				block('controls_if', 's1', {
					inputs: { DO0: { block: [block('zoom_x_a', 's2'), block('zoom_x_a', 's3')] } }
				})
			]
		]);

		expect(buildStacks(raw)).toEqual([]);
		expect(allBlocks({ blocks: { blocks: topOf(raw, 'semantic') } }).map((b) => b.id)).toEqual([
			's1',
			's2',
			's3'
		]);
	});

	it('keeps fields and other keys of a block, and treats a lone block as a stack of one', () => {
		const raw = response(
			[block('zoom_x_a', 's1', { fields: { NUM: 3 }, extraState: { a: 1 } })],
			[[block('zoom_x_c', 'c1')]]
		);

		expect(buildStacks(raw)).toEqual([]);
		expect(topOf(raw, 'semantic')).toEqual([
			{ type: 'zoom_x_a', id: 's1', fields: { NUM: 3 }, extraState: { a: 1 } }
		]);
	});

	it('does not change the input it was given beyond the level it builds', () => {
		const stack = [block('zoom_x_a', 's1'), block('zoom_x_a', 's2')];
		const raw = response([stack]);
		buildStacks(raw);
		expect(stack[0]).not.toHaveProperty('next');
	});

	it('leaves a level that has a workspaceJson and no stacks alone', () => {
		const level = {
			blockDefs: [],
			workspaceJson: { blocks: { languageVersion: 0, blocks: [] } }
		};
		const raw = { semantic: level, concept: structuredClone(level) };

		expect(buildStacks(raw)).toEqual([]);
		expect(raw.semantic).toEqual(level);
	});

	describe('problems, as messages for the model', () => {
		it('asks for stacks when a level has neither stacks nor a workspaceJson', () => {
			const raw = { semantic: { blockDefs: [] }, concept: { blockDefs: [], stacks: [[]] } };
			const problems = buildStacks(raw);
			expect(problems[0]).toContain('semantic: missing "stacks"');
		});

		it('reports stacks that are not a list', () => {
			expect(buildStacks(response({ a: 1 }))[0]).toBe(
				'semantic.stacks must be a list of stacks, each a list of blocks'
			);
		});

		it('reports an empty stack', () => {
			expect(buildStacks(response([[]]))).toContain(
				'semantic.stacks[0] is empty: a stack needs at least one block'
			);
		});

		it('reports a block with no type, with its place', () => {
			const problems = buildStacks(response([[block('zoom_x_a', 's1'), { id: 's2' }]]));
			expect(problems).toHaveLength(1);
			expect(problems[0]).toContain('semantic.stacks[0][1] has no "type"');
		});

		it('reports an input that is neither a block nor a list, and a typeless block inside one', () => {
			const raw = response([
				[block('zoom_x_a', 's1', { inputs: { DO: 5, NEXT: [{ id: 's2' }] } })]
			]);
			const problems = buildStacks(raw);
			expect(
				problems.some((p) => p.includes('semantic.stacks[0][0].inputs.DO must be a block'))
			).toBe(true);
			expect(
				problems.some((p) => p.includes('semantic.stacks[0][0].inputs.NEXT[0] has no "type"'))
			).toBe(true);
		});

		it('does not build a level that had problems', () => {
			const raw = response([[{ id: 's1' }]]);
			buildStacks(raw);
			expect(raw.semantic).toHaveProperty('stacks');
			expect(raw.semantic).not.toHaveProperty('workspaceJson');
		});
	});
});

describe('parseZoomResponse with the v2 prompt and stacks', () => {
	// Detail: one repeat of 10 with a print inside.
	const detail = {
		blocks: {
			languageVersion: 0,
			blocks: [
				{
					type: 'controls_repeat_ext',
					id: 'b1',
					inputs: {
						TIMES: { shadow: { type: 'math_number', id: 'b2', fields: { NUM: 10 } } },
						DO: { block: { type: 'text_print', id: 'b3' } }
					}
				}
			]
		}
	};
	const defs = [
		{ type: 'zoom_x_start', message0: 'start', previousStatement: null, nextStatement: null },
		{
			type: 'zoom_x_loop',
			message0: 'repeat {b2.NUM} times %1',
			args0: [{ type: 'input_statement', name: 'DO' }],
			previousStatement: null,
			nextStatement: null
		},
		{ type: 'zoom_x_show', message0: 'show it', previousStatement: null, nextStatement: null },
		{ type: 'zoom_x_done', message0: 'finish', previousStatement: null, nextStatement: null }
	];
	const written = (stacks: unknown) =>
		JSON.stringify({
			semantic: { blockDefs: defs, stacks },
			concept: {
				blockDefs: [{ type: 'zoom_x_concept', message0: 'do it' }],
				stacks: [[{ type: 'zoom_x_concept', id: 'c1' }]]
			}
		});

	it('builds the chain, the inner stack and the binding from a flat description', () => {
		const { result } = parseZoomResponse(
			written([
				[
					{ type: 'zoom_x_start', id: 's1' },
					{
						type: 'zoom_x_loop',
						id: 's2',
						inputs: { DO: [{ type: 'zoom_x_show', id: 's3' }] }
					},
					{ type: 'zoom_x_done', id: 's4' }
				]
			]),
			detail,
			'v2'
		);

		const top = (result.semantic.workspaceJson as { blocks: { blocks: { id: string }[] } }).blocks
			.blocks;
		expect(top).toHaveLength(1);
		expect(allBlocks(result.semantic.workspaceJson).map((b) => b.id)).toEqual([
			's1',
			's2',
			's3',
			's4'
		]);
		expect(result.semantic.bindings).toEqual([
			{ block: 's2', field: 'V2', detail: [{ block: 'b2', field: 'NUM' }] }
		]);
	});

	it('names stacks, not workspaceJson, in the errors it sends back', () => {
		const text = JSON.stringify({
			semantic: {
				blockDefs: [{ type: 'zoom_x_start', message0: 'start', nextStatement: null }],
				stacks: [
					[
						{
							type: 'zoom_x_start',
							id: 's1',
							next: { block: { type: 'zoom_x_missing', id: 's2' } }
						}
					]
				]
			},
			concept: {
				blockDefs: [{ type: 'zoom_x_concept', message0: 'do it' }],
				stacks: [[{ type: 'zoom_x_concept', id: 'c1' }]]
			}
		});

		expect(() => parseZoomResponse(text, detail, 'v2')).toThrow(
			/semantic\.stacks uses "zoom_x_missing"/
		);
	});

	it('fails as a schema error, in its own words, when a stack is malformed', () => {
		let thrown: unknown;
		try {
			parseZoomResponse(written([[]]), detail, 'v2');
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toMatchObject({ kind: 'schema' });
		expect((thrown as Error).message).toContain('semantic.stacks[0] is empty');
	});

	it('does not touch the output of a prompt that writes a workspaceJson', () => {
		const level = (type: string) => ({
			blockDefs: [{ type, message0: 'x' }],
			stacks: [[{ type, id: 'x1' }]],
			workspaceJson: { blocks: { languageVersion: 0, blocks: [] } }
		});
		const { result } = parseZoomResponse(
			JSON.stringify({ semantic: level('zoom_x_a'), concept: level('zoom_x_c') }),
			detail,
			'v1'
		);
		expect(allBlocks(result.semantic.workspaceJson)).toEqual([]);
	});
});
