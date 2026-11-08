// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/**
 * @fileoverview Shows a zoom block in the colour of the Detail block it stands for.
 */
import * as Blockly from 'blockly/core';
import type { ZoomAnchors } from '@szrs/llm-proxy-contracts/anchors';

/**
 * Gives each zoom block that has an anchor in `detail` the look of that block.
 * Only zoom blocks change: a built-in block kept in a zoomed level already has
 * the host's colour. An anchor that is not in `detail`, or a zoom block that is
 * not in `target`, is skipped and the block keeps the colour it was defined with.
 *
 * The anchor's style is used when it has a named one that `target`'s theme also
 * has, so the zoom block follows a theme change as the anchor does. Otherwise
 * its colour is copied (a block set up with a bare colour has an automatic
 * `auto_…` style that is not a named one). A style `target`'s theme lacks would
 * silently draw black, so it is never applied.
 */
export function applyAnchorColours(
	target: Blockly.Workspace,
	detail: Blockly.Workspace,
	anchors: ZoomAnchors
): void {
	const styles = target instanceof Blockly.WorkspaceSvg ? target.getTheme().blockStyles : undefined;
	for (const zoomId of Object.keys(anchors)) {
		const anchorId = anchors[zoomId];
		const block = target.getBlockById(zoomId);
		const anchor = detail.getBlockById(anchorId);
		if (!block || !anchor || !block.type.startsWith('zoom_')) continue;

		const style = anchor.getStyleName();
		if (style && !style.startsWith('auto_') && styles?.[style]) block.setStyle(style);
		else block.setColour(anchor.getColour());
	}
}
