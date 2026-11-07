import {
	ZOOM_EDITABLE_FIELD_TYPES,
	type ZoomArg,
	type ZoomBlockDef,
	type ZoomLevel,
	type ZoomResponse
} from '@szrs/llm-proxy-contracts';

import {
	allBlocks,
	blockLinks,
	byId,
	isRecord,
	nestedHolders,
	type SavedBlock
} from './saved-blocks.js';

/**
 * Checks a zoom result against the Detail workspace it was made from: each
 * zoomed workspace only uses zoom_ block types its level defines, and each
 * binding links an editable field to existing Detail fields of the same
 * kind. Returns the problems found, as messages for the model.
 */
export function checkZoomResult(
	result: ZoomResponse,
	detailWorkspace: Record<string, unknown>
): string[] {
	const detail = byId(allBlocks(detailWorkspace));
	return [
		...checkLevel('semantic', result.semantic, detail),
		...checkLevel('concept', result.concept, detail)
	];
}

function checkLevel(name: string, level: ZoomLevel, detail: Map<string, SavedBlock>): string[] {
	const errors: string[] = [];
	const defs = new Map(level.blockDefs.map((def) => [def.type, def]));
	const blocks = allBlocks(level.workspaceJson);

	// Blockly refuses to load a block into an input its definition doesn't
	// have, or after a block without nextStatement. Built-in blocks aren't
	// checked: their shapes aren't known here.
	for (const block of blocks) {
		const def = defs.get(block.type);
		if (!def) {
			if (block.type.startsWith('zoom_')) {
				errors.push(
					`${name}.workspaceJson uses "${block.type}", which ${name}.blockDefs doesn't define`
				);
			}
			continue;
		}
		const at = `${name}.workspaceJson: block "${block.id ?? '?'}" (${block.type})`;
		for (const input of Object.keys(block.inputs ?? {})) {
			const arg = findArg(def, input);
			if (arg?.type !== 'input_value' && arg?.type !== 'input_statement') {
				errors.push(
					`${at} puts a block in input "${input}", but its definition has no input_value or input_statement named "${input}". Add {"type": "input_statement", "name": "${input}"} (or input_value) to its args and a %N for it in its message, or remove the input`
				);
			}
		}
		if (block.next !== undefined && !('nextStatement' in def)) {
			errors.push(
				`${at} has a block after it, but its definition has no "nextStatement". Add "nextStatement": null to its definition, or remove "next"`
			);
		}
	}

	errors.push(...checkConnections(name, level, defs));

	const zoomed = byId(blocks);
	level.bindings.forEach((binding, i) => {
		const where = `${name}.bindings[${i}]`;
		const block = zoomed.get(binding.block);
		if (!block) {
			errors.push(`${where}: ${name}.workspaceJson has no block with id "${binding.block}"`);
			return;
		}
		const arg = findArg(defs.get(block.type), binding.field);
		if (!arg || !(ZOOM_EDITABLE_FIELD_TYPES as readonly string[]).includes(arg.type)) {
			errors.push(
				`${where}: block "${binding.block}" (${block.type}) has no field_number, field_input or field_dropdown named "${binding.field}"`
			);
			return;
		}
		for (const ref of binding.detail) {
			const target = detail.get(ref.block);
			if (!target) {
				errors.push(`${where}: the Detail workspace has no block with id "${ref.block}"`);
				continue;
			}
			const value = target.fields?.[ref.field];
			if (value === undefined) {
				const holders = nestedHolders(target, ref.field).filter((holder) => holder.id);
				const hint =
					holders.length === 0
						? ''
						: holders.length === 1
							? `. "${ref.field}" is on block "${holders[0].id}" (${holders[0].type}) inside it; bind that block instead`
							: `. "${ref.field}" is on these blocks inside it: ${holders.map((holder) => `"${holder.id}" (${holder.type})`).join(', ')}; bind the one(s) holding this value`;
				errors.push(
					`${where}: Detail block "${ref.block}" (${target.type}) has no field "${ref.field}"${hint}`
				);
				continue;
			}
			const problem = kindMismatch(arg, value);
			if (problem) {
				errors.push(`${where}: ${problem} (Detail block "${ref.block}", field "${ref.field}")`);
			}
		}
	});

	return errors;
}

/**
 * Blockly refuses a workspace whose blocks cannot connect as saved: a block
 * with no `type`, a block in a value input that has no `output`, or one in a
 * statement input or after another block that has no `previousStatement`.
 * Only blocks this level defines are checked; a built-in block's shape isn't
 * known here, so a mistake about one still reaches the plugin.
 */
function checkConnections(
	name: string,
	level: ZoomLevel,
	defs: Map<string, ZoomBlockDef>
): string[] {
	const errors: string[] = [];
	const top = isRecord(level.workspaceJson.blocks) ? level.workspaceJson.blocks.blocks : undefined;
	if (Array.isArray(top)) {
		top.forEach((block, i) => {
			if (!isRecord(block) || typeof block.type !== 'string') {
				errors.push(`${name}.workspaceJson: top-level block ${i} has no "type"`);
			}
		});
	}

	for (const { parent, via, child } of blockLinks(level.workspaceJson)) {
		const where = `${name}.workspaceJson: in block "${parent.id ?? '?'}" (${parent.type}), the block ${
			via.kind === 'input' ? `in input "${via.name}"` : 'after it'
		}`;
		if (!isRecord(child) || typeof child.type !== 'string') {
			errors.push(`${where} has no "type". Every block needs a "type", or remove it`);
			continue;
		}
		const childDef = defs.get(child.type);
		if (!childDef) continue;
		const at = `${where} ("${String(child.id ?? '?')}", ${child.type})`;

		if (via.kind === 'next') {
			if (!('previousStatement' in childDef)) {
				errors.push(
					`${at} cannot follow a block, because its definition has no "previousStatement". Add "previousStatement": null to its definition, or do not put it after another block`
				);
			}
			continue;
		}
		const parentArg = findArg(defs.get(parent.type), via.name);
		if (parentArg?.type === 'input_value' && !('output' in childDef)) {
			errors.push(
				`${at} is in a value input ("${via.name}"), so its definition needs "output": null. Add it, or put the block in a statement input`
			);
		}
		if (parentArg?.type === 'input_statement' && !('previousStatement' in childDef)) {
			errors.push(
				`${at} is in a statement input ("${via.name}"), so its definition needs "previousStatement": null. Add it, or put the block in a value input`
			);
		}
	}
	return errors;
}

function findArg(def: ZoomBlockDef | undefined, field: string): ZoomArg | undefined {
	if (!def) return undefined;
	for (const [key, value] of Object.entries(def)) {
		if (!/^args\d+$/.test(key) || !Array.isArray(value)) continue;
		const arg = (value as ZoomArg[]).find((candidate) => candidate.name === field);
		if (arg) return arg;
	}
	return undefined;
}

function kindMismatch(arg: ZoomArg, value: unknown): string | null {
	switch (arg.type) {
		case 'field_number':
			return typeof value === 'number' ? null : `field_number is bound to a ${typeof value} value`;
		case 'field_input':
			return typeof value === 'string' ? null : `field_input is bound to a ${typeof value} value`;
		default:
			return typeof value === 'string' && (arg.options ?? []).some(([, option]) => option === value)
				? null
				: `field_dropdown has no option with the Detail value ${JSON.stringify(value)}`;
	}
}
