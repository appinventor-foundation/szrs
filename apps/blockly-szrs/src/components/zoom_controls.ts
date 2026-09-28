// -*- mode: java; c-basic-offset: 2; -*-
// Copyright 2026 appinventor.org, All rights reserved
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import * as Blockly from 'blockly/core';

// TODO: (jos) create a Positioned version of the controls like the minimap
// Might also consider creating only a positioned version for this plugin
export class ZoomControls {
	protected ws: Blockly.WorkspaceSvg;
	protected zoomControlsContainer: HTMLDivElement | null = null;

	constructor(workspaceSvg: Blockly.WorkspaceSvg) {
		this.ws = workspaceSvg;
	}

	init() {
		console.log('I am being loaded');
		const primaryInjectParentDiv = this.ws.getInjectionDiv().parentNode;

		if (!primaryInjectParentDiv) {
			throw new Error(
				'The workspace must be injected into the page before the zoom controls can be initalized'
			);
		}

		// Create a wrapper div for the minimap injection.
		this.zoomControlsContainer = document.createElement('div');
		this.zoomControlsContainer.id = 'zoomControlsContainer' + this.ws.id;
		this.zoomControlsContainer.className = 'blockly-zoomControlsContainer';

		// Make the wrapper a sibling to the primary injection div.
		primaryInjectParentDiv?.appendChild(this.zoomControlsContainer);

		this.zoomControlsContainer.innerHTML = `<b>I am here!</b>`;
	}

	dispose() {
		Blockly.utils.dom.removeNode(this.zoomControlsContainer);
	}
}
