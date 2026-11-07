// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';

import { repairKind, scoreRecord } from '../../baseline/metrics.js';
import { findProgram } from '../../baseline/corpus/index.js';
import { prepareProgram } from '../../baseline/prepare.js';
import { allBlocks } from '@szrs/llm-proxy/zoom/saved-blocks.js';
import { pool } from '../../baseline/runner.js';
import { cells, rescore, type BaselineFile } from '../../baseline/summary.js';
import { ok, run, script, validZoom, type ZoomJson } from './support/baseline-fakes.js';

describe('runOne', () => {
	it('records a valid first attempt with the raw text, usage and the plan', async () => {
		const text = validZoom({ withBinding: true });
		const { complete, requests } = script(ok(text));
		const record = await run(complete);

		expect(requests).toHaveLength(1);
		expect(record.attempts).toHaveLength(1);
		expect(record.attempts[0].rawText).toBe(text);
		expect(record.metrics).toMatchObject({
			valid: true,
			validFirstAttempt: true,
			attemptsToSuccess: 1,
			bindings: 1,
			bindingValidity: 1,
			conceptCount: 1,
			conceptCountInRange: true,
			monotonic: true,
			completionTokens: 500,
			promptTokens: 1000
		});
		expect(record.metrics?.semantic?.loads).toBe(true);
		expect(record.metrics?.concept?.loads).toBe(true);
		expect(record.metrics?.coverage).toEqual({
			stacksCovered: 1,
			stacksDuplicated: 0,
			operationsCovered: 1
		});
		expect(record.plan?.purpose).toBe('counts down');
		expect(record.prompt.id).toBe('v1');
		expect(record.prompt.fingerprint).toMatch(/^[0-9a-f]{64}$/);
		expect(record.model.params).toEqual({ temperature: 0.2, maxTokens: 32768 });
	});

	it('retries with the error after invalid output, as the proxy does', async () => {
		const { complete, requests } = script(ok('not json at all'), ok(validZoom()));
		const record = await run(complete);

		expect(requests).toHaveLength(2);
		expect(requests[0].join('\n')).not.toContain('previous attempt');
		expect(requests[1][1]).toContain('Unexpected');
		expect(record.metrics).toMatchObject({
			valid: true,
			validFirstAttempt: false,
			attemptsToSuccess: 2,
			attempts: 2,
			completionTokens: 1000
		});
	});

	it('gives up after three attempts and says how the last one failed', async () => {
		const { complete, requests } = script(ok('{"semantic": 1}'));
		const record = await run(complete);

		expect(requests).toHaveLength(3);
		expect(record.metrics).toMatchObject({ valid: false, attempts: 3, failure: 'schema' });
		expect(record.result).toBeUndefined();
	});

	it('does not retry a truncated answer', async () => {
		const { complete, requests } = script(ok('{"semantic": {', { finishReason: 'length' }));
		const record = await run(complete);

		expect(requests).toHaveLength(1);
		expect(record.metrics).toMatchObject({ valid: false, truncated: true, failure: 'truncated' });
	});

	it('records an upstream error and stops', async () => {
		const { complete, requests } = script({ ok: false, status: 429, message: 'rate limited' });
		const record = await run(complete);

		expect(requests).toHaveLength(1);
		expect(record.attempts[0].upstreamError).toEqual({ status: 429, message: 'rate limited' });
		expect(record.metrics).toMatchObject({ valid: false, failure: 'other' });
	});

	it('records a timeout as its own kind of failure, with the repeats that came before it', async () => {
		const record = await run(async () => ({
			ok: false,
			status: 0,
			message: 'no answer after 2400s',
			timedOut: true,
			retries: 2
		}));
		expect(record.attempts).toHaveLength(1);
		expect(record.attempts[0]).toMatchObject({
			upstreamError: { status: 0, timedOut: true },
			retries: 2
		});
		expect(record.metrics).toMatchObject({ valid: false, failure: 'timeout' });
	});

	it('uses the prompt asked for', async () => {
		const v0 = script(ok(validZoom()));
		const v1 = script(ok(validZoom()));
		await run(v0.complete, 'v0');
		await run(v1.complete, 'v1');
		expect(v0.requests[0][0]).not.toBe(v1.requests[0][0]);
	});
});

describe('metrics', () => {
	const prepared = prepareProgram(findProgram('countdown'));
	const score = (text: string, headless = true) =>
		scoreRecord({ attempts: [{ n: 1, rawText: text, latencyMs: 1000 }] }, prepared, { headless });

	it('flags a Detail value repeated in a label (D17)', () => {
		expect(score(validZoom()).metrics.semantic?.valueLeaks).toEqual([]);
		const leaky = score(validZoom({ semanticLabel: 'count down from 10' })).metrics;
		expect(leaky.semantic?.valueLeaks).toEqual(['count down from 10']);
		expect(leaky.concept?.valueLeaks).toEqual([]);
	});

	it('flags names that break the rules (D16)', () => {
		const wrong = validZoom().replace(/zoom_countdown_countdown_concept/g, 'zoom_other_thing');
		const metrics = score(wrong).metrics;
		expect(metrics.concept?.namingProblems.join()).toContain('does not start with zoom_countdown_');
		expect(metrics.concept?.namingProblems.join()).toContain('should end with _concept');
	});

	it('reports a level that does not load (D5) while the zoom is still valid', () => {
		// Valid against the schema and Detail (which only look at zoom_ blocks), but Blockly has no such block.
		const json = JSON.parse(validZoom()) as ZoomJson;
		json.semantic.workspaceJson.blocks.blocks.push({ type: 'made_up_block', id: 's9' });
		const metrics = score(JSON.stringify(json)).metrics;
		expect(metrics.valid).toBe(true);
		expect(metrics.semantic?.loads).toBe(false);
		expect(metrics.semantic?.loadError).toBeTruthy();
		expect(score(JSON.stringify(json), false).metrics.semantic?.loads).toBeUndefined();
	});

	it('scores a binding to a missing Detail block as invalid even when the zoom failed (D6)', () => {
		const json = JSON.parse(validZoom({ withBinding: true })) as ZoomJson;
		json.semantic.bindings[0].detail[0].block = 'nope';
		const metrics = score(JSON.stringify(json)).metrics;
		expect(metrics.valid).toBe(false);
		expect(metrics.failure).toBe('validation');
		expect(metrics.bindings).toBe(1);
		expect(metrics.bindingValidity).toBe(0);
	});

	it('checks that bindings to several Detail fields start equal (D8)', () => {
		const repeated = prepareProgram(findProgram('repeated-value'));
		const sevens = allBlocks(repeated.workspaceJson).filter(
			(block) => block.type === 'math_number' && block.fields?.NUM === 7
		);
		const zoom = (second: (typeof sevens)[number]) =>
			JSON.stringify({
				semantic: {
					blockDefs: [
						{
							type: 'zoom_repeated_value_rounds',
							message0: 'rounds %1',
							args0: [{ type: 'field_number', name: 'N', value: 7 }],
							previousStatement: null,
							nextStatement: null
						}
					],
					workspaceJson: {
						blocks: {
							languageVersion: 0,
							blocks: [{ type: 'zoom_repeated_value_rounds', id: 's1' }]
						}
					},
					bindings: [
						{
							block: 's1',
							field: 'N',
							detail: [
								{ block: sevens[0].id, field: 'NUM' },
								{ block: second.id, field: 'NUM' }
							]
						}
					]
				},
				concept: {
					blockDefs: [{ type: 'zoom_repeated_value_all_concept', message0: 'say hello' }],
					workspaceJson: {
						blocks: {
							languageVersion: 0,
							blocks: [{ type: 'zoom_repeated_value_all_concept', id: 'c1' }]
						}
					},
					bindings: []
				}
			});
		const at = (text: string) =>
			scoreRecord({ attempts: [{ n: 1, rawText: text, latencyMs: 1 }] }, repeated).metrics;
		expect(at(zoom(sevens[1])).bindingConsistency).toBe(1);

		const other = allBlocks(repeated.workspaceJson).find(
			(block) => block.type === 'math_number' && block.fields?.NUM === 1
		)!;
		expect(at(zoom(other)).bindingConsistency).toBe(0);
	});

	it('groups repairs by kind (D4)', () => {
		expect(
			repairKind('semantic: added "nextStatement" to zoom_a_b, which has a block after it')
		).toBe('added "…" to zoom_…, which has a block after it');
		expect(
			repairKind(
				'concept.bindings[2]: moved from controls_if "b4" to the math_number "b9" inside it, which holds NUM'
			)
		).toBe('moved from controls_if "…" to the math_number "…" inside it, which holds NUM');
	});

	it('scores a plan that leaves a stack out or counts one twice (D11)', () => {
		const json = JSON.parse(validZoom()) as ZoomJson;
		json.plan.concepts.push({ id: 'c2', stacks: json.plan.concepts[0].stacks, operations: [] });
		const metrics = score(JSON.stringify(json)).metrics;
		expect(metrics.coverage).toMatchObject({ stacksCovered: 0, stacksDuplicated: 1 });
		json.plan.concepts = [];
		expect(score(JSON.stringify(json)).metrics.coverage?.stacksCovered).toBe(0);
	});

	it('finds the composition recall and the redundancy of the levels (D15, D18)', () => {
		const metrics = score(validZoom()).metrics;
		expect(metrics.compositionRecall).toBeUndefined();
		expect(metrics.redundancy).toBeGreaterThanOrEqual(0);
		expect(metrics.redundancy).toBeLessThanOrEqual(1);
	});
});

describe('summary', () => {
	const file = async (): Promise<BaselineFile> => {
		const good = await run(script(ok(validZoom())).complete, 'v1');
		const bad = await run(script(ok('{"semantic": 1}')).complete, 'v0');
		return {
			kind: 'baseline',
			runId: 'test-run',
			modelIds: ['a'],
			models: { a: { model: 'glm-test', provider: 'openrouter', vendor: 'z-ai' } },
			records: [good, bad]
		};
	};

	it('scores again from the stored text, whatever metrics the record holds', async () => {
		const base = await file();
		base.records[0].metrics = undefined;
		const scored = rescore(base);
		expect(scored.map((item) => item.metrics?.valid)).toEqual([true, false]);
	});

	it('reads a timeout recorded before the flag existed from its message', async () => {
		const base = await file();
		base.records[0].attempts = [
			{
				n: 1,
				rawText: '',
				latencyMs: 2473000,
				upstreamError: {
					status: 0,
					message: 'TimeoutError: The operation was aborted due to timeout'
				}
			}
		];
		const [first] = rescore(base);
		expect(first.metrics).toMatchObject({ valid: false, failure: 'timeout' });
		const [cell] = cells(rescore(base)).filter((c) => c.prompt === 'v1');
		expect(cell.timeouts).toBe(1);
		expect(cell.valid).toBe(0);
	});

	it('does not score a record of a program the corpus does not have', async () => {
		const base = await file();
		base.records[0].program.id = 'gone';
		const [first] = rescore(base);
		expect(first.metrics).toBeUndefined();
		expect(first.problem).toContain('Unknown corpus program');
	});

	it('counts by model, prompt and tier', async () => {
		const table = cells(rescore(await file()));
		expect(table).toHaveLength(2);
		expect(table.find((cell) => cell.prompt === 'v1')).toMatchObject({
			runs: 1,
			valid: 1,
			tier: 'S'
		});
		expect(table.find((cell) => cell.prompt === 'v0')).toMatchObject({ valid: 0, attempts: 3 });
	});
});

describe('pool', () => {
	it('keeps the order of results and never exceeds the limit', async () => {
		let running = 0;
		let peak = 0;
		const tasks = [30, 5, 20, 1, 10].map((ms, i) => async () => {
			running++;
			peak = Math.max(peak, running);
			await new Promise((done) => setTimeout(done, ms));
			running--;
			return i;
		});
		expect(await pool(tasks, 2)).toEqual([0, 1, 2, 3, 4]);
		expect(peak).toBe(2);
	});
});
