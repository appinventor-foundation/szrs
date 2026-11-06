// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';

import { renderReport } from '../../../checks/report/render.js';
import type { Report } from '../../../checks/report/rows.js';
import { smokeReport } from '../../../checks/report/smoke.js';
import { spikeReport } from '../../../checks/report/spike.js';

const level = (extra: Record<string, unknown> = {}) => ({
	topBlocks: 3,
	overlaps: 0,
	offscreen: 0,
	colours: ['rgb(0, 0, 0)'],
	labels: ['roll the dice', 'keep the score'],
	leaks: [],
	screenshot: 'dice__a__semantic.png',
	...extra
});

const attempt = (extra: Record<string, unknown> = {}) => ({
	promptId: 'v1',
	outcome: 'ok',
	usage: { completionTokens: 1500 },
	outline: { blocks: 14, stacks: 3 },
	plan: {
		concepts: [
			{ id: 'c1', stacks: ['b1'] },
			{ id: 'c2', stacks: ['b8'] },
			{ id: 'c3', stacks: ['b12'] }
		]
	},
	...extra
});

const run = (extra: Record<string, unknown> = {}) => ({
	program: 'dice',
	alias: 'a',
	via: 'demo runner',
	seconds: 12.5,
	info: 'Zoomed with a in 12s (1 attempt)',
	semantic: level(),
	concept: level({ screenshot: 'dice__a__concept.png' }),
	attempts: [attempt()],
	...extra
});

const smoke = (runs: unknown[] = [run()]) => ({
	kind: 'smoke-check',
	ranAt: '2026-11-06T18:00:00.000Z',
	aliases: ['a'],
	screenshots: '2026-11-06-smoke-check',
	models: { a: { model: 'glm-5.3-flash', provider: 'openrouter', vendor: 'z-ai' } },
	programs: [{ id: 'dice', title: 'Dice game', tests: 'Three stacks.', expectedConcepts: '3' }],
	runs
});

const html = (json: unknown): string =>
	smokeReport(json)
		?.sections.map((s) => s.html)
		.join('\n') ?? '';

describe('smokeReport', () => {
	it('claims only smoke-check results, and the spike viewer leaves them alone', () => {
		expect(smokeReport({})).toBeUndefined();
		expect(smokeReport({ aliases: ['a'] })).toBeUndefined();
		expect(spikeReport(smoke())).toBeUndefined();
		expect(smokeReport(smoke())).toBeDefined();
	});

	it('has a table first, then a section per program', () => {
		const report = smokeReport(smoke());

		expect(report?.sections.map((section) => section.title)).toEqual(['At a glance', 'Dice game']);
		expect(report?.subtitle).toContain('prompt v1');
		expect(report?.subtitle).toContain('1 program');
		expect(report?.rows).toEqual([]);
	});

	it('leads with the model name and shows the alias only as a fallback', () => {
		expect(html(smoke())).toContain('glm-5.3-flash');
		expect(html(smoke())).toContain('z-ai via openrouter');

		const without = Object.fromEntries(Object.entries(smoke()).filter(([key]) => key !== 'models'));
		expect(html(without)).toContain('<td>a</td>');
	});

	it('shows the screenshots by relative path, as links to the full pictures', () => {
		const out = html(smoke());

		expect(out).toContain('href="2026-11-06-smoke-check/dice__a__semantic.png"');
		expect(out).toContain('src="2026-11-06-smoke-check/dice__a__concept.png"');
		expect(out).toContain('<img loading="lazy"');
		expect(out).toContain('The program (Detail)');
	});

	it('does not link a screenshot whose name could leave the folder', () => {
		const out = html(smoke([run({ semantic: level({ screenshot: '../../secret.png' }) })]));

		expect(out).not.toContain('secret.png');
		const unsafe = html({ ...smoke(), screenshots: '../elsewhere' });
		expect(unsafe).not.toContain('<img');
	});

	it('escapes everything the browser or the model produced', () => {
		const evil = '<img src=x onerror=alert(1)>';
		const out = html(
			smoke([
				run({
					info: evil,
					semantic: level({ labels: [evil], colours: [`url(${evil})`] }),
					edit: { from: evil, to: '3', bound: false, boundFields: [evil], before: [], after: [] }
				}),
				run({ alias: 'b', error: evil })
			])
		);

		expect(out).not.toContain('<img src=x');
		expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
		// An odd colour is printed, not used as a style.
		expect(out).not.toContain('background:url');
	});

	it('shows a failed run as failed, with its error', () => {
		const out = html(
			smoke([run({ semantic: undefined, concept: undefined, error: 'Zoom failed: timed out' })])
		);

		expect(out).toContain('✕ failed: Zoom failed: timed out');
		expect(out).toContain('class="error"');
	});

	it('says in words when blocks overlap and when the colour was never set', () => {
		const clean = html(smoke());
		const bad = html(smoke([run({ semantic: level({ overlaps: 2 }) })]));

		expect(clean).toContain('✓ none');
		expect(clean).toContain('black (no colour was set)');
		expect(clean).toContain('class="swatch"');
		expect(bad).toContain('⚠ 2');
	});

	it('reports how the attempts went and how much of the program the plan covers', () => {
		const out = html(
			smoke([run({ attempts: [attempt({ outcome: 'schema', plan: undefined }), attempt()] })])
		);

		expect(out).toContain('2 attempts: schema, then ok');
		expect(out).toContain('3 concepts covering 3 of 3 stacks');
		expect(out).toContain('1,500 output tokens');
	});

	it('notices a plan that lists a stack twice or leaves one out', () => {
		const planned = (stacks: string[][]) =>
			attempt({ plan: { concepts: stacks.map((s) => ({ stacks: s })) } });

		expect(html(smoke([run({ attempts: [planned([['b1'], ['b8']])] })]))).toContain(
			'2 of 3 stacks'
		);
		expect(html(smoke([run({ attempts: [planned([['b1'], ['b1'], ['b8']])] })]))).toContain(
			'1 listed twice'
		);
	});

	it('shows whether an edit at the zoomed level reached Detail, or that the value was not exposed', () => {
		const reached = html(
			smoke([
				run({
					edit: {
						from: '7',
						to: '3',
						bound: true,
						boundFields: ['7'],
						before: ['7', 'x', '7'],
						after: ['3', 'x', '3']
					}
				})
			])
		);
		const missing = html(
			smoke([
				run({
					edit: { from: '10', to: '25', bound: false, boundFields: ['1'], before: [], after: [] }
				})
			])
		);

		expect(reached).toContain('✓ 7 → 3 reached 2 of 2 Detail fields showing 7');

		const partial = html(
			smoke([
				run({
					edit: {
						from: '7',
						to: '3',
						bound: true,
						boundFields: ['7', '7'],
						before: ['7', 'x', '7'],
						after: ['3', 'x', '7']
					}
				})
			])
		);
		expect(partial).toContain('⚠ 7 → 3 reached 1 of 2 Detail fields showing 7');
		expect(partial).toContain('bound to separate fields');
		expect(partial).not.toContain('✓ 7 → 3');
		expect(missing).toContain('✕ 10 was not exposed as a field (the fields were: 1)');
	});

	it('lists values a label spells out, as things to look at', () => {
		const out = html(
			smoke([run({ concept: level({ leaks: [{ label: 'count down from 10', value: '10' }] }) })])
		);

		expect(out).toContain('⚠ 1 to look at');
		expect(out).toContain('“count down from 10” contains 10');
	});

	it('counts a value only when it stands alone, not inside a longer word', () => {
		const leaks = [
			{ label: 'build a greeting for a person', value: 'greet' },
			{ label: 'play FizzBuzz up to', value: 'Fizz' },
			{ label: 'call greet with a name', value: 'greet' },
			{ label: 'count down from 10', value: '10' }
		];
		const out = html(smoke([run({ concept: level({ leaks }) })]));

		expect(out).toContain('⚠ 2 to look at');
		expect(out).toContain('“call greet with a name” contains greet');
		expect(out).toContain('“count down from 10” contains 10');
		expect(out).not.toContain('“build a greeting for a person”');
		expect(out).not.toContain('“play FizzBuzz up to”');
	});

	it('marks a proxy-only run, which has no runner picture', () => {
		const out = html(
			smoke([
				run({
					program: 'dice',
					via: 'proxy only',
					semantic: level({ screenshot: '' }),
					concept: level({ screenshot: '' })
				})
			])
		);

		expect(out).toContain('proxy only');
		expect(out).not.toContain('The program (Detail)');
		expect(out).not.toContain('<img');
	});

	it('renders as a page', () => {
		const page = renderReport(smokeReport(smoke()) as Report);

		expect(page).toContain('Zoom smoke check');
		expect(page).toContain('At a glance');
		expect(page).toContain('<img loading="lazy"');
	});
});
