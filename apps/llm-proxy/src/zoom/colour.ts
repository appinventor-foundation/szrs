// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import type { ZoomResponse } from '@szrs/llm-proxy-contracts';

/**
 * The colour of a zoom block whose definition sets none. Blockly draws such a
 * block black, which hides the cue colour gives in a block program. The plugin
 * replaces this with the colour of the Detail block a zoom block stands for
 * when the plan says which one that is; this is what is left when it does not.
 */
export const DEFAULT_ZOOM_COLOUR = '#7d8590';

/**
 * Gives every block definition that sets neither `colour` nor `style` the
 * default colour. The models are not asked for a colour; one that gives it
 * keeps it. Works in place.
 */
export function applyDefaultColour(result: ZoomResponse): void {
	for (const level of [result.semantic, result.concept]) {
		for (const def of level.blockDefs) {
			if (!('colour' in def) && !('style' in def)) def.colour = DEFAULT_ZOOM_COLOUR;
		}
	}
}
