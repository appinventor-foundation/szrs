// Copyright 2026 appinventor.org, All rights reserved
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import * as Blockly from 'blockly/core';
import type { ModelStore } from '../model_store';
import { applyZoomTheme } from './zoom_theme';

/** Width of the model dropdown, in pixels. See the .zoom-model-select CSS. */
const WIDTH = 132;

/** Height of the model dropdown, in pixels. See WIDTH. */
const HEIGHT = 28;

/** Distance between the dropdown and the top or bottom edge of the workspace. */
const MARGIN_VERTICAL = 20;

/** Distance between the dropdown and the left or right edge of the workspace. */
const MARGIN_HORIZONTAL = 20;

/** Anchored top-right like the zoom controls, which it then bumps below. */
const ANCHOR_CORNER: Blockly.uiPosition.Position = {
	horizontal: Blockly.uiPosition.horizontalPosition.RIGHT,
	vertical: Blockly.uiPosition.verticalPosition.TOP
};

/**
 * Higher than the zoom controls' weight (4), so the dropdown is placed after
 * them and bumps down to sit below the zoom pill.
 */
const COMPONENT_WEIGHT = 5;

/**
 * A dropdown for choosing the model that zooms are requested from.
 *
 * It shows the aliases in a ModelStore and writes the user's choice back to
 * it. It stays hidden while the store has only one model to offer, e.g. when
 * the proxy's model list couldn't be fetched.
 *
 * When constructed with a `container`, it renders into that element and the
 * host application owns its placement. Otherwise it floats over the
 * workspace as an IPositionable, like ZoomControls.
 */
export class ModelSelect implements Blockly.IPositionable {
	/** The unique ID for this component, for the ComponentManager. */
	id = 'zoomModelSelect';

	private readonly isSelfPositioned: boolean;
	private wrapper: HTMLDivElement | null = null;
	private select: HTMLSelectElement | null = null;
	private stopListening: (() => void) | null = null;
	private themeChangeListener: ((e: Blockly.Events.Abstract) => void) | null = null;
	private top = 0;
	private left = 0;

	/**
	 * @param ws The workspace the dropdown belongs to.
	 * @param store The models to offer, and where the choice is kept.
	 * @param hostContainer Optional host element to render into. When
	 *     omitted, the dropdown creates its own floating, self-positioned wrapper.
	 */
	constructor(
		private readonly ws: Blockly.WorkspaceSvg,
		private readonly store: ModelStore,
		private readonly hostContainer?: HTMLElement
	) {
		this.isSelfPositioned = !hostContainer;
	}

	init(): void {
		const select = document.createElement('select');
		select.className = 'zoom-model-select';
		select.title = 'Model used for zooming';
		select.setAttribute('aria-label', 'Model used for zooming');
		select.addEventListener('change', () => this.store.select(select.value));
		this.select = select;

		if (this.hostContainer) {
			this.wrapper = null;
			this.hostContainer.appendChild(select);
		} else {
			const parent = this.ws.getInjectionDiv().parentNode;
			if (!parent) {
				throw new Error(
					'The workspace must be injected into the page before the model dropdown can be initialized'
				);
			}
			this.wrapper = document.createElement('div');
			this.wrapper.id = 'zoomModelSelectContainer' + this.ws.id;
			this.wrapper.className = 'blockly-zoomModelSelectContainer';
			this.wrapper.appendChild(select);
			parent.appendChild(this.wrapper);

			this.ws.getComponentManager().addComponent({
				component: this,
				weight: COMPONENT_WEIGHT,
				capabilities: [Blockly.ComponentManager.Capability.POSITIONABLE]
			});
		}

		this.applyTheme();
		this.themeChangeListener = (e) => {
			if (e.type === Blockly.Events.THEME_CHANGE) this.applyTheme();
		};
		this.ws.addChangeListener(this.themeChangeListener);

		this.stopListening = this.store.onChange(() => this.refresh());
		this.refresh();
		if (this.isSelfPositioned) this.ws.resize();
	}

	dispose(): void {
		this.stopListening?.();
		this.stopListening = null;
		if (this.themeChangeListener) {
			this.ws.removeChangeListener(this.themeChangeListener);
			this.themeChangeListener = null;
		}
		if (this.isSelfPositioned) {
			this.ws.getComponentManager().removeComponent(this.id);
			Blockly.utils.dom.removeNode(this.wrapper);
		} else {
			Blockly.utils.dom.removeNode(this.select);
		}
		this.wrapper = null;
		this.select = null;
	}

	/** Rebuilds the options from the store, and hides the dropdown when there is nothing to choose. */
	private refresh(): void {
		const select = this.select;
		if (!select) return;

		// The host's configured model may not be among the proxy's aliases;
		// keep it selectable so the dropdown always shows what is in use.
		const models = [...this.store.models];
		if (models.indexOf(this.store.current) === -1) models.unshift(this.store.current);

		select.innerHTML = '';
		for (const model of models) {
			const option = document.createElement('option');
			option.value = model;
			option.textContent = model;
			select.appendChild(option);
		}
		select.value = this.store.current;
		select.style.display = models.length > 1 ? '' : 'none';
	}

	private applyTheme(): void {
		const target = this.wrapper ?? this.hostContainer;
		if (target) applyZoomTheme(this.ws, target);
	}

	/**
	 * Returns the bounding rectangle in pixels relative to the Blockly
	 * injection div. Only called by Blockly when self-positioned.
	 *
	 * @returns The dropdown's bounding box.
	 */
	getBoundingRectangle(): Blockly.utils.Rect {
		return new Blockly.utils.Rect(this.top, this.top + HEIGHT, this.left, this.left + WIDTH);
	}

	/**
	 * Positions the dropdown in the top-right corner, bumping down below the
	 * zoom controls and anything else already there. Only called by Blockly
	 * when self-positioned.
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
		const positionRect = Blockly.uiPosition.bumpPositionRect(
			startRect,
			MARGIN_VERTICAL,
			Blockly.uiPosition.bumpDirection.DOWN,
			savedPositions
		);

		this.top = positionRect.top;
		this.left = positionRect.left;

		if (this.wrapper) {
			this.wrapper.style.top = `${this.top}px`;
			this.wrapper.style.left = `${this.left}px`;
		}
	}
}

Blockly.Css.register(`
/* Above the zoom view overlay (z-index 75, see zoom_view.ts), like the zoom controls. */
.blockly-zoomModelSelectContainer {
	position: absolute;
	z-index: 80;
}

.zoom-model-select {
	box-sizing: border-box;
	width: 132px;
	height: 28px;
	padding: 0 6px;
	font-size: 11px;
	font-family: system-ui, sans-serif;
	color: var(--zoom-label-color, #666);
	background: var(--zoom-pill-bg, rgba(255, 255, 255, 0.95));
	border: 1px solid #ccc;
	border-radius: 14px;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.14);
	cursor: pointer;
}

.zoom-model-select:focus-visible {
	outline: 2px solid var(--zoom-accent, #007acc);
	outline-offset: 1px;
}
`);
