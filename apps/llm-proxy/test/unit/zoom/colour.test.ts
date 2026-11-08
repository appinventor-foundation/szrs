// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import type { ZoomResponse } from '@szrs/llm-proxy-contracts';
import { describe, expect, it } from 'vitest';

import { applyDefaultColour, DEFAULT_ZOOM_COLOUR } from '../../../src/zoom/colour.js';

const level = (...defs: Record<string, unknown>[]) => ({
	blockDefs: defs.map((def, i) => ({ type: `zoom_x_${i}`, ...def })),
	workspaceJson: {},
	bindings: []
});

describe('applyDefaultColour', () => {
	it('gives a definition with no colour the default one, in both levels', () => {
		const result: ZoomResponse = { semantic: level({}), concept: level({}) };

		applyDefaultColour(result);

		expect(result.semantic.blockDefs[0].colour).toBe(DEFAULT_ZOOM_COLOUR);
		expect(result.concept.blockDefs[0].colour).toBe(DEFAULT_ZOOM_COLOUR);
	});

	it('keeps a colour or a style the model gave, including hue 0', () => {
		const result: ZoomResponse = {
			semantic: level(
				{ colour: 30 },
				{ colour: 0 },
				{ style: 'loop_blocks' },
				{ colour: '#abcdef' }
			),
			concept: level({})
		};

		applyDefaultColour(result);

		expect(result.semantic.blockDefs.map((def) => def.colour)).toEqual([
			30,
			0,
			undefined,
			'#abcdef'
		]);
		expect(result.semantic.blockDefs[2]).not.toHaveProperty('colour');
	});
});
