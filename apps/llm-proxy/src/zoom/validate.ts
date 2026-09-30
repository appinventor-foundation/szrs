import {
	ZOOM_EDITABLE_FIELD_TYPES,
	type ZoomArg,
	type ZoomBlockDef,
	type ZoomLevel,
	type ZoomResponse
} from '@szrs/llm-proxy-contracts';

interface SavedBlock {
	id?: string;
	type: string;
	fields?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Every block in a saved Blockly workspace, including nested, shadow and following blocks. */
export function allBlocks(workspaceJson: Record<string, unknown>): SavedBlock[] {
	const found: SavedBlock[] = [];
	const visit = (block: unknown): void => {
		if (!isRecord(block) || typeof block.type !== 'string') return;
		found.push(block as unknown as SavedBlock);
		if (isRecord(block.inputs)) {
			for (const input of Object.values(block.inputs)) {
				if (isRecord(input)) {
					visit(input.block);
					visit(input.shadow);
				}
			}
		}
		if (isRecord(block.next)) visit(block.next.block);
	};
	const top = isRecord(workspaceJson.blocks) ? workspaceJson.blocks.blocks : undefined;
	if (Array.isArray(top)) top.forEach(visit);
	return found;
}

function byId(blocks: SavedBlock[]): Map<string, SavedBlock> {
	return new Map(
		blocks.flatMap((block): [string, SavedBlock][] =>
			block.id === undefined ? [] : [[block.id, block]]
		)
	);
}

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

	for (const block of blocks) {
		if (block.type.startsWith('zoom_') && !defs.has(block.type)) {
			errors.push(
				`${name}.workspaceJson uses "${block.type}", which ${name}.blockDefs doesn't define`
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
				const holder = allBlocks({ blocks: { blocks: [target] } }).find(
					(block) => block !== target && block.fields?.[ref.field] !== undefined
				);
				errors.push(
					`${where}: Detail block "${ref.block}" (${target.type}) has no field "${ref.field}"` +
						(holder?.id
							? `. "${ref.field}" is on block "${holder.id}" (${holder.type}) inside it; bind that block instead`
							: '')
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
