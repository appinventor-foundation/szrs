// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';

import type { BaselineFile } from '../../baseline/summary.js';
import { baselineReport, combineBaselines } from '../../report/baseline.js';
import { renderReport } from '../../report/render.js';
import { findProgram } from '../../baseline/corpus/index.js';
import { prepareProgram } from '../../baseline/prepare.js';
import { allBlocks } from '@szrs/llm-proxy/zoom/saved-blocks.js';
import { ok, run, script, validZoom, type ZoomJson } from './support/baseline-fakes.js';

describe('baseline report', () => {
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

	it('makes a report that names the model and escapes what the model wrote', async () => {
		const base = await file();
		base.records[1].attempts[0].rawText = '<script>alert(1)</script>';
		const report = baselineReport(base);
		expect(report?.rows).toHaveLength(2);
		expect(report?.rows[0]).toMatchObject({ model: 'glm-test', provider: 'openrouter', tier: 'S' });
		const html = renderReport(report!);
		expect(html).toContain('glm-test');
		expect(html).not.toContain('<script>alert(1)</script>');
	});

	it('says which commit the run was made on, and whether the tree was clean', async () => {
		const base = await file();
		expect(baselineReport(base)?.subtitle).not.toContain('commit');
		expect(
			baselineReport({ ...base, code: { commit: 'abc1234', dirty: false } })?.subtitle
		).toContain('commit abc1234');
		expect(
			baselineReport({ ...base, code: { commit: 'abc1234', dirty: true } })?.subtitle
		).toContain('abc1234 (with uncommitted changes)');
	});

	it('shows a timeout as one, apart from what the model wrote', async () => {
		const base = await file();
		base.records[1].attempts = [
			{
				n: 1,
				rawText: '',
				latencyMs: 1,
				upstreamError: { status: 0, message: 'x', timedOut: true }
			}
		];
		const report = baselineReport(base);
		expect(report?.rows[1].facts?.outcome).toBe('failed (timeout)');
		expect(report?.rows[1].metrics.timedOut).toBe(1);
		expect(report?.rows[0].metrics.timedOut).toBe(0);
	});

	it('leaves other kinds of file to their own adapters', () => {
		expect(baselineReport({ kind: 'smoke-check' })).toBeUndefined();
		expect(baselineReport({ modelIds: ['a'] })).toBeUndefined();
	});

	describe('colour anchors (D23, D24a)', () => {
		/** A `v3` run of countdown whose Semantic block is anchored on the program's first block. */
		const withCovers = async (): Promise<BaselineFile> => {
			const stack = allBlocks(prepareProgram(findProgram('countdown')).workspaceJson)[0].id!;
			const json = JSON.parse(validZoom({ withBinding: true })) as ZoomJson;
			json.plan.covers = { s1: [stack] };
			const record = await run(script(ok(JSON.stringify(json))).complete, 'v3');
			return { kind: 'baseline', runId: 'v3-run', modelIds: ['a'], records: [record] };
		};

		it('gives a run with covers its anchor rows, and a run without covers only the Concept one', async () => {
			const [withRow] = baselineReport(await withCovers())!.rows;
			expect(withRow.metrics).toMatchObject({
				semanticAnchored: 1,
				semanticAnchorsResolved: 1,
				conceptAnchorsResolved: 1,
				anchorFlagged: 0
			});

			const old = await run(script(ok(validZoom())).complete, 'v2');
			const [oldRow] = baselineReport({
				kind: 'baseline',
				runId: 'v2-run',
				modelIds: ['a'],
				records: [old]
			})!.rows;
			// No covers: no Semantic anchors, but the plan's concept still has one.
			expect(oldRow.metrics.semanticAnchored).toBe(0);
			expect(oldRow.metrics.semanticAnchorsResolved).toBeUndefined();
			expect(oldRow.metrics.conceptAnchorsResolved).toBe(1);
			expect(oldRow.metrics.anchorFlagged).toBeUndefined();
		});

		it('draws the anchor charts in their own group, with the plan ids in the glossary', async () => {
			const report = baselineReport(await withCovers())!;
			expect(report.chartGroups?.find((group) => group.title === 'Colour anchors')?.keys).toEqual([
				'semanticAnchored',
				'semanticAnchorsResolved',
				'conceptAnchorsResolved',
				'anchorFlagged'
			]);
			const html = renderReport(report);
			expect(html).toContain('Semantic anchors flagged by D24a');
			expect(html).toContain('D24a');
		});
	});

	describe('combineBaselines', () => {
		const make = async (id: string, prompt: string, commit: string): Promise<BaselineFile> => ({
			kind: 'baseline',
			runId: id,
			modelIds: ['a'],
			models: { a: { model: `from-${id}` } },
			prompts: [{ id: prompt, fingerprint: 'f', params: {} }],
			code: { commit, dirty: false },
			records: [await run(script(ok(validZoom())).complete, prompt)]
		});

		it('puts two prompts from two files in one report, with the prompt-effect table comparing them', async () => {
			const combined = combineBaselines([
				await make('run-v2', 'v2', 'aaa1111'),
				await make('run-v3', 'v3', 'bbb2222')
			]);

			expect(combined.runId).toBe('run-v2 + run-v3');
			expect(combined.records.map((record) => record.prompt.id)).toEqual(['v2', 'v3']);
			expect(combined.prompts?.map((prompt) => prompt.id)).toEqual(['v2', 'v3']);
			// The first file names the model; the commit is dropped because the files differ.
			expect(combined.models?.a.model).toBe('from-run-v2');
			expect(combined.code).toBeUndefined();

			const html = renderReport(baselineReport(combined)!);
			expect(html).toContain('Anchors flagged (D24a)');
			expect(html).toContain('v2');
			expect(html).toContain('v3');
		});

		it('keeps the commit when every file has the same one, and only the prompts asked for', async () => {
			const combined = combineBaselines(
				[await make('r1', 'v1', 'same123'), await make('r2', 'v2', 'same123')],
				['v2']
			);

			expect(combined.code).toEqual({ commit: 'same123', dirty: false });
			expect(combined.records.map((record) => record.prompt.id)).toEqual(['v2']);
			expect(combined.prompts?.map((prompt) => prompt.id)).toEqual(['v2']);
		});
	});
});
