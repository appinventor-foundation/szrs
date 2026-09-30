// Copyright 2026 appinventor.org, All rights reserved
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/**
 * @fileoverview Registers a zoomed level's blocks and loads it into a workspace.
 */
import * as Blockly from 'blockly/core';
import type { ZoomLevel as ZoomLevelResult } from '@szrs/llm-proxy-contracts';

/**
 * Loads zoomed levels into a workspace. Blockly's block registry is global,
 * so the loader keeps track of the block types it registered and removes
 * them before registering another level's.
 */
export class ZoomLevelLoader {
	private registered: string[] = [];

	/**
	 * Replaces `target`'s contents with `level`: registers the level's block
	 * definitions (removing the previous level's), loads its workspace, and
	 * shows each bound field with its current value from `detail`.
	 *
	 * @throws If a definition isn't a zoom_ block, or Blockly can't load the level.
	 */
	load(level: ZoomLevelResult, target: Blockly.Workspace, detail: Blockly.Workspace): void {
		target.clear();
		this.unregister();

		const types = level.blockDefs.map((def) => def.type);
		const foreign = types.find((type) => !type.startsWith('zoom_'));
		if (foreign) throw new Error(`Refusing to define non-zoom block type "${foreign}"`);

		this.registered = types;
		Blockly.common.defineBlocksWithJsonArray(level.blockDefs);
		Blockly.serialization.workspaces.load(level.workspaceJson, target, { recordUndo: false });

		// Show the Detail program's current values, not the model's placeholders.
		for (const binding of level.bindings) {
			const [source] = binding.detail;
			const value = detail.getBlockById(source.block)?.getFieldValue(source.field);
			const field = target.getBlockById(binding.block)?.getField(binding.field);
			if (field && value !== null && value !== undefined) field.setValue(value);
		}
	}

	/**
	 * Removes the block definitions registered by the last load. Clear any
	 * workspace still using them first.
	 */
	unregister(): void {
		for (const type of this.registered) delete Blockly.Blocks[type];
		this.registered = [];
	}
}
