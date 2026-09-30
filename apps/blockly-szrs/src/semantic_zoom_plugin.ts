// Copyright 2026 appinventor.org, All rights reserved
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

// TODO: Edit plugin overview.
/**
 * @fileoverview Plugin overview.
 */
import * as Blockly from 'blockly/core';
import { ZoomControls } from './components/zoom_controls';
import type { ZoomLevel } from './components/zoom_level_widget';
import { requestZoom, type ZoomClientOptions, type ZoomProgressEvent } from './zoom_client';
import { ZoomSession } from './zoom_session';

export interface SemanticZoomOptions {
	/** Where this site's llm-proxy is and which model to use. */
	proxy: ZoomClientOptions;
	/**
	 * Returns a name for the program being zoomed, e.g. "fizz-buzz-n". It
	 * becomes the prefix of the generated block types. Called on each zoom.
	 */
	getSlug: () => string;
	/**
	 * Optional host element for the zoom controls. When omitted, the controls
	 * float over the workspace and position themselves.
	 */
	zoomControlsContainer?: HTMLElement;
}

// TODO: Rename plugin and edit plugin description.
/**
 * Plugin description.
 */
export class SemanticZoomPlugin {
	/** The workspace. */
	protected workspace: Blockly.WorkspaceSvg;
	protected zoomControls: ZoomControls;
	protected zoomSession: ZoomSession;
	private readonly getSlug: () => string;
	private level: ZoomLevel = 'detail';
	/** The Detail workspace, saved when the user first leaves the Detail level. */
	private detailSnapshot: Record<string, unknown> | null = null;

	/**
	 * Constructor for ...
	 *
	 * @param workspace The workspace that the plugin will
	 *     be added to.
	 * @param options How to reach the proxy, how to name the program, and
	 *     where to render the zoom controls.
	 */
	constructor(workspace: Blockly.WorkspaceSvg, options: SemanticZoomOptions) {
		this.workspace = workspace;
		this.getSlug = options.getSlug;
		this.zoomControls = new ZoomControls(
			workspace,
			this.handleLevelChange,
			options.zoomControlsContainer
		);
		this.zoomSession = new ZoomSession(
			(target, init) => requestZoom(options.proxy, target, init),
			this.handleProgress
		);
	}

	/**
	 * Initialize.
	 */
	init(): void {
		this.zoomControls.init();
	}

	dispose(): void {
		this.zoomSession.cancel();
		this.zoomControls.dispose();
	}

	private handleLevelChange = (level: ZoomLevel): void => {
		this.level = level;
		if (level === 'detail') {
			this.zoomSession.cancel();
			this.detailSnapshot = null;
			this.zoomControls.setStatus(null);
			return;
		}
		if (!this.detailSnapshot) {
			if (this.workspace.getAllBlocks(false).length === 0) {
				this.revertToDetail('Nothing to zoom');
				return;
			}
			this.detailSnapshot = Blockly.serialization.workspaces.save(this.workspace);
		}
		void this.zoom(this.detailSnapshot, level);
	};

	private async zoom(
		workspaceJson: Record<string, unknown>,
		level: Exclude<ZoomLevel, 'detail'>
	): Promise<void> {
		this.zoomControls.setStatus('Zooming…');
		let result;
		try {
			result = await this.zoomSession.zoom({ slug: this.getSlug(), workspaceJson });
		} catch (error) {
			if ((error as { name?: unknown } | null)?.name === 'AbortError') return;
			console.warn('Semantic zoom failed:', error);
			this.revertToDetail('Zoom failed', error instanceof Error ? error.message : String(error));
			return;
		}
		// The user may have moved to another level while this was loading.
		if (this.level !== level) return;
		this.zoomControls.setStatus(null);
		// TODO: apply the zoomed level to the workspace (next chunk).
		console.log(`Zoom ready (${level}):`, result[level]);
	}

	private handleProgress = (event: ZoomProgressEvent): void => {
		if (event.type === 'attempt' && event.attempt > 1) {
			this.zoomControls.setStatus(`Retry ${event.attempt}/${event.maxAttempts}`);
		}
	};

	private revertToDetail(status: string, details?: string): void {
		this.level = 'detail';
		this.detailSnapshot = null;
		this.zoomControls.showLevel('detail');
		this.zoomControls.setStatus(status, { error: true, title: details });
	}
}
