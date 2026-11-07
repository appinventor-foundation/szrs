// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';

import { allBlocks } from '@szrs/llm-proxy/zoom/saved-blocks.js';
import { corpus, findProgram, tierOf } from '../../baseline/corpus/index.js';
import { loadsInBlockly } from '../../baseline/headless.js';
import { prepareProgram, programHash } from '../../baseline/prepare.js';

describe('corpus', () => {
	it('has twenty programs with unique ids', () => {
		expect(corpus).toHaveLength(20);
		expect(new Set(corpus.map((program) => program.id)).size).toBe(20);
	});

	it('covers every size tier up to L, a composition slice and a custom block set', () => {
		const tiers = new Set(corpus.map((program) => program.tier));
		for (const tier of ['S', 'M', 'L']) expect(tiers.has(tier as 'S')).toBe(true);
		expect(corpus.filter((program) => program.slice === 'composition')).toHaveLength(2);
		expect(corpus.filter((program) => program.slice === 'custom-block-set')).toHaveLength(1);
	});

	it('puts block counts in the tier boundaries', () => {
		expect([tierOf(19), tierOf(20), tierOf(59), tierOf(60), tierOf(199), tierOf(200)]).toEqual([
			'S',
			'M',
			'M',
			'L',
			'L',
			'XL'
		]);
		for (const program of corpus) expect(program.tier).toBe(tierOf(program.blocks));
	});

	it('records a sensible range of expected concepts, and at least k stacks for a composition of k', () => {
		for (const program of corpus) {
			const [min, max] = program.expectedConcepts;
			expect(min).toBeGreaterThanOrEqual(1);
			expect(max).toBeGreaterThanOrEqual(min);
			if (program.composedOf !== undefined) {
				expect(program.topLevelStacks).toBeGreaterThanOrEqual(program.composedOf);
				expect(min).toBeGreaterThanOrEqual(program.composedOf);
			}
		}
	});

	it('has no core block in the custom block set', () => {
		const robot = findProgram('robot');
		expect(
			allBlocks(robot.workspace as never).every((block) => block.type.startsWith('robot_'))
		).toBe(true);
	});

	it.each(corpus.map((program) => [program.id, program] as const))(
		'%s loads in a headless Blockly workspace and keeps its block count',
		(_id, program) => {
			const loaded = loadsInBlockly({
				blockDefs: program.blockDefs ?? [],
				workspaceJson: program.workspace as never
			});
			expect(loaded.error).toBeUndefined();
			expect(loaded.ok).toBe(true);
			expect(loaded.blocks).toBe(program.blocks);
		}
	);

	it('hashes a program by its content', () => {
		expect(programHash(findProgram('fizzbuzz'))).toBe(programHash(findProgram('fizzbuzz')));
		expect(programHash(findProgram('fizzbuzz'))).not.toBe(programHash(findProgram('countdown')));
	});
});

describe('prepareProgram', () => {
	it('gives every block an id and the canonical names the proxy uses', () => {
		const { workspaceJson } = prepareProgram(findProgram('dice-game'));
		const blocks = allBlocks(workspaceJson);
		expect(blocks.length).toBe(findProgram('dice-game').blocks);
		expect(blocks.every((block) => /^b\d+$/.test(block.id ?? ''))).toBe(true);
		expect(JSON.stringify(workspaceJson)).not.toMatch(/"x":|"y":/);
	});
});
