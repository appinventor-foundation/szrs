// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { allBlocks, isRecord, type SavedBlock } from './saved-blocks.js';

/** One top-level stack of the program. */
export interface OutlineStack {
	/** Absent when the block was saved without an id. */
	id?: string;
	type: string;
	/** A short name for the stack, when its top block has one. */
	descriptor?: string;
	/** Every block in the stack, including nested, shadow and following blocks. */
	blocks: number;
}

export interface Outline {
	blocks: number;
	stacks: OutlineStack[];
}

/** What a descriptor function can look up besides the block itself. */
export interface DescribeContext {
	/** The name of a variable, from the workspace's variable list. */
	variableName(id: string): string | undefined;
}

/**
 * Names a top-level block for the outline, or returns undefined to leave it
 * to the default. A host can pass its own to name blocks whose identity is
 * not in a plain field. Return an empty string for "no name".
 */
export type DescribeBlock = (block: SavedBlock, context: DescribeContext) => string | undefined;

export interface OutlineOptions {
	describeBlock?: DescribeBlock;
}

const MAX_DESCRIPTOR_LENGTH = 40;
const MAX_EXTRA_STATE_VALUES = 3;

/**
 * The shape of a (normalized) workspace: how many blocks it has and what its
 * top-level stacks are. Pure and deterministic, so it can be put in the prompt.
 * Nothing here knows any block type: hosts with their own blocks get the same
 * treatment as core Blockly.
 */
export function buildOutline(
	workspaceJson: Record<string, unknown>,
	options: OutlineOptions = {}
): Outline {
	const variableNames = new Map<string, string>();
	if (Array.isArray(workspaceJson.variables)) {
		for (const variable of workspaceJson.variables) {
			if (
				isRecord(variable) &&
				typeof variable.id === 'string' &&
				typeof variable.name === 'string'
			) {
				variableNames.set(variable.id, variable.name);
			}
		}
	}
	const context: DescribeContext = { variableName: (id) => variableNames.get(id) };

	const top = isRecord(workspaceJson.blocks) ? workspaceJson.blocks.blocks : undefined;
	const stacks: OutlineStack[] = [];
	for (const block of Array.isArray(top) ? top : []) {
		if (!isRecord(block) || typeof block.type !== 'string') continue;
		const saved = block as unknown as SavedBlock;
		const descriptor = tidy(
			options.describeBlock?.(saved, context) ?? defaultDescriptor(saved, context)
		);
		stacks.push({
			...(saved.id === undefined ? {} : { id: saved.id }),
			type: saved.type,
			...(descriptor === '' ? {} : { descriptor }),
			blocks: allBlocks({ blocks: { blocks: [saved] } }).length
		});
	}
	return { blocks: stacks.reduce((sum, stack) => sum + stack.blocks, 0), stacks };
}

/**
 * The outline as text for the user message. The order of stacks is the order
 * they were saved in, which says nothing about the program, and the text says
 * so, so the model does not read a sequence into it.
 */
export function describeOutline(
	workspaceJson: Record<string, unknown>,
	options?: OutlineOptions
): string {
	const outline = buildOutline(workspaceJson, options);
	const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
	const lines = [
		`Program size: ${plural(outline.blocks, 'block')}, ${plural(outline.stacks.length, 'top-level stack')}.`
	];
	if (outline.stacks.length > 0) {
		lines.push('Top-level stacks (in no particular order; their order and position mean nothing):');
		for (const stack of outline.stacks) {
			const name = [stack.type, stack.descriptor].filter(Boolean).join(', ');
			lines.push(`- ${stack.id ?? '(no id)'}: ${name} (${plural(stack.blocks, 'block')})`);
		}
	}
	return lines.join('\n');
}

// The generic descriptor: what a top block calls itself in its own saved
// state. Fields first (a NAME field, else the first text or dropdown value, or
// the name of a variable it refers to), then the string values of its
// extraState, which is where some hosts keep what a block is about.
function defaultDescriptor(block: SavedBlock, context: DescribeContext): string {
	const parts = [fromFields(block, context), fromExtraState(block)].filter(Boolean);
	return [...new Set(parts)].join(' ');
}

function fromFields(block: SavedBlock, context: DescribeContext): string {
	const fields = block.fields;
	if (!isRecord(fields)) return '';
	const entries = Object.entries(fields);
	const named = entries.find(([key, value]) => key === 'NAME' && typeof value === 'string');
	if (named && (named[1] as string).trim() !== '') return named[1] as string;

	for (const [, value] of entries) {
		if (typeof value === 'string' && value.trim() !== '') return value;
		// A variable field holds a reference to the workspace's variable list.
		if (isRecord(value) && typeof value.id === 'string') {
			const name = context.variableName(value.id);
			if (name !== undefined) return name;
		}
	}
	return '';
}

function fromExtraState(block: SavedBlock): string {
	if (!isRecord(block.extraState)) return '';
	return Object.values(block.extraState)
		.filter((value): value is string => typeof value === 'string' && value.trim() !== '')
		.slice(0, MAX_EXTRA_STATE_VALUES)
		.join(', ');
}

// One line, bounded: a descriptor comes from user data and goes into a prompt.
function tidy(text: string): string {
	const oneLine = text.replace(/\s+/g, ' ').trim();
	return oneLine.length > MAX_DESCRIPTOR_LENGTH
		? `${oneLine.slice(0, MAX_DESCRIPTOR_LENGTH - 1)}…`
		: oneLine;
}
