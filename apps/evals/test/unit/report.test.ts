// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';

import { niceTicks, renderReport } from '../../report/render.js';
import type { Report, ResultRow } from '../../report/rows.js';
import { spikeReport } from '../../report/spike.js';

const row = (overrides: Partial<ResultRow> = {}): ResultRow => ({
	model: 'alias-a',
	prompt: 'v0',
	metrics: { conceptTopBlocks: 1, completionTokens: 1200 },
	...overrides
});

const report = (rows: ResultRow[], sections: Report['sections'] = []): Report => ({
	title: 'A check',
	rows,
	sections
});

const count = (text: string, part: string): number => text.split(part).length - 1;

describe('niceTicks', () => {
	it('uses round numbers, about four intervals, ending at or above the largest value', () => {
		expect(niceTicks(3)).toEqual([0, 1, 2, 3]);
		expect(niceTicks(1829)).toEqual([0, 500, 1000, 1500, 2000]);
		expect(niceTicks(73)).toEqual([0, 20, 40, 60, 80]);
		expect(niceTicks(0.7)).toEqual([0, 0.2, 0.4, 0.6, 0.8]);
		expect(niceTicks(0)).toEqual([0, 1]);
	});
});

describe('renderReport', () => {
	it('is one self-contained page that loads nothing from the network', () => {
		const html = renderReport(report([row()]));

		expect(html.startsWith('<!doctype html>')).toBe(true);
		expect(html).not.toMatch(/(?:src|href)="https?:/);
		expect(html).toContain('<title>A check</title>');
	});

	it('escapes everything from the results: model output is untrusted', () => {
		const evil = '<script>alert(1)</script>';
		const html = renderReport(
			report(
				[
					row({
						model: `"><img src=x onerror=alert(1)>`,
						prompt: evil,
						detail: {
							rawText: evil,
							error: evil,
							plan: { purpose: evil, concepts: [{ name: evil }] }
						}
					})
				],
				[{ title: evil, description: evil, html: '<p>trusted section html</p>' }]
			)
		);

		expect(html).not.toContain('<script>alert(1)');
		expect(html).not.toContain('<img src=x');
		expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
		expect(html).toContain('<p>trusted section html</p>');
		// Only the page's own tooltip script remains.
		expect(count(html, '<script>')).toBe(1);
	});

	it('draws a chart per metric, each with a table view', () => {
		const html = renderReport(report([row(), row({ prompt: 'v1' })]));

		expect(count(html, '<svg')).toBe(2);
		expect(count(html, 'class="table-view"')).toBe(2);
		expect(html).toContain('Concept blocks');
		expect(html).toContain('Output tokens (reasoning included)');
	});

	it('charts a metric it does not know by its key', () => {
		const html = renderReport(report([row({ metrics: { retries: 2 } })]));

		expect(html).toContain('>retries<');
		expect(count(html, '<svg')).toBe(1);
	});

	it('has a legend for two or more prompts, and none for one', () => {
		expect(renderReport(report([row(), row({ prompt: 'v1' })]))).toContain('class="legend"');
		expect(renderReport(report([row()]))).not.toContain('class="legend"');
	});

	it('gives a prompt the same colour in every chart, in a fixed order', () => {
		const html = renderReport(report([row(), row({ prompt: 'v1' })]));

		// Two charts, each with a v0 bar and a v1 bar.
		expect(count(html, 'fill="var(--s1)"')).toBe(2);
		expect(count(html, 'fill="var(--s2)"')).toBe(2);
		expect(html.indexOf('data-label="v0 ')).toBeLessThan(html.indexOf('data-label="v1 '));
	});

	it('folds prompts past the eighth into one neutral colour', () => {
		const rows = Array.from({ length: 10 }, (_, i) => row({ prompt: `p${i}` }));
		const html = renderReport(report(rows));

		expect(html).toContain('fill="var(--s8)"');
		expect(html).not.toContain('fill="var(--s9)"');
		expect(html).toContain('fill="var(--other)"');
	});

	it('draws bars no thicker than 24px, square at the base and rounded at the data end', () => {
		const html = renderReport(report([row()]));
		const path = /<path class="bar"[^>]* d="([^"]+)"/.exec(html)?.[1] ?? '';
		const parts = /^M8,([\d.]+)H([\d.]+)a4,4 0 0 1 4,4V([\d.]+)a4,4 0 0 1 -4,4H8Z$/.exec(path);

		// Square base: it starts at x=8 and closes back along the baseline. Rounded end: two 4px arcs.
		expect(parts).not.toBeNull();
		const [top, , bottomMinusRadius] = [Number(parts?.[1]), Number(parts?.[2]), Number(parts?.[3])];
		const thickness = bottomMinusRadius + 4 - top;
		expect(thickness).toBeGreaterThan(0);
		expect(thickness).toBeLessThanOrEqual(24);
	});

	it('gives every mark a tooltip text and a keyboard stop', () => {
		const html = renderReport(report([row({ model: 'm1', prompt: 'v1' })]));

		expect(html).toContain('tabindex="0"');
		expect(html).toContain('data-label="v1 · m1"');
		expect(html).toContain('data-value="1"');
	});

	it('shows the number of runs and the range when several samples are averaged', () => {
		const html = renderReport(
			report([
				row({ metrics: { completionTokens: 100 } }),
				row({ metrics: { completionTokens: 300 } })
			])
		);

		expect(html).toContain('data-value="200"');
		expect(html).toContain('2 runs, 100 to 300');
	});

	it('draws a panel per tier on a shared scale', () => {
		const html = renderReport(
			report([
				row({ tier: 'S', metrics: { completionTokens: 100 } }),
				row({ tier: 'M', metrics: { completionTokens: 900 } })
			])
		);

		expect(html).toContain('<h4>Tier S</h4>');
		expect(html).toContain('<h4>Tier M</h4>');
		// Both panels end their axis at the same tick (1,000), not at 100 and 1,000.
		expect(count(html, '>1,000</text>')).toBe(2);
	});

	it('names the model first, with where it comes from beside it', () => {
		const html = renderReport(
			report([
				row({
					model: 'glm-5.3-flash',
					provider: 'openrouter',
					vendor: 'z-ai',
					alias: 'openrouter-2'
				}),
				row({ model: 'gpt-4o-mini', provider: 'openai' })
			])
		);

		expect(html).toContain('>glm-5.3-flash<tspan class="via" dx="8">z-ai via openrouter</tspan>');
		expect(html).toContain('>gpt-4o-mini<tspan class="via" dx="8">openai</tspan>');
		expect(html).toContain('data-label="v0 · glm-5.3-flash (z-ai via openrouter)"');
		// The alias is a hint for the config, not something the charts lead with.
		expect(html).not.toContain('>openrouter-2<');
	});

	it('keeps one model served by two providers apart', () => {
		const html = renderReport(
			report([
				row({ model: 'glm-5.3-flash', provider: 'openrouter', metrics: { completionTokens: 100 } }),
				row({ model: 'glm-5.3-flash', provider: 'zai', metrics: { completionTokens: 900 } })
			])
		);

		expect(html).toContain('>openrouter</tspan>');
		expect(html).toContain('>zai</tspan>');
		expect(count(html, 'class="group"')).toBe(2);
	});

	it('lists the provider in the table view', () => {
		const html = renderReport(
			report([row({ model: 'glm-5.3-flash', provider: 'openrouter', vendor: 'z-ai' })])
		);

		expect(html).toContain('<th scope="col">Provider</th>');
		expect(html).toContain('<td>z-ai via openrouter</td>');
	});

	it('tolerates rows with nothing to chart', () => {
		const html = renderReport(report([row({ metrics: {} })]));

		expect(count(html, '<svg')).toBe(0);
		expect(html).toContain('A check');
	});

	it('shows the share of the cap as a meter with a word as well as a colour', () => {
		const html = renderReport(
			report([
				row({ metrics: { capUsedPercent: 90 }, facts: { cap: '8,192 tokens' } }),
				row({ model: 'alias-b', metrics: { capUsedPercent: 10 } })
			])
		);

		expect(html).toContain('class="fill critical"');
		expect(html).toContain('at the limit');
		expect(html).toContain('class="fill ok"');
		expect(html).toContain('plenty of room');
		expect(html).toContain('90%</strong> of 8,192 tokens');
		// The meter is not also drawn as a bar chart.
		expect(count(html, '<svg')).toBe(0);
	});
});

describe('spikeReport', () => {
	const zoom = (extra: Record<string, unknown> = {}) => ({
		ok: true,
		totalMs: 12_340,
		firstTokenMs: 4_650,
		usage: { promptTokens: 2000, completionTokens: 4096, totalTokens: 6096 },
		maxTokens: 8192,
		outcome: 'ok',
		finishReason: 'stop',
		repairs: [],
		semanticTopBlocks: 3,
		conceptTopBlocks: 3,
		bindings: 5,
		plan: { purpose: 'p', concepts: [] },
		rawText: '{}',
		...extra
	});
	const spike = {
		ranAt: '2026-11-06T16:00:00.000Z',
		aliases: ['alias-a'],
		models: {
			'alias-a': {
				model: 'glm-5.3-flash',
				provider: 'openrouter',
				vendor: 'z-ai',
				litellmModel: 'openrouter/z-ai/glm-5.3-flash'
			}
		},
		program: { blocks: 14, topLevelStacks: 3 },
		'alias-a': {
			temperature: { accepted: { status: 200 }, omitted: { status: 200 } },
			capAcceptance: { '8192': { status: 200 }, '131072': { status: 400, error: 'too large' } },
			capHonoured: {
				finishReason: 'length',
				usage: { completion_tokens: 256, completion_tokens_details: { reasoning_tokens: 256 } }
			},
			zooms: { v0: zoom(), v1: zoom({ conceptTopBlocks: 3 }) }
		}
	};

	it('does not claim a file that is not a spike result', () => {
		expect(spikeReport({})).toBeUndefined();
		expect(spikeReport(null)).toBeUndefined();
		expect(spikeReport({ rows: [] })).toBeUndefined();
	});

	it('maps each zoom to a row, in seconds and as a share of the cap', () => {
		const result = spikeReport(spike);

		expect(result?.rows).toHaveLength(2);
		expect(result?.rows[0]).toMatchObject({
			model: 'glm-5.3-flash',
			provider: 'openrouter',
			vendor: 'z-ai',
			alias: 'alias-a',
			prompt: 'v0',
			metrics: {
				promptTokens: 2000,
				completionTokens: 4096,
				capUsedPercent: 50,
				firstTokenSeconds: 4.7,
				totalSeconds: 12.3,
				conceptTopBlocks: 3
			},
			facts: { outcome: 'ok', finishReason: 'stop', cap: '8,192 tokens' }
		});
		expect(result?.subtitle).toContain('14-block, 3-stack');
		expect(result?.subtitle).toContain('1 model');
	});

	it('shows accepted and rejected settings with a mark and a word, not only a colour', () => {
		const html = spikeReport(spike)?.sections[0].html ?? '';

		expect(html).toContain('8,192');
		expect(html).toContain('class="chip ok"');
		expect(html).toContain('class="chip bad"');
		expect(html).toContain('title="too large"');
		expect(html).toContain('accepted</span>');
		expect(html).toContain('rejected</span>');
		expect(html).toContain('100% of 256 output tokens were reasoning (stopped: length)');
	});

	it('leads with the model name, and shows the alias only as a hint', () => {
		const html = spikeReport(spike)?.sections[0].html ?? '';

		expect(html).toContain(
			'<th scope="row">glm-5.3-flash<span class="via-line">z-ai via openrouter · alias alias-a</span></th>'
		);
		expect(html).toContain('<th scope="col">Model</th>');
	});

	it('falls back to the alias for a result recorded without its models', () => {
		const without = Object.fromEntries(Object.entries(spike).filter(([key]) => key !== 'models'));
		const result = spikeReport(without);

		expect(result?.rows[0]).toMatchObject({ model: 'alias-a', alias: 'alias-a' });
		expect(result?.rows[0]?.provider).toBeUndefined();
		expect(result?.sections[0].html).toContain('<th scope="row">alias-a</th>');
	});

	it('survives a result with missing parts', () => {
		const result = spikeReport({ aliases: ['alias-a'], 'alias-a': {} });

		expect(result?.rows).toEqual([]);
		expect(() => renderReport(result as Report)).not.toThrow();
	});

	it('renders a whole result without error', () => {
		const html = renderReport(spikeReport(spike) as Report);

		expect(html).toContain('Cap and temperature spike');
		expect(html).toContain('What each model accepts');
		expect(html).toContain('Share of the output cap used');
	});
});
