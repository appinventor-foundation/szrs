// Copyright 2026 appinventor.org, All rights reserved
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import * as Blockly from 'blockly/core';

export type ZoomLevel = 'detail' | 'semantic' | 'concept';

export interface ZoomStatusOptions {
	/** Shows the message in the error style. */
	error?: boolean;
	/** Tooltip with more detail, e.g. the full error message. */
	title?: string;
}

// Top = most abstract (concept), bottom = most zoomed in (detail).
const LEVELS: ZoomLevel[] = ['concept', 'semantic', 'detail'];
const LABELS: Record<ZoomLevel, string> = {
	detail: 'Detail',
	semantic: 'Semantic',
	concept: 'Concept'
};

/**
 * The zoom level pill: a vertical slider of stops (Concept / Semantic /
 * Detail) with a label underneath showing the active level.
 *
 * This is purely presentational: it tracks and shows which level is
 * selected, and can show a status message (progress or an error) in place
 * of the level label. Fetching and applying zoom levels happens elsewhere.
 */
export class ZoomLevelWidget {
	private readonly stopEls: Partial<Record<ZoomLevel, HTMLButtonElement>> = {};
	private readonly activeLabelEl: HTMLElement;
	private activeLevel: ZoomLevel = 'detail';
	private status: { text: string; error: boolean; title: string } | null = null;
	private readonly onLevelChange?: (level: ZoomLevel) => void;

	/**
	 * @param host The element to render the widget into.
	 * @param onLevelChange Optional callback fired when the user selects a
	 *     different level.
	 */
	constructor(host: HTMLElement, onLevelChange?: (level: ZoomLevel) => void) {
		this.onLevelChange = onLevelChange;
		host.innerHTML = '';

		const wrapper = document.createElement('div');
		wrapper.className = 'zoom-slider-wrapper';

		const pill = document.createElement('div');
		pill.className = 'zoom-slider';

		LEVELS.forEach((level, i) => {
			const stop = document.createElement('button');
			stop.className = 'zoom-slider__stop';
			stop.title = LABELS[level];
			const dot = document.createElement('span');
			dot.className = 'zoom-slider__dot';
			stop.appendChild(dot);
			stop.addEventListener('click', () => this.setActiveLevel(level));
			this.stopEls[level] = stop;
			pill.appendChild(stop);
			if (i < LEVELS.length - 1) {
				const seg = document.createElement('div');
				seg.className = 'zoom-slider__seg';
				pill.appendChild(seg);
			}
		});

		wrapper.appendChild(pill);

		this.activeLabelEl = document.createElement('div');
		this.activeLabelEl.className = 'zoom-slider__active-label';
		wrapper.appendChild(this.activeLabelEl);

		host.appendChild(wrapper);

		this.update();
	}

	/**
	 * Selects a level, updating the visuals and notifying the
	 * `onLevelChange` callback, if any.
	 *
	 * @param level The level to make active.
	 */
	setActiveLevel(level: ZoomLevel): void {
		if (level === this.activeLevel) return;
		this.showLevel(level);
		this.onLevelChange?.(level);
	}

	/**
	 * Shows `level` as active without notifying `onLevelChange`, e.g. to move
	 * back to Detail after a zoom fails.
	 *
	 * @param level The level to show as active.
	 */
	showLevel(level: ZoomLevel): void {
		this.activeLevel = level;
		this.update();
	}

	/**
	 * Replaces the level label with a status message, or restores the label
	 * when `text` is null.
	 *
	 * @param text The message to show, or null.
	 * @param options Whether it's an error, and an optional tooltip.
	 */
	setStatus(text: string | null, { error = false, title = '' }: ZoomStatusOptions = {}): void {
		this.status = text === null ? null : { text, error, title };
		this.update();
	}

	/**
	 * Returns the currently active level.
	 *
	 * @returns The active level.
	 */
	getActiveLevel(): ZoomLevel {
		return this.activeLevel;
	}

	private update(): void {
		for (const level of LEVELS) {
			this.stopEls[level]?.classList.toggle(
				'zoom-slider__stop--active',
				level === this.activeLevel
			);
		}
		this.activeLabelEl.textContent = this.status?.text ?? LABELS[this.activeLevel];
		this.activeLabelEl.title = this.status?.title ?? '';
		this.activeLabelEl.classList.toggle(
			'zoom-slider__active-label--error',
			this.status?.error ?? false
		);
	}
}

Blockly.Css.register(`
.zoom-slider-wrapper {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 5px;
}

.zoom-slider {
	display: flex;
	flex-direction: column;
	align-items: center;
	background: var(--zoom-pill-bg, rgba(255, 255, 255, 0.95));
	border: 1px solid #ccc;
	border-radius: 22px;
	padding: 8px 0;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.14);
	width: 40px;
}

.zoom-slider__seg {
	width: 2px;
	height: 10px;
	background: #ddd;
	flex-shrink: 0;
}

.zoom-slider__stop {
	width: 40px;
	height: 30px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: none;
	border: none;
	padding: 0;
	cursor: pointer;
}

.zoom-slider__dot {
	display: block;
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: #c0c0c0;
	transition: width 0.2s ease, height 0.2s ease, background 0.2s ease;
}

.zoom-slider__stop:not(:disabled):not(.zoom-slider__stop--active):hover .zoom-slider__dot {
	background: #888;
	width: 11px;
	height: 11px;
}

.zoom-slider__stop--active .zoom-slider__dot {
	width: 20px;
	height: 20px;
	background: var(--zoom-accent, #007acc);
}

.zoom-slider__active-label {
	font-size: 10px;
	font-family: system-ui, sans-serif;
	color: var(--zoom-label-color, #666);
	text-align: center;
}

.zoom-slider__active-label--error {
	color: #c62828;
}
`);
