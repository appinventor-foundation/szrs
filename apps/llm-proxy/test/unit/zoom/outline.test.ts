// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';

import { buildOutline, describeOutline } from '../../../src/zoom/outline.js';

const workspace = (blocks: unknown[], extra: Record<string, unknown> = {}) => ({
	blocks: { languageVersion: 0, blocks },
	...extra
});

describe('describeOutline', () => {
	it('describes a single stack, with nested, shadow and following blocks counted', () => {
		const text = describeOutline(
			workspace([
				{
					type: 'controls_repeat_ext',
					id: 'b1',
					inputs: {
						TIMES: { shadow: { type: 'math_number', id: 'b2', fields: { NUM: 5 } } },
						DO: {
							block: {
								type: 'text_print',
								id: 'b3',
								next: { block: { type: 'text_print', id: 'b4' } }
							}
						}
					}
				}
			])
		);

		expect(text).toBe(
			[
				'Program size: 4 blocks, 1 top-level stack.',
				'Top-level stacks (in no particular order; their order and position mean nothing):',
				'- b1: controls_repeat_ext (4 blocks)'
			].join('\n')
		);
	});

	it('lists several stacks with a descriptor for the ones that have a name', () => {
		const text = describeOutline(
			workspace(
				[
					{ type: 'procedures_defnoreturn', id: 'b1', fields: { NAME: 'resetGame' } },
					{ type: 'controls_repeat_ext', id: 'b2' },
					{ type: 'variables_set', id: 'b3', fields: { VAR: { id: 'v1' } } }
				],
				{ variables: [{ name: 'score', id: 'v1' }] }
			)
		);

		expect(text).toContain('Program size: 3 blocks, 3 top-level stacks.');
		expect(text).toContain('- b1: procedures_defnoreturn, resetGame (1 block)');
		expect(text).toContain('- b2: controls_repeat_ext (1 block)');
		expect(text).toContain('- b3: variables_set, score (1 block)');
	});

	it('lists a stack without an id, without an id', () => {
		const outline = buildOutline(workspace([{ type: 'text_print' }]));

		expect(outline.stacks).toEqual([{ type: 'text_print', blocks: 1 }]);
		expect(describeOutline(workspace([{ type: 'text_print' }]))).toContain(
			'- (no id): text_print (1 block)'
		);
	});

	it('handles an empty workspace', () => {
		expect(describeOutline({})).toBe('Program size: 0 blocks, 0 top-level stacks.');
		expect(describeOutline(workspace([]))).toBe('Program size: 0 blocks, 0 top-level stacks.');
	});

	it('is the same whatever order the stacks were saved in, apart from the order of the lines', () => {
		const a = { type: 'procedures_defnoreturn', id: 'b1', fields: { NAME: 'a' } };
		const b = { type: 'text_print', id: 'b2' };

		const forward = buildOutline(workspace([a, b]));
		const backward = buildOutline(workspace([b, a]));

		expect(forward.blocks).toBe(backward.blocks);
		expect([...forward.stacks].sort((x, y) => x.type.localeCompare(y.type))).toEqual(
			[...backward.stacks].sort((x, y) => x.type.localeCompare(y.type))
		);
	});
});

describe('descriptors', () => {
	const first = (
		blocks: unknown[],
		extra?: Record<string, unknown>,
		options?: Parameters<typeof buildOutline>[1]
	) => buildOutline(workspace(blocks, extra), options).stacks[0].descriptor;

	it('prefers a NAME field, then the first text value', () => {
		expect(first([{ type: 'x', fields: { MODE: 'EQ', NAME: 'go' } }])).toBe('go');
		expect(first([{ type: 'x', fields: { NUM: 4, TEXT: 'hello' } }])).toBe('hello');
	});

	it('ignores numbers, empty text and unknown variables', () => {
		expect(first([{ type: 'x', fields: { NUM: 4, TEXT: '  ' } }])).toBeUndefined();
		expect(first([{ type: 'x', fields: { VAR: { id: 'gone' } } }])).toBeUndefined();
	});

	it('reads string values from extraState, and nothing else', () => {
		expect(
			first([
				{ type: 'x', extraState: { component: 'Button1', event: 'Click', params: ['a'], n: 3 } }
			])
		).toBe('Button1, Click');
		expect(first([{ type: 'x', extraState: '<mutation/>' }])).toBeUndefined();
	});

	it('does not repeat a name that fields and extraState both give', () => {
		expect(first([{ type: 'x', fields: { NAME: 'go' }, extraState: { name: 'go' } }])).toBe('go');
	});

	it('is one bounded line', () => {
		const text = first([{ type: 'x', fields: { TEXT: `a\nb ${'c'.repeat(80)}` } }]) as string;

		expect(text).not.toContain('\n');
		expect(text.length).toBeLessThanOrEqual(40);
		expect(text.endsWith('…')).toBe(true);
	});

	it('lets a host name blocks, and falls back to the default when it does not', () => {
		const describeBlock = (block: { type: string }) =>
			block.type === 'host_event' ? 'Button1.Click' : undefined;
		const outline = buildOutline(
			workspace([
				{ type: 'host_event', id: 'b1', fields: { NAME: 'ignored' } },
				{ type: 'procedures_defnoreturn', id: 'b2', fields: { NAME: 'go' } }
			]),
			{ describeBlock }
		);

		expect(outline.stacks.map((stack) => stack.descriptor)).toEqual(['Button1.Click', 'go']);
	});

	it('lets a host say a block has no name', () => {
		expect(
			first([{ type: 'x', fields: { NAME: 'go' } }], undefined, { describeBlock: () => '' })
		).toBeUndefined();
	});

	it('depends on no block type: a custom block set is described like core blocks', () => {
		const text = describeOutline(
			workspace([
				{ type: 'robot_when_bumped', id: 'b1', fields: { SENSOR: 'front' } },
				{
					type: 'robot_drive',
					id: 'b2',
					inputs: { SPEED: { shadow: { type: 'robot_speed', id: 'b3' } } }
				}
			])
		);

		expect(text).toContain('- b1: robot_when_bumped, front (1 block)');
		expect(text).toContain('- b2: robot_drive (2 blocks)');
	});
});
