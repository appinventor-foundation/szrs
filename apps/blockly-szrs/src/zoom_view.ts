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

/** Set on the main workspace's injection div while a zoomed level is shown. */
const ZOOMED_CLASS = 'blocklyZoomedDetail';

/**
 * Shows zoomed levels in their own workspace, over the main one. Everything
 * in the view is locked except bound fields, whose edits are written through
 * to the Detail program in the main workspace (DECISIONS.md #8, #9). The
 * overlay covers the main workspace's drawing area only. The main toolbox
 * stays where it is, dimmed and inert, so Detail can't be edited while it's
 * out of sight; the view has its own, dimmed trash can and the same grid.
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
		this.setDetailControlsDisabled(true);
		this.fitToDetail();
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
		this.setDetailControlsDisabled(false);
		this.editor?.setBindings([]);
		this.anchors = {};
		this.viewWorkspace?.clear();
		this.loader.unregister();
		// Clicking in the view can make it Blockly's main workspace; undo that.
		Blockly.common.setMainWorkspace(this.mainWorkspace);
	}

	dispose(): void {
		this.resizeObserver?.disconnect();
		this.setDetailControlsDisabled(false);
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

	/**
	 * Puts the overlay over the main workspace's drawing area, leaving the
	 * toolbox (on whichever side it is) uncovered. The metrics are the ones the
	 * main workspace itself uses, so the view's edges line up with Detail's.
	 */
	private fitToDetail(): void {
		if (!this.container) return;
		const metrics = this.mainWorkspace.getMetricsManager();
		const { left, top } = metrics.getAbsoluteMetrics();
		const { width, height } = metrics.getViewMetrics();
		const style = this.container.style;
		style.left = `${left}px`;
		style.top = `${top}px`;
		style.width = `${width}px`;
		style.height = `${height}px`;
	}

	/**
	 * Dims and disables the main workspace's toolbox and flyout while a zoomed
	 * level is shown. `inert` also keeps them out of the tab order. An open
	 * category flyout is closed first.
	 */
	private setDetailControlsDisabled(disabled: boolean): void {
		const injectionDiv = this.mainWorkspace.getInjectionDiv();
		if (disabled) this.mainWorkspace.getToolbox()?.clearSelection();
		injectionDiv.classList.toggle(ZOOMED_CLASS, disabled);
		for (const element of injectionDiv.querySelectorAll<HTMLElement>(
			':scope > .blocklyToolbox, :scope > .blocklyFlyout'
		)) {
			element.inert = disabled;
		}
	}

	private ensureWorkspace(): Blockly.WorkspaceSvg {
		if (this.viewWorkspace) return this.viewWorkspace;

		const container = document.createElement('div');
		container.className = 'blockly-zoomView';
		this.mainWorkspace.getInjectionDiv().appendChild(container);
		// Sized before the view is injected, so its trash can and scrollbars are
		// placed for the real size and not for an empty box.
		this.container = container;
		this.fitToDetail();

		const view = Blockly.inject(container, {
			// Not read-only, so bound fields can be edited; the loader locks
			// everything else.
			readOnly: false,
			// Shown so Detail's layout carries over; dimmed and inert (see the CSS).
			trashcan: true,
			// Detail's grid, so the zoomed view has the same background.
			grid: { ...this.mainWorkspace.options.gridOptions },
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
		this.resizeObserver = new ResizeObserver(() => {
			this.fitToDetail();
			Blockly.svgResize(view);
		});
		// The view follows the main workspace's size (and with it the toolbox's).
		this.resizeObserver.observe(this.mainWorkspace.getInjectionDiv());
		this.resizeObserver.observe(container);

		this.viewWorkspace = view;
		return view;
	}
}

Blockly.Css.register(`
/* Over Detail's blocks, scrollbars and trash can, which lie in the same area.
   Its position and size are set in code (fitToDetail), to leave the toolbox
   uncovered. The zoom controls sit above this (see zoom_controls.ts). */
.blockly-zoomView {
	position: absolute;
	z-index: 75;
}

/* Detail's toolbox and flyout, shown but unusable while a zoomed level is up. */
.${ZOOMED_CLASS} > .blocklyToolbox,
.${ZOOMED_CLASS} > .blocklyFlyout,
.blockly-zoomView .blocklyTrash {
	opacity: 0.45;
	pointer-events: none;
}
`);
