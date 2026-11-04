// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import type * as BlocklyModule from 'blockly';
import type { Workspace } from '#lib/schemas/workspace.js';
import { toolbox } from './toolbox.js';

export type BlocklyEditorOptions = {
	// Where the dashboard forwards the plugin's calls to the LLM proxy.
	proxyUrl: string;
	// The model the plugin starts with, until the proxy's list arrives.
	model: string;
	// Prefix of the block types the plugin generates; letters, digits and underscores.
	slug: string;
	// The workspace to open, or null for an empty one.
	initial: Workspace | null;
};

// One Blockly workspace with the semantic-zoom plugin, mounted on an element
// with `{@attach editor.attach}`. Blockly only runs in the browser, so it is
// imported when the element appears, never during server rendering.
export class BlocklyEditor {
	// True once the workspace and the plugin are running.
	ready = $state(false);
	// True when the workspace changed since it was opened or last saved.
	dirty = $state(false);
	// Why it could not start, when it could not.
	failure = $state<string | null>(null);

	#options: BlocklyEditorOptions;
	#workspace: BlocklyModule.WorkspaceSvg | undefined;
	#blockly: typeof BlocklyModule | undefined;

	constructor(options: BlocklyEditorOptions) {
		this.#options = options;
	}

	// The workspace as Blockly saves it, for storing.
	serialize(): Workspace | null {
		if (!this.#workspace || !this.#blockly) return null;
		return this.#blockly.serialization.workspaces.save(this.#workspace);
	}

	// Puts a program on the workspace in place of what is there (null: an empty
	// one). Nothing is saved until the person saves, and Blockly's undo still works.
	load(workspace: Workspace | null): void {
		if (!this.#workspace || !this.#blockly) return;
		if (workspace) this.#blockly.serialization.workspaces.load(workspace, this.#workspace);
		else this.#workspace.clear();
		this.dirty = true;
	}

	markSaved(): void {
		this.dirty = false;
	}

	attach = (element: HTMLElement): (() => void) => {
		// The cleanup must be synchronous but the imports are not, so a
		// teardown that arrives first has to stop the start-up.
		let disposed = false;
		let teardown: (() => void) | undefined;

		const start = async () => {
			const [blockly, { SemanticZoomPlugin }] = await Promise.all([
				import('blockly'),
				import('@szrs/blockly-szrs')
			]);
			if (disposed) return;

			const workspace = blockly.inject(element, {
				toolbox,
				trashcan: true,
				// Blockly would fetch its sound effects from a third-party host.
				sounds: false,
				zoom: { wheel: true, controls: false },
				grid: { spacing: 20, length: 3, colour: '#ccc', snap: true }
			});

			// Loading would otherwise queue events that arrive after the change
			// listener below and mark a freshly opened workspace as edited.
			if (this.#options.initial) {
				blockly.Events.disable();
				try {
					blockly.serialization.workspaces.load(this.#options.initial, workspace);
				} finally {
					blockly.Events.enable();
				}
			}

			const plugin = new SemanticZoomPlugin(workspace, {
				proxy: { proxyUrl: this.#options.proxyUrl, model: this.#options.model },
				getSlug: () => this.#options.slug
			});
			plugin.init();

			workspace.addChangeListener((event) => {
				if (!event.isUiEvent) this.dirty = true;
			});
			// Blockly follows the window, not the element it sits in.
			const observer = new ResizeObserver(() => blockly.svgResize(workspace));
			observer.observe(element);

			this.#blockly = blockly;
			this.#workspace = workspace;
			this.dirty = false;
			this.ready = true;
			teardown = () => {
				observer.disconnect();
				plugin.dispose();
				workspace.dispose();
			};
		};

		start().catch((error: unknown) => {
			console.error('Could not start the workspace:', error);
			this.failure = 'The workspace could not be loaded.';
		});

		return () => {
			disposed = true;
			this.ready = false;
			this.#workspace = undefined;
			this.#blockly = undefined;
			teardown?.();
		};
	};
}
