// Copyright 2026 appinventor.org, All rights reserved
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

// TODO: Edit plugin overview.
/**
 * @fileoverview Plugin overview.
 */
import * as Blockly from 'blockly/core';
import { ZoomControls } from './components/zoom_controls';

// TODO: Rename plugin and edit plugin description.
/**
 * Plugin description.
 */
export class SemanticZoomPlugin {
	/** The workspace. */
	protected workspace: Blockly.WorkspaceSvg;
	protected zoomControls: ZoomControls;
	/**
	 * Constructor for ...
	 *
	 * @param workspace The workspace that the plugin will
	 *     be added to.
	 */
	constructor(workspace: Blockly.WorkspaceSvg) {
		this.workspace = workspace;
		this.zoomControls = new ZoomControls(this.workspace);
	}

	/**
	 * Initialize.
	 */
	init(): void {
		this.zoomControls.init();
	}

	dispose(): void {
		this.zoomControls.dispose();
	}
}
