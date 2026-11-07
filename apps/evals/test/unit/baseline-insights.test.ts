// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';

import type { BenchmarkModel } from '../../baseline/model-registry.js';
import { rescore, type BaselineFile } from '../../baseline/summary.js';
import {
	BASELINE_CHART_GROUPS,
	BASELINE_METRICS,
	glossary,
	programGrid,
	promptEffect,
	standsOut
} from '../../report/baseline-insights.js';
import { baselineReport } from '../../report/baseline.js';
import { renderReport } from '../../report/render.js';
import { ok, runWith, validZoom } from './support/baseline-fakes.js';

const model = (id: string): BenchmarkModel => ({ id, model: `openrouter/x/${id}` });
const bad = ok('{"semantic": 1}');

/** Two models, two prompts, one program: `a` is valid with both prompts, `b` fails the first and passes the second. */
async function fixture(): Promise<BaselineFile> {
	const good = ok(validZoom(), { provider: 'P', cost: 0.01 });
	return {
		kind: 'baseline',
		runId: 'fixture',
		modelIds: ['a', 'b'],
		models: {
			a: { model: 'model-a', provider: 'openrouter', vendor: 'x' },
			b: { model: 'model-b', provider: 'openrouter', vendor: 'y' }
		},
		records: [
			await runWith(model('a'), async () => good, 'v0'),
			await runWith(model('a'), async () => good, 'v1'),
			await runWith(model('b'), async () => bad, 'v0'),
			await runWith(model('b'), async () => good, 'v1')
		]
	};
}

describe('standsOut', () => {
	it('counts the valid runs for each prompt, and says why the others failed', async () => {
		const file = await fixture();
		const html = standsOut(file, rescore(file));
		expect(html).toContain('<code>v0</code>: <strong>1 of 2</strong> (50%)');
		expect(html).toContain('<code>v1</code>: <strong>2 of 2</strong> (100%)');
		expect(html).toContain('<code>v0</code>: 1 the wrong shape');
		expect(html).toContain('<code>v1</code>: none');
	});

	it('names the models whose validity moved by ten points or more, with the counts', async () => {
		const file = await fixture();
		const html = standsOut(file, rescore(file));
		expect(html).toContain('for 1 of 2 models');
		expect(html).toContain('Up: model-b (0 to 1 of 1)');
		expect(html).not.toContain('Down:');
		expect(html).toContain('1 changed less than that');
	});

	it('uses the model names, not the ids, and escapes them', async () => {
		const file = await fixture();
		file.models = { ...file.models, a: { model: '<b>a</b>' } };
		const html = standsOut(file, rescore(file));
		expect(html).toContain('&lt;b&gt;a&lt;/b&gt;');
		expect(html).not.toContain('<b>a</b>');
	});

	it('does not claim a judgment, and says where the interpretation is', async () => {
		const file = await fixture();
		const html = standsOut(file, rescore(file));
		expect(html).toContain('not judgments about quality');
		expect(html).toContain('write-up');
	});

	it('reports the recorded cost, and valid zooms that do not load', async () => {
		const file = await fixture();
		const html = standsOut(file, rescore(file));
		expect(html).toContain('$0.03');
		expect(html).toContain('0 of 3 valid zooms');
	});
});

describe('promptEffect', () => {
	it('shows each model from the first prompt to the second, with an arrow and a word, best change first', async () => {
		const file = await fixture();
		const html = promptEffect(file, rescore(file));
		expect(html).toContain('0% → 100%');
		expect(html).toContain('+100 pts');
		expect(html).toContain('(better)');
		expect(html).toContain('All models');
		expect(html.indexOf('model-b')).toBeLessThan(html.indexOf('model-a'));
	});

	it('calls a small change about the same, and does not call a cost increase better', async () => {
		const file = await fixture();
		const html = promptEffect(file, rescore(file));
		expect(html).toContain('about the same');
		file.records[1] = {
			...file.records[1],
			attempts: file.records[1].attempts.map((a) => ({ ...a, cost: 0.05 }))
		};
		const dearer = promptEffect(file, rescore(file));
		expect(dearer).toMatch(/delta bad[^>]*>[\s\S]{0,80}\+400%/);
	});

	it('needs two prompts', async () => {
		const file = await fixture();
		file.records = file.records.filter((r) => r.prompt.id === 'v0');
		expect(promptEffect(file, rescore(file))).toContain('Needs two prompts');
	});
});

describe('programGrid', () => {
	it('has a row per program and a column per model, with the result for each prompt', async () => {
		const file = await fixture();
		const html = programGrid(file, rescore(file));
		expect(html).toContain('Countdown');
		expect(html).toContain('14 blocks');
		expect(html).toContain('>model-a<');
		expect(html).toContain('>model-b<');
		expect(html).toContain('v0 ✓ 1');
		expect(html).toContain('v0 ✕ schema');
		expect(html).toContain('title="v0: failed, the wrong shape"');
	});
});

describe('the baseline report', () => {
	it('charts only numbers it can explain, in groups that cover all of them', async () => {
		const file = await fixture();
		const report = baselineReport(file);
		const charted = new Set(report?.rows.flatMap((row) => Object.keys(row.metrics)));
		const grouped = new Set(BASELINE_CHART_GROUPS.flatMap((group) => group.keys));
		for (const key of charted) {
			expect(BASELINE_METRICS[key], `${key} has no description`).toBeDefined();
			expect(grouped.has(key), `${key} is in no chart group`).toBe(true);
		}
		for (const key of grouped) expect(BASELINE_METRICS[key], `${key}`).toBeDefined();
	});

	it('puts the findings first, the glossary after the charts, and the outputs last and closed', async () => {
		const file = await fixture();
		const html = renderReport(baselineReport(file)!);
		const at = (needle: string): number => html.indexOf(needle);
		expect(at('id="s-what-stands-out"')).toBeLessThan(at('id="s-does-it-work"'));
		expect(at('id="s-does-it-work"')).toBeLessThan(at('id="s-what-the-measures-mean"'));
		expect(at('id="s-what-the-measures-mean"')).toBeLessThan(at('id="s-the-outputs"'));
		expect(html).toMatch(/<details class="section" id="s-what-the-measures-mean">/);
		expect(html).toMatch(/<details class="section" id="s-the-outputs">/);
		expect(html).toMatch(/<details class="section" id="s-what-stands-out" open>/);
	});

	it('explains every measure in the glossary', () => {
		const html = glossary();
		for (const info of Object.values(BASELINE_METRICS))
			expect(html).toContain(info.label.replace(/&/g, '&amp;').replace(/’/g, '’'));
	});
});
