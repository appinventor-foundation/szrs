// Copyright 2026 appinventor.org, All rights reserved
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/**
 * @fileoverview Plugin test.
 */

import * as Blockly from 'blockly';
import { toolboxCategories, createPlayground } from '@blockly/dev-tools';
import { SemanticZoomPlugin } from '../src/index';

/**
 * Create a workspace.
 *
 * @param blocklyDiv The blockly container div.
 * @param options The Blockly options.
 * @returns The created workspace.
 */
function createWorkspace(
	blocklyDiv: HTMLElement,
	options: Blockly.BlocklyOptions
): Blockly.WorkspaceSvg {
	const workspace = Blockly.inject(blocklyDiv, options);

	// TODO: Initialize your plugin here.
	const plugin = new SemanticZoomPlugin(workspace, {
		proxy: { proxyUrl: 'http://localhost:3000', model: 'openrouter' },
		getSlug: () => 'playground'
	});
	plugin.init();

	return workspace;
}

document.addEventListener('DOMContentLoaded', function () {
	const defaultOptions = {
		toolbox: toolboxCategories
	};
	const rootElement = document.getElementById('root');
	if (!rootElement) {
		throw new Error(`div with id 'root' not found`);
	}
	createPlayground(rootElement, createWorkspace, defaultOptions);
});
