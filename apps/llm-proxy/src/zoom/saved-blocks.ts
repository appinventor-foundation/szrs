/** A block as Blockly's JSON serialization saves it; only the parts the proxy looks at. */
export interface SavedBlock {
	id?: string;
	type: string;
	fields?: Record<string, unknown>;
	inputs?: Record<string, unknown>;
	next?: unknown;
	/** Extra state a block saves beyond its fields (a mutation, for blocks that have one). */
	extraState?: unknown;
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

/** A child that sits in an input or after another block, and the block holding it. */
export interface BlockLink {
	parent: SavedBlock;
	via: { kind: 'input'; name: string } | { kind: 'next' };
	/** What the saved state holds there: a block, or something that is not one. */
	child: unknown;
}

/**
 * Every child of every block in a saved workspace, with the block holding it
 * and how (in which input, or as the next block). Unlike `allBlocks` it also
 * returns children that are not blocks (no `type`), so they can be reported.
 */
export function blockLinks(workspaceJson: Record<string, unknown>): BlockLink[] {
	const links: BlockLink[] = [];
	const visit = (block: unknown): void => {
		if (!isRecord(block) || typeof block.type !== 'string') return;
		const parent = block as unknown as SavedBlock;
		if (isRecord(parent.inputs)) {
			for (const [name, input] of Object.entries(parent.inputs)) {
				if (!isRecord(input)) continue;
				for (const child of [input.block, input.shadow]) {
					if (child === undefined) continue;
					links.push({ parent, via: { kind: 'input', name }, child });
					visit(child);
				}
			}
		}
		if (isRecord(block.next) && block.next.block !== undefined) {
			links.push({ parent, via: { kind: 'next' }, child: block.next.block });
			visit(block.next.block);
		}
	};
	const top = isRecord(workspaceJson.blocks) ? workspaceJson.blocks.blocks : undefined;
	if (Array.isArray(top)) top.forEach(visit);
	return links;
}
