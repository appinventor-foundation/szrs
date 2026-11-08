// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';

import { readPlan } from '../../../src/zoom/plan.js';
import { coloured } from '../coloured.js';
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

	it('returns the plan with the result, and on its own for the logs', () => {
		const plan = { purpose: 'p', concepts: [] };

		const parsed = parseZoomResponse(JSON.stringify({ plan, ...zoom }), {});

		expect(parsed.plan).toEqual(plan);
		expect(parsed.result).toEqual({ ...coloured(zoom), plan });
	});

	it('does not need a plan, and a malformed one never fails the response', () => {
		expect(parseZoomResponse(JSON.stringify(zoom), {}).plan).toBeUndefined();
		expect('plan' in parseZoomResponse(JSON.stringify(zoom), {}).result).toBe(false);
		expect(parseZoomResponse(JSON.stringify({ plan: 42, ...zoom }), {}).result).toEqual(
			coloured(zoom)
		);
		expect(
			parseZoomResponse(JSON.stringify({ plan: { concepts: [null, 1] }, ...zoom }), {}).result
		).toEqual({ ...coloured(zoom), plan: { concepts: [] } });
		// The kind of plan a strict schema would reject: the result still comes back.
		expect(
			parseZoomResponse(JSON.stringify({ plan: { concepts: 'x', covers: [1] }, ...zoom }), {})
				.result.plan
		).toEqual({ concepts: [] });
	});

	it('reads covers, dropping what is not a list of ids', () => {
		const plan = readPlan({
			plan: { concepts: [], covers: { s1: ['b1', 'b2'], s2: [], s3: 'b3', s4: ['b4', 7] } }
		});

		expect(plan?.covers).toEqual({ s1: ['b1', 'b2'], s4: ['b4'] });
		expect(readPlan({ plan: { concepts: [], covers: { s1: [] } } })).toEqual({ concepts: [] });
		expect(readPlan({ plan: { concepts: [], covers: 'none' } })).toEqual({ concepts: [] });
	});
});
