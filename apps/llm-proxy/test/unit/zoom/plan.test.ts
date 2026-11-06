// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';

import { readPlan } from '../../../src/zoom/plan.js';
import { parseZoomResponse } from '../../../src/zoom/zoom.js';

describe('readPlan', () => {
	it('reads a complete plan', () => {
		const plan = {
			purpose: 'dice game',
			concepts: [{ id: 'c1', name: 'roll', stacks: ['b1', 'b2'], operations: ['s1'] }]
		};

		expect(readPlan({ plan })).toEqual(plan);
	});

	it.each([undefined, null, 'text', 7, [], {}, { plan: null }, { plan: 'x' }, { plan: [] }])(
		'returns undefined when there is no plan object (%j)',
		(raw) => {
			expect(readPlan(raw)).toBeUndefined();
		}
	);

	it('keeps what is readable of a partial plan', () => {
		expect(readPlan({ plan: { purpose: 3 } })).toEqual({ concepts: [] });
		expect(readPlan({ plan: { concepts: 'none' } })).toEqual({ concepts: [] });
		expect(
			readPlan({
				plan: {
					concepts: [
						{ id: 'c1', stacks: ['b1', 4, null], operations: 'not a list' },
						'junk',
						{ name: 7 }
					]
				}
			})
		).toEqual({
			concepts: [
				{ id: 'c1', stacks: ['b1'], operations: [] },
				{ stacks: [], operations: [] }
			]
		});
	});
});

describe('parseZoomResponse and the plan', () => {
	const level = (type: string) => ({
		blockDefs: [{ type, message0: 'x' }],
		workspaceJson: { blocks: { languageVersion: 0, blocks: [] } },
		bindings: []
	});
	const zoom = { semantic: level('zoom_x_op'), concept: level('zoom_x_concept') };

	it('returns the plan but keeps it out of the result', () => {
		const plan = { purpose: 'p', concepts: [] };

		const parsed = parseZoomResponse(JSON.stringify({ plan, ...zoom }), {});

		expect(parsed.plan).toEqual(plan);
		expect(parsed.result).toEqual(zoom);
		expect('plan' in parsed.result).toBe(false);
	});

	it('does not need a plan, and a malformed one never fails the response', () => {
		expect(parseZoomResponse(JSON.stringify(zoom), {}).plan).toBeUndefined();
		expect(parseZoomResponse(JSON.stringify({ plan: 42, ...zoom }), {}).result).toEqual(zoom);
		expect(
			parseZoomResponse(JSON.stringify({ plan: { concepts: [null, 1] }, ...zoom }), {}).result
		).toEqual(zoom);
	});
});
