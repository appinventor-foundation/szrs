// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/** What the proxy gives a block definition that sets no colour (src/zoom/colour.ts). */
export const DEFAULT_COLOUR = '#7d8590';

interface Levels {
	semantic: { blockDefs: object[] };
	concept: { blockDefs: object[] };
}

/** `zoom` as the proxy returns it: every definition without a colour has the default one. */
export function coloured<T extends Levels>(zoom: T): T {
	const withColour = (level: T['semantic']) => ({
		...level,
		blockDefs: level.blockDefs.map((def) => ({ colour: DEFAULT_COLOUR, ...def }))
	});
	return { ...zoom, semantic: withColour(zoom.semantic), concept: withColour(zoom.concept) };
}
