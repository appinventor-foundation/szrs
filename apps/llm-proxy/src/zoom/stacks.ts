// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { isRecord } from './saved-blocks.js';

/**
 * Builds each level's `workspaceJson` from the `stacks` a model wrote, for
 * prompts whose output format has them (v2 on).
 *
 * The model writes every stack as a flat list of blocks in order, and a
 * statement input (the inside of a loop or a condition) as a list too:
 *
 *   "stacks": [[ { "type": "zoom_x_a", "id": "s1" }, { "type": "zoom_x_b", "id": "s2" } ]]
 *
 * This module chains each list with `next` and puts each input's block in
 * `{ "block": … }`, so the model never has to balance the braces of a deeply
 * nested chain (the first smoke run of v2 failed on exactly that: two models
 * miscounted the braces of nested `next`). An empty list in an input means
 * nothing runs inside it, and the input is left out. A single block in an input is a
 * value block. An input already written in Blockly's own form,
 * `{ "block": … }` or `{ "shadow": … }`, is kept, and its blocks are converted
 * the same way.
 *
 * Works on the parsed JSON, in place, before it is repaired or validated, and
 * returns the problems found as messages for the model. A level with no
 * `stacks` but a `workspaceJson` is left as it is.
 */
export function buildStacks(raw: unknown): string[] {
	const problems: string[] = [];
	if (!isRecord(raw)) return problems;

	for (const name of ['semantic', 'concept']) {
		const level = raw[name];
		if (!isRecord(level)) continue;
		if (level.stacks === undefined) {
			if (level.workspaceJson === undefined) {
				problems.push(
					`${name}: missing "stacks": a list of stacks, each a list of blocks in order, for example [[{"type": "zoom_x_a", "id": "s1"}]]`
				);
			}
			continue;
		}
		if (!Array.isArray(level.stacks)) {
			problems.push(`${name}.stacks must be a list of stacks, each a list of blocks`);
			continue;
		}

		const before = problems.length;
		const top = level.stacks.map((stack, i) => {
			const path = `${name}.stacks[${i}]`;
			// A single block is a stack of one.
			const blocks = Array.isArray(stack) ? stack : [stack];
			return chain(blocks, path, problems);
		});
		if (problems.length > before) continue;

		level.workspaceJson = { blocks: { languageVersion: 0, blocks: top.filter(isRecord) } };
		delete level.stacks;
	}
	return problems;
}

/** Links `blocks` into one stack with `next`, and returns its first block. */
function chain(
	blocks: unknown[],
	path: string,
	problems: string[]
): Record<string, unknown> | undefined {
	if (blocks.length === 0) {
		// Only a top-level stack can get here empty (an empty input list is left out above).
		problems.push(`${path} is empty: a stack needs at least one block`);
		return undefined;
	}
	const built = blocks.map((block, i) => toBlock(block, `${path}[${i}]`, problems));
	for (let i = built.length - 2; i >= 0; i--) {
		const block = built[i];
		const following = built[i + 1];
		if (block && following) block.next = { block: following };
	}
	return built[0];
}

function toBlock(
	entry: unknown,
	path: string,
	problems: string[]
): Record<string, unknown> | undefined {
	if (!isRecord(entry) || typeof entry.type !== 'string') {
		problems.push(
			`${path} has no "type". Every block is an object like {"type": "zoom_x_a", "id": "s1"}`
		);
		return undefined;
	}
	const block: Record<string, unknown> = { ...entry };
	if (isRecord(entry.inputs)) {
		const inputs: Record<string, unknown> = {};
		for (const [input, value] of Object.entries(entry.inputs)) {
			// An empty list says there is nothing inside: the input is simply left out.
			if (Array.isArray(value) && value.length === 0) continue;
			inputs[input] = toInput(value, `${path}.inputs.${input}`, problems);
		}
		block.inputs = inputs;
	}
	return block;
}

function toInput(value: unknown, path: string, problems: string[]): unknown {
	if (Array.isArray(value)) return { block: chain(value, path, problems) };
	if (isRecord(value) && (value.block !== undefined || value.shadow !== undefined)) {
		const converted: Record<string, unknown> = { ...value };
		for (const key of ['block', 'shadow']) {
			const inner = value[key];
			if (inner === undefined) continue;
			converted[key] = Array.isArray(inner)
				? chain(inner, `${path}.${key}`, problems)
				: toBlock(inner, `${path}.${key}`, problems);
		}
		return converted;
	}
	if (isRecord(value) && typeof value.type === 'string') {
		return { block: toBlock(value, path, problems) };
	}
	problems.push(`${path} must be a block, or a list of blocks that run one after another`);
	return value;
}
