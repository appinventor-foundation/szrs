// Copyright 2026 appinventor.org, All rights reserved
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import * as Blockly from 'blockly/core';

/**
 * Reads color values from the workspace's current theme and applies them to
 * `target` as CSS custom properties, so the zoom controls follow the
 * workspace's theme (built-in or a plugin consumer's own) instead of
 * hardcoding colors per known theme. Call again on Blockly.Events.THEME_CHANGE
 * to track live theme swaps.
 *
 * @param workspace The workspace whose theme to read.
 * @param target The element to set the custom properties on.
 */
export function applyZoomTheme(workspace: Blockly.WorkspaceSvg, target: HTMLElement): void {
	const componentStyles = workspace.getTheme().componentStyles;
	if (componentStyles.markerColour) {
		target.style.setProperty('--zoom-accent', componentStyles.markerColour);
	}
	if (componentStyles.flyoutBackgroundColour) {
		target.style.setProperty('--zoom-pill-bg', componentStyles.flyoutBackgroundColour);
	}
	if (componentStyles.flyoutForegroundColour) {
		target.style.setProperty('--zoom-label-color', componentStyles.flyoutForegroundColour);
	}
}
