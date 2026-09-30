// Copyright 2026 appinventor.org, All rights reserved
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/**
 * @fileoverview A read-only workspace laid over the main one, showing a zoomed level.
 */
import * as Blockly from 'blockly/core';
import type { ZoomLevel as ZoomLevelResult } from '@szrs/llm-proxy-contracts';
import { ZoomLevelLoader } from './zoom_level_loader';

/**
 * Shows zoomed levels in their own read-only workspace, over the main one.
 * The main workspace, which holds the Detail program, is never changed
 * (DECISIONS.md #9). The overlay also hides the main toolbox, so Detail
 * can't be edited while it's out of sight.
 */
export class ZoomView {
	private container: HTMLDivElement | null = null;
	private viewWorkspace: Blockly.WorkspaceSvg | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private readonly loader = new ZoomLevelLoader();

	constructor(private readonly mainWorkspace: Blockly.WorkspaceSvg) {}

	/**
	 * Shows `level` over the main workspace.
	 *
	 * @throws If Blockly can't load the level. The view is left hidden.
	 */
	show(level: ZoomLevelResult): void {
		const view = this.ensureWorkspace();
		try {
			this.loader.load(level, view, this.mainWorkspace);
		} catch (error) {
			this.hide();
			throw error;
		}
		if (this.container) this.container.style.display = '';
		Blockly.svgResize(view);
		view.scrollCenter();
	}

	/** Hides the view and removes the zoomed blocks and their definitions. */
	hide(): void {
		if (this.container) this.container.style.display = 'none';
		this.viewWorkspace?.clear();
		this.loader.unregister();
		// Clicking in the view can make it Blockly's main workspace; undo that.
		Blockly.common.setMainWorkspace(this.mainWorkspace);
	}

	dispose(): void {
		this.resizeObserver?.disconnect();
		this.viewWorkspace?.dispose();
		this.loader.unregister();
		Blockly.utils.dom.removeNode(this.container);
		this.resizeObserver = null;
		this.viewWorkspace = null;
		this.container = null;
	}

	private ensureWorkspace(): Blockly.WorkspaceSvg {
		if (this.viewWorkspace) return this.viewWorkspace;

		const container = document.createElement('div');
		container.className = 'blockly-zoomView';
		this.mainWorkspace.getInjectionDiv().appendChild(container);

		const view = Blockly.inject(container, {
			readOnly: true,
			theme: this.mainWorkspace.getTheme(),
			renderer: this.mainWorkspace.options.renderer,
			move: { scrollbars: true, drag: true, wheel: true },
			zoom: { controls: false, wheel: true }
		});
		// inject() makes the new workspace Blockly's "main" one, and host code
		// often relies on Blockly.getMainWorkspace() meaning its own workspace.
		Blockly.common.setMainWorkspace(this.mainWorkspace);
		this.resizeObserver = new ResizeObserver(() => Blockly.svgResize(view));
		this.resizeObserver.observe(container);

		this.container = container;
		this.viewWorkspace = view;
		return view;
	}
}

Blockly.Css.register(`
/* Above Blockly's toolbox (z-index 70) and flyout (20), so Detail can't be
   edited while it's hidden. The zoom controls sit above this (see zoom_controls.ts). */
.blockly-zoomView {
	position: absolute;
	inset: 0;
	z-index: 75;
}
`);
