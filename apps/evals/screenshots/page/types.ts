// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import type { ZoomLevel } from '@szrs/llm-proxy-contracts';
import type { ZoomAnchors } from '@szrs/llm-proxy-contracts/anchors';

type Json = Record<string, unknown>;

export interface Job {
	/** The Detail program, as the model was given it (canonical ids). */
	detail: Json;
	/** A custom block set the program needs, if any. */
	blockDefs?: Json[];
	/** A zoom level to draw; without it the Detail program itself is drawn. */
	level?: ZoomLevel;
	/** For a level: the Detail block each zoom block stands for; the plugin colours the zoom blocks by them. */
	anchors?: ZoomAnchors;
}

export interface Drawn {
	error?: string;
	/** All blocks, and the top-level ones, as drawn. */
	blocks: number;
	topBlocks: number;
	/** Pairs of top-level blocks whose rectangles overlap (D25). */
	overlaps: number;
	/** The distinct block colours, as hex strings. */
	colours: string[];
}
