// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/**
 * The page the screenshot script drives. It draws a stored program, or one of
 * a zoom's levels, in a real Blockly workspace and says what it drew. Levels
 * go through the plugin's own `ZoomLevelLoader`, so the picture is what the
 * plugin shows: registered definitions, the arrange step, locked blocks.
 * Bundled by `render.ts`; nothing here runs in Node.
 */
import * as Blockly from 'blockly';

import { ZoomLevelLoader } from '../../../blockly-szrs/src/zoom_level_loader.ts';

import type { Drawn, Job } from './types.ts';

type Json = Record<string, unknown>;

const MAX_WIDTH = 1800;
const MAX_HEIGHT = 2600;
const PADDING = 20;

const loader = new ZoomLevelLoader();
const defined = new Set<string>();

function define(blockDefs: Json[] | undefined): void {
	const fresh = (blockDefs ?? []).filter(
		(def) => typeof def.type === 'string' && !defined.has(def.type)
	);
	for (const def of fresh) defined.add(String(def.type));
	if (fresh.length > 0) Blockly.common.defineBlocksWithJsonArray(fresh);
}

function overlapsIn(workspace: Blockly.WorkspaceSvg): number {
	const rects = workspace.getTopBlocks(false).map((block) => block.getBoundingRectangle());
	let count = 0;
	for (let i = 0; i < rects.length; i++) {
		for (let j = i + 1; j < rects.length; j++) {
			const a = rects[i];
			const b = rects[j];
			if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) count++;
		}
	}
	return count;
}

/** Sizes the container to the blocks (shrinking them if they would be huge) and puts them in the corner. */
function fit(workspace: Blockly.WorkspaceSvg, container: HTMLElement): void {
	const box = workspace.getBlocksBoundingBox();
	const width = Math.max(box.right - box.left, 1);
	const height = Math.max(box.bottom - box.top, 1);
	const scale = Math.min(1, (MAX_WIDTH - 2 * PADDING) / width, (MAX_HEIGHT - 2 * PADDING) / height);
	container.style.width = `${Math.max(Math.ceil(width * scale) + 2 * PADDING, 240)}px`;
	container.style.height = `${Math.max(Math.ceil(height * scale) + 2 * PADDING, 90)}px`;
	Blockly.svgResize(workspace);
	workspace.setScale(scale);
	workspace.scroll(PADDING - box.left * scale, PADDING - box.top * scale);
}

function colours(workspace: Blockly.Workspace): string[] {
	return [...new Set(workspace.getAllBlocks(false).map((block) => block.getColour()))];
}

(window as unknown as { drawJob: (job: Job) => Drawn }).drawJob = (job) => {
	const container = document.getElementById('ws');
	if (!container) throw new Error('no #ws element');
	container.replaceChildren();
	container.style.width = `${MAX_WIDTH}px`;
	container.style.height = `${MAX_HEIGHT}px`;

	define(job.blockDefs);
	const workspace = Blockly.inject(container, {
		scrollbars: false,
		trashcan: false,
		sounds: false,
		zoom: { controls: false, wheel: false },
		move: { scrollbars: false, drag: false, wheel: false }
	});
	const empty: Drawn = { blocks: 0, topBlocks: 0, overlaps: 0, colours: [] };
	try {
		if (job.level) {
			// The plugin keeps the Detail program in its own, rendered workspace; the loader reads bound
			// values and the anchors' styles and colours from it. Hidden here, as it is not drawn.
			const hidden = document.createElement('div');
			hidden.style.cssText = 'position:absolute;left:-10000px;width:400px;height:300px';
			document.body.appendChild(hidden);
			const detail = Blockly.inject(hidden, { sounds: false });
			try {
				Blockly.serialization.workspaces.load(job.detail, detail);
				loader.load(job.level, workspace, detail, job.anchors);
			} finally {
				detail.dispose();
				hidden.remove();
			}
		} else {
			Blockly.serialization.workspaces.load(job.detail, workspace);
			// Canonical Detail has no positions, so lay the stacks out as the user's own would be.
			workspace.cleanUp();
		}
	} catch (error) {
		loader.unregister();
		workspace.dispose();
		container.replaceChildren();
		return { ...empty, error: error instanceof Error ? error.message : String(error) };
	}

	Blockly.renderManagement.triggerQueuedRenders(workspace);
	fit(workspace, container);
	return {
		blocks: workspace.getAllBlocks(false).length,
		topBlocks: workspace.getTopBlocks(false).length,
		overlaps: overlapsIn(workspace),
		colours: colours(workspace)
	};
};
