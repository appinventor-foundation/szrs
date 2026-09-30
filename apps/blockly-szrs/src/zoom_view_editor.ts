// Copyright 2026 appinventor.org, All rights reserved
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/**
 * @fileoverview Handles edits in a zoomed view.
 */
import * as Blockly from 'blockly/core';
import type { ZoomBinding } from '@szrs/llm-proxy-contracts';

/**
 * Handles what the user can do in a zoomed view: edits to bound fields are
 * written through to the Detail workspace (DECISIONS.md #8), and blocks
 * pasted into the view are removed.
 */
export class ZoomViewEditor {
	private bindings: ZoomBinding[] = [];

	/**
	 * @param view The workspace showing the zoomed level.
	 * @param detail The workspace holding the Detail program.
	 * @param onDetailEdited Called after an edit changed a Detail value.
	 */
	constructor(
		private readonly view: Blockly.Workspace,
		private readonly detail: Blockly.Workspace,
		private readonly onDetailEdited: () => void
	) {
		view.addChangeListener(this.handleEvent);
	}

	/** Sets the bindings of the level now shown in the view. */
	setBindings(bindings: ZoomBinding[]): void {
		this.bindings = bindings;
	}

	dispose(): void {
		this.view.removeChangeListener(this.handleEvent);
	}

	private handleEvent = (event: Blockly.Events.Abstract): void => {
		if (event.type === Blockly.Events.BLOCK_CREATE) {
			// The loader creates blocks without recording undo; anything else,
			// such as a paste, isn't part of the zoomed level.
			const create = event as Blockly.Events.BlockCreate;
			if (create.recordUndo) {
				for (const id of create.ids ?? []) this.view.getBlockById(id)?.dispose(false);
			}
			return;
		}
		if (event.type !== Blockly.Events.BLOCK_CHANGE) return;
		const change = event as Blockly.Events.BlockChange;
		if (change.element !== 'field') return;
		const edited = this.bindings.filter(
			(binding) => binding.block === change.blockId && binding.field === change.name
		);
		if (edited.length === 0) return;

		let changed = false;
		for (const binding of edited) {
			for (const ref of binding.detail) {
				const block = this.detail.getBlockById(ref.block);
				if (block && block.getFieldValue(ref.field) !== change.newValue) {
					block.setFieldValue(change.newValue, ref.field);
					changed = true;
				}
			}
		}
		this.refresh();
		if (changed) this.onDetailEdited();
	};

	/**
	 * Shows Detail's current value in every bound field: Detail may have
	 * adjusted the value, and several fields can share one.
	 */
	private refresh(): void {
		for (const binding of this.bindings) {
			const [source] = binding.detail;
			const value = this.detail.getBlockById(source.block)?.getFieldValue(source.field);
			const field = this.view.getBlockById(binding.block)?.getField(binding.field);
			if (field && value !== null && value !== undefined && field.getValue() !== value) {
				field.setValue(value);
			}
		}
	}
}
