/** A block as Blockly's JSON serialization saves it; only the parts the proxy looks at. */
export interface SavedBlock {
	id?: string;
	type: string;
	fields?: Record<string, unknown>;
	inputs?: Record<string, unknown>;
	next?: unknown;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
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

export function byId(blocks: SavedBlock[]): Map<string, SavedBlock> {
	return new Map(
		blocks.flatMap((block): [string, SavedBlock][] =>
			block.id === undefined ? [] : [[block.id, block]]
		)
	);
}

/** The blocks nested in `block`'s inputs (at any depth) that have a field called `field`. */
export function nestedHolders(block: SavedBlock, field: string): SavedBlock[] {
	// Without `next`, so blocks that follow `block` aren't counted as inside it.
	const withoutNext = { ...block, next: undefined };
	return allBlocks({ blocks: { blocks: [withoutNext] } }).filter(
		(nested) => nested !== withoutNext && nested.fields?.[field] !== undefined
	);
}
