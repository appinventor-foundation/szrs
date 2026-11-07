// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';

import type { EvalRecord } from '../../baseline/record.js';
import { renderReport } from '../../report/render.js';
import { screenshotsReport } from '../../report/screenshots.js';
import { smokeReport } from '../../report/smoke.js';
import { detailFile, levelFile, selectRecords } from '../../screenshots/plan.js';

const record = (program: string, model: string, prompt: string, sample = 1): EvalRecord =>
	({
		program: { id: program },
		model: { id: model },
		prompt: { id: prompt },
		sample
	}) as unknown as EvalRecord;

describe('selectRecords', () => {
	const stored = [
		record('a', 'm1', 'v1'),
		record('a', 'm1', 'v0'),
		record('b', 'm1', 'v0'),
		record('b', 'm1', 'v1'),
		record('a', 'm1', 'v1', 2)
	];

	it('returns the runs in program, model, prompt order, whatever order they were stored in', () => {
		const picked = selectRecords(stored, ['b', 'a'], ['m1'], ['v0', 'v1']);
		expect(picked.map((r) => `${r.program.id}${r.prompt.id}`)).toEqual([
			'bv0',
			'bv1',
			'av0',
			'av1'
		]);
	});

	it('takes the first sample only', () => {
		expect(selectRecords(stored, ['a'], ['m1'], ['v1'])[0].sample).toBe(1);
	});

	it('names every missing combination instead of quietly drawing fewer', () => {
		expect(() => selectRecords(stored, ['a', 'zzz'], ['m1', 'm2'], ['v0'])).toThrow(
			'a / m2 / v0; zzz / m1 / v0; zzz / m2 / v0'
		);
	});
});

describe('file names', () => {
	it('are plain, and the same for the script and the gallery', () => {
		expect(detailFile('tic-tac-toe')).toBe('tic-tac-toe__detail.png');
		expect(levelFile('tic-tac-toe', 'glm-5.3-flash', 'v1', 'concept')).toBe(
			'tic-tac-toe__glm-5.3-flash__v1__concept.png'
		);
		expect(levelFile('a', 'b', 'c', 'semantic')).toMatch(/^[\w.-]+\.png$/);
	});
});

const level = (extra: Record<string, unknown> = {}) => ({
	file: 'dice__m1__v1__semantic.png',
	blocks: 4,
	topBlocks: 3,
	overlaps: 0,
	colours: ['#000000'],
	...extra
});

const item = (extra: Record<string, unknown> = {}) => ({
	program: 'dice',
	model: 'm1',
	prompt: 'v1',
	status: 'ok',
	attempts: 1,
	levels: {
		semantic: level(),
		concept: level({ file: 'dice__m1__v1__concept.png', topBlocks: 1 })
	},
	...extra
});

const screenshots = (items: unknown[] = [item()], extra: Record<string, unknown> = {}) => ({
	kind: 'baseline-screenshots',
	ranAt: '2026-11-07T20:00:00.000Z',
	source: '2026-11-07-baseline.json',
	screenshots: '2026-11-07-baseline-screenshots',
	prompts: ['v0', 'v1'],
	models: { m1: { model: 'glm-5.3-flash', provider: 'openrouter', vendor: 'z-ai' } },
	programs: [
		{
			id: 'dice',
			title: 'Dice game',
			tier: 'S',
			blocks: 14,
			topLevelStacks: 3,
			expectedConcepts: [2, 4],
			detail: { blocks: 14, topBlocks: 3, overlaps: 0, colours: [] }
		}
	],
	items,
	...extra
});

const html = (json: unknown): string =>
	screenshotsReport(json)
		?.sections.map((s) => s.html)
		.join('\n') ?? '';

describe('screenshotsReport', () => {
	it('claims only its own kind of result', () => {
		expect(screenshotsReport({})).toBeUndefined();
		expect(screenshotsReport({ kind: 'smoke-check' })).toBeUndefined();
		expect(smokeReport(screenshots())).toBeUndefined();
		expect(screenshotsReport(screenshots())).toBeDefined();
	});

	it('has a table first, then a section per program', () => {
		const report = screenshotsReport(screenshots());
		expect(report?.sections.map((s) => s.title)).toEqual(['At a glance', 'Dice game']);
		expect(report?.subtitle).toContain('from 2026-11-07-baseline.json');
		expect(report?.sections[1].description).toContain('Expected concepts');
		expect(report?.sections[1].description).toContain('2 to 4');
	});

	it('links every picture by relative path, at natural size', () => {
		const out = html(screenshots());
		expect(out).toContain('href="2026-11-07-baseline-screenshots/dice__detail.png"');
		expect(out).toContain('src="2026-11-07-baseline-screenshots/dice__m1__v1__semantic.png"');
		expect(out).toContain('class="shot natural"');
		expect(out).toContain('Concept: 1 top-level block');
	});

	it('puts a column per prompt under each model, and says when a prompt was not run', () => {
		const out = html(screenshots());
		expect(out).toContain('<h4>v0</h4><p class="muted">not run</p>');
		expect(out).toContain('<h4>v1</h4>');
		expect(out).toContain('glm-5.3-flash');
		expect(out).toContain('z-ai via openrouter');
	});

	it('shows an invalid run as such, with the last error to open', () => {
		const out = html(
			screenshots([item({ status: 'invalid', failure: 'schema', failureMessage: 'bad <b>shape' })])
		);
		expect(out).toContain('no valid zoom (schema, 1 attempt)');
		expect(out).toContain('bad &lt;b&gt;shape');
		expect(out).not.toContain('<b>shape');
		expect(out).not.toContain('dice__m1__v1__semantic.png');
	});

	it('shows a level the plugin could not load, with Blockly’s error, and no picture for it', () => {
		const out = html(
			screenshots([
				item({
					levels: {
						semantic: level({ error: 'missing a DO connection', file: undefined }),
						concept: level({ file: 'dice__m1__v1__concept.png' })
					}
				})
			])
		);
		expect(out).toContain('Semantic: the plugin cannot load this level');
		expect(out).toContain('missing a DO connection');
		expect(out).toContain('Semantic does not load');
		expect(out).toContain('dice__m1__v1__concept.png');
	});

	it('counts overlaps in the table and the caption, and names black', () => {
		const out = html(
			screenshots([
				item({
					levels: {
						semantic: level({ overlaps: 2 }),
						concept: level({ file: 'dice__m1__v1__concept.png' })
					}
				})
			])
		);
		expect(out).toContain('2 overlaps');
		expect(out).toContain('<td>2</td>');
		expect(out).toContain('black');
	});

	it('does not link a picture whose name could leave the folder, or trust a folder with a slash', () => {
		const traversal = html(
			screenshots([
				item({ levels: { semantic: level({ file: '../../secret.png' }), concept: level() } })
			])
		);
		expect(traversal).not.toContain('secret.png');

		expect(html(screenshots([item()], { screenshots: '../elsewhere' }))).not.toContain('<img');
	});

	it('only draws colours of the expected shape', () => {
		const out = html(
			screenshots([
				item({
					levels: {
						semantic: level({ colours: ['#a5805b', 'red;background:url(x)'] }),
						concept: level({ file: 'dice__m1__v1__concept.png' })
					}
				})
			])
		);
		expect(out).toContain('background:#a5805b');
		expect(out).not.toContain('url(x)');
	});

	it('renders as a whole page', () => {
		const report = screenshotsReport(screenshots());
		expect(report).toBeDefined();
		expect(renderReport(report!)).toContain('Baseline zooms, drawn');
	});
});
