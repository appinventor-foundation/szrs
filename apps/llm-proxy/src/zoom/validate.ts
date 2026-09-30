import {
	ZOOM_EDITABLE_FIELD_TYPES,
	type ZoomArg,
	type ZoomBlockDef,
	type ZoomLevel,
	type ZoomResponse
} from '@szrs/llm-proxy-contracts';

import { allBlocks, byId, nestedHolders, type SavedBlock } from './saved-blocks.js';

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
