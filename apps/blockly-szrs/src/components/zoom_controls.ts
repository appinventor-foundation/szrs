// Copyright 2026 appinventor.org, All rights reserved
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import * as Blockly from 'blockly/core';
import { ZoomLevel, ZoomLevelWidget, type ZoomStatusOptions } from './zoom_level_widget';
import { applyZoomTheme } from './zoom_theme';

/**
 * Width of the zoom controls widget, in pixels. Approximates the
 * rendered size of the zoom-slider pill in zoom_level_widget.ts; revisit
 * if that widget's CSS changes.
 */
const WIDTH = 44;

/** Height of the zoom controls widget, in pixels. See WIDTH. */
const HEIGHT = 150;

/** Distance between the zoom controls and the top or bottom edge of the workspace. */
const MARGIN_VERTICAL = 20;

/** Distance between the zoom controls and the left or right edge of the workspace. */
const MARGIN_HORIZONTAL = 20;

/**
 * The corner the zoom controls are anchored to. Fixed to top-right rather
 * than derived from the toolbox side (as core's zoom controls and the
 * minimap plugin do), so the controls stay in the same place regardless of
 * workspace configuration.
 */
const ANCHOR_CORNER: Blockly.uiPosition.Position = {
	horizontal: Blockly.uiPosition.horizontalPosition.RIGHT,
	vertical: Blockly.uiPosition.verticalPosition.TOP
};

/**
 * This widget's weight for POSITIONABLE ordering. Deliberately distinct
 * from PositionedMinimap's weight (3), which also defaults to the
 * top-right corner: on a tie, ComponentManager falls back to whichever
 * component happened to register first, which is a coincidence we don't
 * want to depend on. A higher weight means we yield the corner to the
 * minimap and bump below it when both are present.
 */
const COMPONENT_WEIGHT = 4;

/**
 * The zoom controls widget.
 *
 * When constructed with a `container`, the widget renders into that
 * element and the host application owns its placement.
 *
 * When no `container` is given, the widget creates its own wrapper
 * element and floats it over the workspace, positioning itself the
 * same way Blockly's built-in UI elements (e.g. its own zoom
 * controls) do: by implementing `IPositionable` and registering with
 * the workspace's `ComponentManager`.
 */
export class ZoomControls implements Blockly.IPositionable {
	/**
	 * The unique ID for this component that is used to register with the
	 * ComponentManager.
	 */
	id = 'zoomControls';

	protected ws: Blockly.WorkspaceSvg;

	/** The host-supplied container to render into, if any. */
	protected readonly hostContainer: HTMLElement | null;

	/** Whether this widget owns and positions its own wrapper element. */
	protected readonly isSelfPositioned: boolean;

	/** The wrapper element created when self-positioned. */
	protected zoomControlsContainer: HTMLDivElement | null = null;

	/** The presentational zoom-level widget. */
	protected zoomLevelWidget: ZoomLevelWidget | null = null;

	/** The element the theme's CSS custom properties are applied to. */
	private themeTarget: HTMLElement | null = null;

	/** Listener that re-applies the theme on Blockly.Events.THEME_CHANGE. */
	private themeChangeListener: ((e: Blockly.Events.Abstract) => void) | null = null;

	/** Called when the user selects a different zoom level. */
	private readonly onLevelChange: (level: ZoomLevel) => void;

	/** Top coordinate of the widget, only meaningful when self-positioned. */
	private top = 0;

	/** Left coordinate of the widget, only meaningful when self-positioned. */
	private left = 0;

	/**
	 * Constructor for the zoom controls.
	 *
	 * @param workspaceSvg The workspace the controls act on.
	 * @param onLevelChange Called when the user selects a different level.
	 * @param container Optional host element to render into. When omitted,
	 *     the widget creates its own floating, self-positioned wrapper.
	 */
	constructor(
		workspaceSvg: Blockly.WorkspaceSvg,
		onLevelChange: (level: ZoomLevel) => void,
		container?: HTMLElement
	) {
		this.ws = workspaceSvg;
		this.onLevelChange = onLevelChange;
		this.hostContainer = container ?? null;
		this.isSelfPositioned = !container;
	}

	init() {
		if (this.hostContainer) {
			this.render(this.hostContainer);
			return;
		}

		const primaryInjectParentDiv = this.ws.getInjectionDiv().parentNode;

		if (!primaryInjectParentDiv) {
			throw new Error(
				'The workspace must be injected into the page before the zoom controls can be initalized'
			);
		}

		// Create a wrapper div for the zoom controls.
		this.zoomControlsContainer = document.createElement('div');
		this.zoomControlsContainer.id = 'zoomControlsContainer' + this.ws.id;
		this.zoomControlsContainer.className = 'blockly-zoomControlsContainer';

		// Make the wrapper a sibling to the primary injection div, so it can
		// float over the workspace.
		primaryInjectParentDiv.appendChild(this.zoomControlsContainer);

		this.render(this.zoomControlsContainer);

		this.ws.getComponentManager().addComponent({
			component: this,
			weight: COMPONENT_WEIGHT,
			capabilities: [Blockly.ComponentManager.Capability.POSITIONABLE]
		});
		this.ws.resize();
	}

	/**
	 * Builds the widget's contents into the given host element.
	 *
	 * @param host The element to render the widget into.
	 */
	private render(host: HTMLElement): void {
		this.zoomLevelWidget = new ZoomLevelWidget(host, this.onLevelChange);

		this.themeTarget = host;
		this.applyTheme();
		this.themeChangeListener = (e) => {
			if (e.type === Blockly.Events.THEME_CHANGE) {
				this.applyTheme();
			}
		};
		this.ws.addChangeListener(this.themeChangeListener);
	}

	private applyTheme(): void {
		if (this.themeTarget) applyZoomTheme(this.ws, this.themeTarget);
	}

	/**
	 * Shows `level` as active without calling `onLevelChange`. Does nothing
	 * before init().
	 *
	 * @param level The level to show.
	 */
	showLevel(level: ZoomLevel): void {
		this.zoomLevelWidget?.showLevel(level);
	}

	/**
	 * Shows a status message in place of the level label, or restores the
	 * label when `text` is null. Does nothing before init().
	 *
	 * @param text The message to show, or null.
	 * @param options Whether it's an error, and an optional tooltip.
	 */
	setStatus(text: string | null, options?: ZoomStatusOptions): void {
		this.zoomLevelWidget?.setStatus(text, options);
	}

	dispose() {
		if (this.themeChangeListener) {
			this.ws.removeChangeListener(this.themeChangeListener);
			this.themeChangeListener = null;
		}
		if (this.isSelfPositioned) {
			this.ws.getComponentManager().removeComponent(this.id);
			Blockly.utils.dom.removeNode(this.zoomControlsContainer);
		} else if (this.hostContainer) {
			this.hostContainer.innerHTML = '';
		}
		this.zoomLevelWidget = null;
		this.themeTarget = null;
	}

	/**
	 * Returns the bounding rectangle of the widget in pixel units relative to
	 * the Blockly injection div. Only called by Blockly when this widget is
	 * self-positioned (i.e. registered as POSITIONABLE).
	 *
	 * @returns The widget's bounding box.
	 */
	getBoundingRectangle(): Blockly.utils.Rect {
		return new Blockly.utils.Rect(this.top, this.top + HEIGHT, this.left, this.left + WIDTH);
	}

	/**
	 * Positions the widget in the top-right corner, bumping to avoid other
	 * positioned UI elements (e.g. a minimap also anchored there). Only
	 * called by Blockly when this widget is self-positioned (i.e.
	 * registered as POSITIONABLE).
	 *
	 * @param metrics The workspace metrics.
	 * @param savedPositions List of rectangles already on the workspace.
	 */
	position(metrics: Blockly.MetricsManager.UiMetrics, savedPositions: Blockly.utils.Rect[]): void {
		const startRect = Blockly.uiPosition.getStartPositionRect(
			ANCHOR_CORNER,
			new Blockly.utils.Size(WIDTH, HEIGHT),
			MARGIN_HORIZONTAL,
			MARGIN_VERTICAL,
			metrics,
			this.ws
		);
		// Anchored to the top, so bump downward on collision.
		const positionRect = Blockly.uiPosition.bumpPositionRect(
			startRect,
			MARGIN_VERTICAL,
			Blockly.uiPosition.bumpDirection.DOWN,
			savedPositions
		);

		this.top = positionRect.top;
		this.left = positionRect.left;

		if (this.zoomControlsContainer) {
			this.zoomControlsContainer.style.top = `${this.top}px`;
			this.zoomControlsContainer.style.left = `${this.left}px`;
		}
	}
}

Blockly.Css.register(`
/* Above the zoom view overlay (z-index 75, see zoom_view.ts), so the user can
   always get back to Detail. */
.blockly-zoomControlsContainer {
	position: absolute;
	z-index: 80;
}
`);
