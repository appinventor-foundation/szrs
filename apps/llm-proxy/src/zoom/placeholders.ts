// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { allBlocks, byId, isRecord, nestedHolders, type SavedBlock } from './saved-blocks.js';

/**
 * Turns value placeholders in a level's block definitions into fields and
 * bindings, for prompts whose output format has no `bindings` (v2 on).
 *
 * The model writes the value a user can edit as a reference in the label,
 * `{b12.NUM}` (the NUM field of Detail block b12; `{b3.NUM|b9.NUM}` when one
 * value lives on several blocks). This module gives each reference a
 * field_number or field_input arg (by the kind of the Detail value), puts its
 * `%N` in the label, and adds the binding. After it the level has the shape of
 * every other prompt's output, so the schema, the checks and the plugin do not
 * know the difference.
 *
 * Works on the parsed JSON, in place, before it is validated. Returns the
 * repairs made and the problems found, as messages for the model; anything it
 * does not recognise is left for the schema and the checks to report.
 */
export function expandPlaceholders(
	raw: unknown,
	detailWorkspace: Record<string, unknown>
): { repairs: string[]; problems: string[] } {
	const repairs: string[] = [];
	const problems: string[] = [];
	if (!isRecord(raw)) return { repairs, problems };
	const detail = byId(allBlocks(detailWorkspace));

	for (const name of ['semantic', 'concept']) {
		const level = raw[name];
		if (!isRecord(level) || !Array.isArray(level.blockDefs)) continue;
		const blocks = isRecord(level.workspaceJson) ? allBlocks(level.workspaceJson) : [];
		const bindings: unknown[] = Array.isArray(level.bindings) ? level.bindings : [];
		const unused = new Set<unknown>();

		for (const def of level.blockDefs.filter(isRecord)) {
			if (typeof def.type !== 'string') continue;
			const type = def.type;
			const where = `${name}.blockDefs "${type}"`;
			const found = placeholdersIn(def);

			for (const key of found.misplaced) {
				problems.push(
					`${where}: "${key}" has a {…} reference, but references only work in the message ("message0"). Write the label as plain text and put the reference in message0`
				);
			}
			if (found.messages.length === 0) continue;

			const users = blocks.filter((block) => block.type === type);
			if (users.length === 0) {
				// Nothing shows this definition, so its references bind nothing: drop it.
				unused.add(def);
				repairs.push(
					`${where} dropped: it has {…} references and no block in ${name}.workspaceJson uses it`
				);
				continue;
			}
			if (users.length > 1) {
				problems.push(
					`${where} has {…} references but is used by ${users.length} blocks in ${name}.workspaceJson; a block type with references must be used by exactly one block. Define one type for each block that shows a value`
				);
				continue;
			}
			const [user] = users;
			if (user.id === undefined) {
				problems.push(`${where}: the block of this type in ${name}.workspaceJson has no "id"`);
				continue;
			}

			for (const message of found.messages) {
				const args = Array.isArray(def[`args${message.n}`])
					? (def[`args${message.n}`] as unknown[])
					: [];
				const taken = new Set(args.filter(isRecord).map((arg) => arg.name));
				let text = message.text;
				for (const ref of message.refs) {
					const targets = resolve(ref.targets, detail, where, repairs, problems);
					if (!targets) continue;
					const kind = targets.kind;
					let field = `V${args.length + 1}`;
					for (let i = 1; taken.has(field); i++) field = `V${args.length + 1 + i}`;
					taken.add(field);
					args.push(
						kind === 'number'
							? { type: 'field_number', name: field, value: targets.value }
							: { type: 'field_input', name: field, text: targets.value }
					);
					text = text.replace(ref.source, `%${args.length}`);
					bindings.push({
						block: user.id,
						field,
						detail: targets.refs
					});
				}
				def[`message${message.n}`] = text;
				def[`args${message.n}`] = args;
			}
		}
		if (unused.size > 0) level.blockDefs = level.blockDefs.filter((def) => !unused.has(def));
		level.bindings = bindings;
	}
	return { repairs, problems };
}

interface Reference {
	source: string;
	targets: { block: string; field: string }[];
}

interface FoundMessage {
	n: string;
	text: string;
	refs: Reference[];
}

const REFERENCE = /\{([^{}]*)\}/g;
const TARGET = /^(b\d+)\.([A-Za-z0-9_]+)$/;

/** Parses the inside of `{…}`: `b3.NUM` or `b3.NUM|b9.NUM`. Anything else is not a reference. */
function parseTargets(inner: string): Reference['targets'] | null {
	const targets: Reference['targets'] = [];
	for (const part of inner.split('|')) {
		const match = TARGET.exec(part.trim());
		if (!match) return null;
		targets.push({ block: match[1], field: match[2] });
	}
	return targets;
}

function referencesIn(text: string): Reference[] {
	return [...text.matchAll(REFERENCE)].flatMap((match): Reference[] => {
		const targets = parseTargets(match[1]);
		return targets ? [{ source: match[0], targets }] : [];
	});
}

/** The messages of a block definition that hold references, and the other keys that do. */
function placeholdersIn(def: Record<string, unknown>): {
	messages: FoundMessage[];
	misplaced: string[];
} {
	const messages: FoundMessage[] = [];
	const misplaced: string[] = [];
	for (const [key, value] of Object.entries(def)) {
		if (typeof value !== 'string') continue;
		const refs = referencesIn(value);
		if (refs.length === 0) continue;
		const n = /^message(\d+)$/.exec(key)?.[1];
		if (n === undefined) misplaced.push(key);
		else messages.push({ n, text: value, refs });
	}
	return { messages, misplaced };
}

type Resolved =
	| { kind: 'number'; value: number; refs: Reference['targets'] }
	| { kind: 'text'; value: string; refs: Reference['targets'] };

/**
 * Looks up every Detail field a reference names. The first one gives the value
 * and the kind of field, and the others must agree with it.
 */
function resolve(
	targets: Reference['targets'],
	detail: Map<string, SavedBlock>,
	where: string,
	repairs: string[],
	problems: string[]
): Resolved | undefined {
	const refs: Reference['targets'] = [];
	const values: unknown[] = [];
	for (const target of targets) {
		const ref = `{${target.block}.${target.field}}`;
		const block = detail.get(target.block);
		if (!block) {
			problems.push(
				`${where}: ${ref}: the Detail workspace has no block with id "${target.block}"`
			);
			return undefined;
		}
		let holder = block;
		if (block.fields?.[target.field] === undefined) {
			const nested = nestedHolders(block, target.field).filter((candidate) => candidate.id);
			if (nested.length === 1) {
				holder = nested[0];
				repairs.push(
					`${where}: ${ref} moved from ${block.type} "${block.id}" to the ${holder.type} "${holder.id}" inside it, which holds ${target.field}`
				);
			} else {
				const hint =
					nested.length === 0
						? ''
						: `. "${target.field}" is on these blocks inside it: ${nested.map((candidate) => `"${candidate.id}" (${candidate.type})`).join(', ')}; reference the one holding this value`;
				problems.push(
					`${where}: ${ref}: Detail block "${target.block}" (${block.type}) has no field "${target.field}"${hint}`
				);
				return undefined;
			}
		}
		refs.push({ block: holder.id ?? target.block, field: target.field });
		values.push(holder.fields?.[target.field]);
	}

	const [first] = values;
	const kind = typeof first === 'number' ? 'number' : typeof first === 'string' ? 'text' : null;
	if (kind === null) {
		problems.push(
			`${where}: {${targets[0].block}.${targets[0].field}} holds a ${isRecord(first) ? 'variable or object' : typeof first} value, and only numbers and text can be referenced. Describe it in words instead`
		);
		return undefined;
	}
	if (values.some((value) => typeof value !== typeof first)) {
		problems.push(
			`${where}: the fields in {${targets.map((t) => `${t.block}.${t.field}`).join('|')}} hold values of different kinds (${values.map((value) => typeof value).join(', ')}); one reference can only list fields of the same kind`
		);
		return undefined;
	}
	return kind === 'number'
		? { kind, value: first as number, refs }
		: { kind, value: first as string, refs };
}
