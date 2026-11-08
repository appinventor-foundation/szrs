// Copyright 2026 appinventor.org, All rights reserved
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/**
 * @fileoverview A read-only workspace laid over the main one, showing a zoomed level.
 */
import * as Blockly from 'blockly/core';
import type { ZoomLevel as ZoomLevelResult } from '@szrs/llm-proxy-contracts';
import { ZoomLevelLoader } from './zoom_level_loader';
import type { ZoomAnchors } from '@szrs/llm-proxy-contracts/anchors';
import { applyAnchorColours } from './zoom_colour';
import { ZoomViewEditor } from './zoom_view_editor';

/**
 * Shows zoomed levels in their own workspace, over the main one. Everything
 * in the view is locked except bound fields, whose edits are written through
 * to the Detail program in the main workspace (DECISIONS.md #8, #9). The
 * overlay also hides the main toolbox, so Detail can't be edited while it's
 * out of sight.
 */
export class ZoomView {
	private container: HTMLDivElement | null = null;
	private viewWorkspace: Blockly.WorkspaceSvg | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private editor: ZoomViewEditor | null = null;
	private readonly loader = new ZoomLevelLoader();
	private anchors: ZoomAnchors = {};

	/**
	 * @param mainWorkspace The workspace holding the Detail program.
	 * @param onDetailEdited Called after an edit in the view changed a Detail value.
	 */
	constructor(
		private readonly mainWorkspace: Blockly.WorkspaceSvg,
		private readonly onDetailEdited: () => void
	) {}

	/**
	 * Shows `level` over the main workspace, its zoom blocks in the colour of
	 * their `anchors` in the Detail program.
	 *
	 * @throws If Blockly can't load the level. The view is left hidden.
	 */
	show(level: ZoomLevelResult, anchors: ZoomAnchors = {}): void {
		const view = this.ensureWorkspace();
		// Displayed before loading, so the loader lays the level out in a workspace
		// that is on screen.
		if (this.container) this.container.style.display = '';
		try {
			this.anchors = anchors;
			this.loader.load(level, view, this.mainWorkspace, anchors);
			this.editor?.setBindings(level.bindings);
		} catch (error) {
			this.hide();
			throw error;
		}
		Blockly.svgResize(view);
		view.scrollCenter();
	}

	/** Hides the view and removes the zoomed blocks and their definitions. */
	hide(): void {
		if (this.container) this.container.style.display = 'none';
		this.editor?.setBindings([]);
		this.anchors = {};
		this.viewWorkspace?.clear();
		this.loader.unregister();
		// Clicking in the view can make it Blockly's main workspace; undo that.
		Blockly.common.setMainWorkspace(this.mainWorkspace);
	}

	dispose(): void {
		this.resizeObserver?.disconnect();
		this.editor?.dispose();
		this.mainWorkspace.removeChangeListener(this.handleMainEvent);
		this.viewWorkspace?.dispose();
		this.loader.unregister();
		Blockly.utils.dom.removeNode(this.container);
		this.resizeObserver = null;
		this.editor = null;
		this.viewWorkspace = null;
		this.container = null;
	}

	/**
	 * The view's theme is the main workspace's, also after the host changes it.
	 * A zoom block shown in a style follows on its own; one that copied a colour
	 * is given its anchor's colour in the new theme.
	 */
	private handleMainEvent = (event: Blockly.Events.Abstract): void => {
		const view = this.viewWorkspace;
		if (event.type !== Blockly.Events.THEME_CHANGE || !view) return;
		view.setTheme(this.mainWorkspace.getTheme());
		applyAnchorColours(view, this.mainWorkspace, this.anchors);
	};

	private ensureWorkspace(): Blockly.WorkspaceSvg {
		if (this.viewWorkspace) return this.viewWorkspace;

		const container = document.createElement('div');
		container.className = 'blockly-zoomView';
		this.mainWorkspace.getInjectionDiv().appendChild(container);

		const view = Blockly.inject(container, {
			// Not read-only, so bound fields can be edited; the loader locks
			// everything else.
			readOnly: false,
			trashcan: false,
			comments: false,
			disable: false,
			collapse: false,
			sounds: false,
			theme: this.mainWorkspace.getTheme(),
			renderer: this.mainWorkspace.options.renderer,
			move: { scrollbars: true, drag: true, wheel: true },
			zoom: { controls: false, wheel: true }
		});
		// inject() makes the new workspace Blockly's "main" one, and host code
		// often relies on Blockly.getMainWorkspace() meaning its own workspace.
		Blockly.common.setMainWorkspace(this.mainWorkspace);
		this.mainWorkspace.addChangeListener(this.handleMainEvent);
		this.editor = new ZoomViewEditor(view, this.mainWorkspace, this.onDetailEdited);
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
