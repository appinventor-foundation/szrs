// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

// Shared by the baseline tests: a fake model that answers from a script, and a valid zoom of `countdown`.
import { findProgram } from '../../../baseline/corpus/index.js';
import { prepareProgram } from '../../../baseline/prepare.js';
import { runOne, type CompleteFn, type Completion } from '../../../baseline/runner.js';
import { allBlocks } from '@szrs/llm-proxy/zoom/saved-blocks.js';

/** The parts of a zoom the tests edit. */
export interface ZoomJson {
	plan: { concepts: { id: string; stacks: string[]; operations: string[] }[] };
	semantic: {
		blockDefs: Record<string, unknown>[];
		workspaceJson: { blocks: { blocks: Record<string, unknown>[] } };
		bindings: { detail: { block: string }[] }[];
	};
}

export const usage = { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 };

/** A valid zoom of `countdown`: one Semantic block and one Concept block, a plan, and one binding. */
export function validZoom(options: { semanticLabel?: string; withBinding?: boolean } = {}): string {
	const prepared = prepareProgram(findProgram('countdown'));
	const blocks = allBlocks(prepared.workspaceJson);
	const stack = blocks[0].id!;
	const number = blocks.find((block) => block.type === 'math_number' && block.fields?.NUM === 10)!;
	const level = (type: string, label: string, id: string, bound: boolean) => ({
		blockDefs: [
			{
				type,
				message0: bound ? `${label} %1` : label,
				...(bound && { args0: [{ type: 'field_number', name: 'START', value: 10 }] }),
				previousStatement: null,
				nextStatement: null
			}
		],
		workspaceJson: { blocks: { languageVersion: 0, blocks: [{ type, id }] } },
		bindings:
			bound && options.withBinding
				? [{ block: id, field: 'START', detail: [{ block: number.id, field: 'NUM' }] }]
				: []
	});
	return JSON.stringify({
		plan: { purpose: 'counts down', concepts: [{ id: 'c1', stacks: [stack], operations: ['s1'] }] },
		semantic: level(
			'zoom_countdown_count_down',
			options.semanticLabel ?? 'count down to zero',
			's1',
			true
		),
		concept: level('zoom_countdown_countdown_concept', 'run a countdown', 'c1', false)
	});
}

export const ok = (text: string, extra: Partial<Completion & { ok: true }> = {}): Completion => ({
	ok: true,
	text,
	finishReason: 'stop',
	usage,
	firstTokenMs: 200,
	...extra
});

export function script(...answers: Completion[]): { complete: CompleteFn; requests: string[][] } {
	const requests: string[][] = [];
	let at = 0;
	return {
		requests,
		complete: async (request) => {
			requests.push(request.messages.map((message) => message.content));
			return answers[Math.min(at++, answers.length - 1)];
		}
	};
}

export const run = (complete: CompleteFn, promptId = 'v1') =>
	runOne({
		runId: 'test-run',
		prepared: prepareProgram(findProgram('countdown')),
		promptId,
		alias: 'a',
		sample: 1,
		complete
	});
