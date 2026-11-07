// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { allBlocks } from '@szrs/llm-proxy/zoom/saved-blocks.js';
import { programs, type ProgramSource } from './programs.js';
import { robot, robotBlockDefs } from './robot.js';

/** Size tiers by block count (plan section 9.2). The plan's "about" ranges leave gaps; these close them. */
export type Tier = 'S' | 'M' | 'L' | 'XL';

export function tierOf(blocks: number): Tier {
	if (blocks < 20) return 'S';
	if (blocks < 60) return 'M';
	if (blocks < 200) return 'L';
	return 'XL';
}

export interface CorpusProgram extends ProgramSource {
	tier: Tier;
	blocks: number;
	topLevelStacks: number;
	/** Where it came from, for the record. */
	provenance: string;
	/** Block definitions a headless workspace needs to load it (a custom block set). */
	blockDefs?: Record<string, unknown>[];
	/** For a composition, how many independent programs it holds (D15: at least this many concepts). */
	composedOf?: number;
	/** Which slice of the corpus it belongs to. */
	slice: 'core' | 'composition' | 'custom-block-set';
}

function describe(source: ProgramSource, extra: Partial<CorpusProgram> = {}): CorpusProgram {
	const workspaceJson = source.workspace as unknown as Record<string, unknown>;
	const blocks = allBlocks(workspaceJson).length;
	const top = (source.workspace.blocks.blocks as unknown[]).length;
	return {
		...source,
		tier: tierOf(blocks),
		blocks,
		topLevelStacks: top,
		provenance: 'hand-written for this repository, 2026-11',
		slice: source.composedOf === undefined ? 'core' : 'composition',
		...extra
	};
}

/** The corpus: 20 programs. Frozen once the baseline has run on it; a new program is a new version. */
export const corpus: CorpusProgram[] = [
	...programs.map((source) => describe(source)),
	describe(
		{
			id: 'robot',
			title: 'Toy robot (custom block set)',
			description:
				'Three event handlers in a block set with its own types, categories and colours; no core block.',
			expectedConcepts: [3, 3],
			workspace: robot
		},
		{ blockDefs: robotBlockDefs, slice: 'custom-block-set' }
	)
];

export function findProgram(id: string): CorpusProgram {
	const found = corpus.find((program) => program.id === id);
	if (!found) throw new Error(`Unknown corpus program "${id}"`);
	return found;
}
