// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { asNumber, esc, fmt, isRecord } from './html.js';
import { modelKey, modelVia, type Report, type ResultRow } from './rows.js';

// What the charts are called, in the order they appear. A metric that is not
// listed still gets a chart, labelled with its key, after these.
const METRICS: Record<string, { label: string; unit?: string; meterOnly?: boolean }> = {
	conceptTopBlocks: { label: 'Concept blocks' },
	semanticTopBlocks: { label: 'Semantic top-level blocks' },
	bindings: { label: 'Bindings' },
	promptTokens: { label: 'Input tokens' },
	completionTokens: { label: 'Output tokens (reasoning included)' },
	// Drawn as meters, not bars.
	capUsedPercent: { label: 'Share of the output cap used', unit: '%', meterOnly: true },
	firstTokenSeconds: { label: 'Seconds to the first token', unit: ' s' },
	totalSeconds: { label: 'Seconds in total', unit: ' s' }
};

const MAX_SERIES = 8;
const OTHER_SLOT = 'other';

// Layout of one chart, in SVG user units (the chart scales to its card).
const WIDTH = 680;
const PAD_LEFT = 8;
const PAD_RIGHT = 72;
const BAR_HEIGHT = 18;
const BAR_GAP = 2;
const GROUP_HEADER = 18;
const GROUP_GAP = 14;
const AXIS_BAND = 24;
const CORNER = 4;

interface Stats {
	n: number;
	mean: number;
	min: number;
	max: number;
}

function stats(values: number[]): Stats {
	const total = values.reduce((sum, value) => sum + value, 0);
	return {
		n: values.length,
		mean: total / values.length,
		min: Math.min(...values),
		max: Math.max(...values)
	};
}

/** Colour follows the prompt, in a fixed order, so a series keeps its colour in every chart. */
function seriesSlots(rows: ResultRow[]): Map<string, string> {
	const prompts = [...new Set(rows.map((row) => row.prompt))].sort();
	return new Map(
		prompts.map((prompt, index) => [prompt, index < MAX_SERIES ? `s${index + 1}` : OTHER_SLOT])
	);
}

function metricKeys(rows: ResultRow[]): string[] {
	const present = new Set<string>();
	for (const row of rows) {
		for (const [key, value] of Object.entries(row.metrics)) {
			if (asNumber(value) !== undefined) present.add(key);
		}
	}
	const known = Object.keys(METRICS).filter((key) => present.has(key));
	const others = [...present].filter((key) => !(key in METRICS)).sort();
	return [...known, ...others];
}

// Axis ticks at round numbers (1, 2 or 5 times a power of ten), about four
// intervals, the last at or above the largest value.
export function niceTicks(max: number): number[] {
	if (max <= 0) return [0, 1];
	const raw = max / 4;
	const magnitude = 10 ** Math.floor(Math.log10(raw));
	const step =
		[1, 2, 5, 10].map((m) => m * magnitude).find((candidate) => candidate >= raw) ?? 10 * magnitude;
	const count = Math.ceil(max / step - 1e-9);
	return Array.from({ length: count + 1 }, (_, i) => Math.round(i * step * 1e6) / 1e6);
}

// A bar with a square base and a 4px rounded data end.
function barPath(x: number, y: number, width: number, height: number): string {
	const r = Math.min(CORNER, width, height / 2);
	return `M${x},${y}H${x + width - r}a${r},${r} 0 0 1 ${r},${r}V${y + height - r}a${r},${r} 0 0 1 ${-r},${r}H${x}Z`;
}

interface Group {
	model: string;
	/** Where the model comes from, shown beside its name. */
	via: string;
	bars: { prompt: string; stats: Stats }[];
}

function groupRows(rows: ResultRow[], metric: string, prompts: string[]): Group[] {
	const groups: Group[] = [];
	for (const key of new Set(rows.map(modelKey))) {
		const ofModel = rows.filter((row) => modelKey(row) === key);
		const bars: Group['bars'] = [];
		for (const prompt of prompts) {
			const values = ofModel
				.filter((row) => row.prompt === prompt)
				.map((row) => asNumber(row.metrics[metric]))
				.filter((value): value is number => value !== undefined);
			if (values.length > 0) bars.push({ prompt, stats: stats(values) });
		}
		const first = ofModel[0];
		if (bars.length > 0 && first) groups.push({ model: first.model, via: modelVia(first), bars });
	}
	return groups;
}

function tipText(
	model: string,
	via: string,
	prompt: string,
	s: Stats,
	unit: string
): { value: string; label: string } {
	const range = s.n > 1 ? ` · ${s.n} runs, ${fmt(s.min)} to ${fmt(s.max)}${unit}` : '';
	return {
		value: `${fmt(s.mean)}${unit}`,
		label: `${prompt} · ${model}${via ? ` (${via})` : ''}${range}`
	};
}

function chartSvg(
	label: string,
	unit: string,
	groups: Group[],
	ticks: number[],
	slots: Map<string, string>
): string {
	const x0 = PAD_LEFT;
	const x1 = WIDTH - PAD_RIGHT;
	const domainMax = ticks[ticks.length - 1] ?? 1;
	const scale = (value: number): number => (value / domainMax) * (x1 - x0);

	const groupHeight = (group: Group): number =>
		GROUP_HEADER + group.bars.length * (BAR_HEIGHT + BAR_GAP) + GROUP_GAP;
	const plotHeight = groups.reduce((sum, group) => sum + groupHeight(group), 0);
	const height = plotHeight + AXIS_BAND;

	const parts: string[] = [];
	ticks.forEach((tick, index) => {
		const x = x0 + scale(tick);
		parts.push(`<line class="grid" x1="${x}" x2="${x}" y1="0" y2="${plotHeight}"/>`);
		parts.push(
			`<text class="tick" x="${x}" y="${plotHeight + 16}" text-anchor="${index === 0 ? 'start' : index === ticks.length - 1 ? 'end' : 'middle'}">${esc(fmt(tick))}</text>`
		);
	});

	let y = 0;
	for (const group of groups) {
		parts.push(
			`<text class="group" x="${x0}" y="${y + 12}">${esc(group.model)}${group.via ? `<tspan class="via" dx="8">${esc(group.via)}</tspan>` : ''}</text>`
		);
		y += GROUP_HEADER;
		for (const bar of group.bars) {
			const slot = slots.get(bar.prompt) ?? OTHER_SLOT;
			const width = scale(bar.stats.mean);
			const tip = tipText(group.model, group.via, bar.prompt, bar.stats, unit);
			const valueLabel = `${fmt(bar.stats.mean)}${unit}`;
			parts.push(
				`<g class="mark" tabindex="0" role="img" aria-label="${esc(`${tip.label}: ${tip.value}`)}" data-value="${esc(tip.value)}" data-label="${esc(tip.label)}">` +
					// The hit area is the whole row, wider than the bar.
					`<rect class="hit" x="0" y="${y - 1}" width="${WIDTH}" height="${BAR_HEIGHT + BAR_GAP + 2}"/>` +
					(width > 0
						? `<path class="bar" fill="var(--${slot})" d="${barPath(x0, y, width, BAR_HEIGHT)}"/>`
						: '') +
					`<text class="value" x="${x0 + width + 6}" y="${y + BAR_HEIGHT - 5}">${esc(valueLabel)}</text></g>`
			);
			y += BAR_HEIGHT + BAR_GAP;
		}
		y += GROUP_GAP;
	}

	return `<svg viewBox="0 0 ${WIDTH} ${height}" role="img" aria-label="${esc(label)}" width="100%" preserveAspectRatio="xMinYMin meet">${parts.join('')}</svg>`;
}

function tableView(label: string, unit: string, groups: Group[]): string {
	const body = groups
		.flatMap((group) =>
			group.bars.map(
				(bar) =>
					`<tr><th scope="row">${esc(group.model)}</th><td>${esc(group.via)}</td><td>${esc(bar.prompt)}</td><td class="num">${esc(fmt(bar.stats.mean))}${esc(unit)}</td><td class="num">${bar.stats.n}</td><td class="num">${esc(fmt(bar.stats.min))}${esc(unit)}</td><td class="num">${esc(fmt(bar.stats.max))}${esc(unit)}</td></tr>`
			)
		)
		.join('');
	return `<details class="table-view"><summary>Table view</summary><div class="table-wrap"><table><caption class="sr">${esc(label)}</caption><thead><tr><th scope="col">Model</th><th scope="col">Provider</th><th scope="col">Prompt</th><th scope="col">Mean</th><th scope="col">Runs</th><th scope="col">Min</th><th scope="col">Max</th></tr></thead><tbody>${body}</tbody></table></div></details>`;
}

function legend(slots: Map<string, string>): string {
	if (slots.size < 2) return '';
	const keys = [...slots].map(
		([prompt, slot]) =>
			`<span class="key"><i style="background:var(--${slot})"></i>${esc(prompt)}</span>`
	);
	return `<div class="legend" aria-label="Prompts">${keys.join('')}</div>`;
}

function charts(rows: ResultRow[], slots: Map<string, string>): string {
	const prompts = [...slots.keys()];
	const tiers = [...new Set(rows.map((row) => row.tier ?? ''))];
	const cards = metricKeys(rows)
		.filter((metric) => !METRICS[metric]?.meterOnly)
		.map((metric) => {
			const info = METRICS[metric] ?? { label: metric };
			const unit = info.unit ?? '';
			// One scale for every tier of a metric, so panels can be compared.
			const all = groupRows(rows, metric, prompts);
			const ticks = niceTicks(
				Math.max(...all.flatMap((group) => group.bars.map((bar) => bar.stats.max)))
			);
			const panels = tiers.map((tier) => {
				const groups = groupRows(
					rows.filter((row) => (row.tier ?? '') === tier),
					metric,
					prompts
				);
				if (groups.length === 0) return '';
				const heading = tier === '' ? '' : `<h4>Tier ${esc(tier)}</h4>`;
				return `<div class="panel">${heading}<div class="plot">${chartSvg(info.label, unit, groups, ticks, slots)}</div>${tableView(`${info.label}${tier ? `, tier ${tier}` : ''}`, unit, groups)}</div>`;
			});
			return `<figure class="card"><figcaption>${esc(info.label)}</figcaption>${panels.join('')}</figure>`;
		});
	return cards.join('');
}

// The share of the output cap each zoom used, as a meter: a ratio against a limit.
function capMeters(rows: ResultRow[], slots: Map<string, string>): string {
	const withCap = rows.filter((row) => asNumber(row.metrics.capUsedPercent) !== undefined);
	if (withCap.length === 0) return '';
	const items = withCap.map((row) => {
		const percent = asNumber(row.metrics.capUsedPercent) ?? 0;
		const shown = Math.max(0, Math.min(100, percent));
		const state = percent >= 85 ? 'critical' : percent >= 60 ? 'warning' : 'ok';
		const word =
			state === 'critical'
				? '✕ at the limit'
				: state === 'warning'
					? '⚠ getting close to the limit'
					: '✓ plenty of room';
		const cap = row.facts?.cap ? ` of ${row.facts.cap}` : '';
		return `<li class="meter-row"><span class="meter-name">${esc(row.model)}${modelVia(row) ? ` <span class="meter-via">${esc(modelVia(row))}</span>` : ''} <span class="meter-prompt"><i style="background:var(--${slots.get(row.prompt) ?? OTHER_SLOT})"></i>${esc(row.prompt)}</span></span><span class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${shown}" aria-label="${esc(`${row.model} ${row.prompt}: ${percent}% of the output cap`)}"><span class="fill ${state}" style="width:${shown}%"></span></span><span class="meter-text"><strong>${esc(percent)}%</strong>${esc(cap)} · ${esc(word)}</span></li>`;
	});
	return `<ul class="meters">${items.join('')}</ul>`;
}

function details(rows: ResultRow[]): string {
	const items = rows
		.filter(
			(row) =>
				row.detail && (row.detail.plan !== undefined || row.detail.rawText || row.detail.error)
		)
		.map((row) => {
			const parts: string[] = [];
			const facts = Object.entries(row.facts ?? {})
				.map(([key, value]) => `${esc(key)}: ${esc(value)}`)
				.join(' · ');
			if (facts) parts.push(`<p class="facts">${facts}</p>`);
			const plan = row.detail?.plan;
			if (isRecord(plan)) {
				const concepts = Array.isArray(plan.concepts) ? plan.concepts : [];
				const list = concepts
					.filter(isRecord)
					.map(
						(concept) =>
							`<li><strong>${esc(concept.name ?? concept.id ?? 'concept')}</strong> · stacks ${esc(Array.isArray(concept.stacks) ? concept.stacks.join(', ') : '')} · operations ${esc(Array.isArray(concept.operations) ? concept.operations.join(', ') : '')}</li>`
					)
					.join('');
				parts.push(
					`<p>${esc(typeof plan.purpose === 'string' ? plan.purpose : '')}</p>${list ? `<ul>${list}</ul>` : ''}`
				);
			}
			if (row.detail?.error) parts.push(`<p class="error">${esc(row.detail.error)}</p>`);
			if (row.detail?.rawText) parts.push(`<pre>${esc(row.detail.rawText)}</pre>`);
			return `<details class="output"><summary>${esc(row.model)}${modelVia(row) ? ` (${esc(modelVia(row))})` : ''} · ${esc(row.prompt)}${row.tier ? ` · tier ${esc(row.tier)}` : ''}${row.program ? ` · ${esc(row.program)}` : ''}</summary>${parts.join('')}</details>`;
		});
	return items.join('');
}

const PALETTE = {
	light: {
		series: [
			'#2a78d6',
			'#eb6834',
			'#1baf7a',
			'#eda100',
			'#e87ba4',
			'#008300',
			'#6250d6',
			'#e34948'
		],
		surface: '#fcfcfb',
		page: '#f9f9f7',
		primary: '#0b0b0b',
		secondary: '#52514e',
		muted: '#898781',
		grid: '#e1e0d9',
		baseline: '#c3c2b7',
		border: 'rgba(11,11,11,0.10)',
		success: '#006300',
		track: '#cde2fb'
	},
	dark: {
		series: [
			'#3987e5',
			'#d95926',
			'#199e70',
			'#c98500',
			'#d55181',
			'#008300',
			'#9085e9',
			'#e66767'
		],
		surface: '#1a1a19',
		page: '#0d0d0d',
		primary: '#f0efec',
		secondary: '#c3c2b7',
		muted: '#898781',
		grid: '#2c2c2a',
		baseline: '#383835',
		border: 'rgba(255,255,255,0.10)',
		success: '#0ca30c',
		track: '#0d366b'
	}
};

function themeVars(mode: 'light' | 'dark'): string {
	const p = PALETTE[mode];
	const series = p.series.map((hex, index) => `--s${index + 1}:${hex};`).join('');
	return `color-scheme:${mode};--surface:${p.surface};--page:${p.page};--primary:${p.primary};--secondary:${p.secondary};--muted:${p.muted};--grid:${p.grid};--baseline:${p.baseline};--border:${p.border};--success:${p.success};--track:${p.track};--${OTHER_SLOT}:${p.muted};${series}`;
}

const STYLE = `
.viz-root{${themeVars('light')}--good:#0ca30c;--warning:#fab219;--critical:#d03b3b}
@media (prefers-color-scheme: dark){:root:where(:not([data-theme="light"])) .viz-root{${themeVars('dark')}}}
:root[data-theme="dark"] .viz-root{${themeVars('dark')}}
*{box-sizing:border-box}
body{margin:0}
.viz-root{background:var(--page);color:var(--primary);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;min-height:100vh;padding:24px 16px 48px}
main{max-width:960px;margin:0 auto}
h1{font-size:24px;line-height:1.25;margin:0 0 4px}
h2{font-size:18px;margin:36px 0 4px}
h4{font-size:13px;font-weight:600;color:var(--secondary);margin:12px 0 0}
.subtitle,.description{color:var(--secondary);margin:0 0 12px}
.card,.section-card{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:16px;margin:0 0 16px}
figcaption{font-weight:600;margin-bottom:10px}
.plot{overflow-x:auto}
svg{display:block;min-width:600px;height:auto}
svg text{font-family:inherit;fill:var(--secondary)}
svg .group{fill:var(--primary);font-size:12px;font-weight:600}
svg .via{fill:var(--secondary);font-weight:400}
/* A halo in the surface colour, so a heading stays legible where a gridline crosses it. */
svg .group,svg .via{paint-order:stroke;stroke:var(--surface);stroke-width:4px;stroke-linejoin:round}
svg .value{fill:var(--primary);font-size:12px}
svg .tick{fill:var(--muted);font-size:11px}
svg .grid{stroke:var(--grid);stroke-width:1}
svg .hit{fill:transparent}
svg .mark{outline:none}
svg .mark:hover .bar,svg .mark:focus-visible .bar{opacity:.78}
svg .mark:focus-visible .hit{stroke:var(--secondary);stroke-width:1}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin:0 0 12px;color:var(--secondary)}
.key,.meter-prompt{display:inline-flex;align-items:center;gap:6px}
.key i,.meter-prompt i{display:inline-block;width:12px;height:12px;border-radius:3px}
.table-wrap{overflow-x:auto}
table{border-collapse:collapse;width:100%;min-width:520px;font-size:13px}
th,td{text-align:left;padding:6px 10px 6px 0;border-bottom:1px solid var(--grid);vertical-align:top}
thead th{color:var(--secondary);font-weight:600}
td.num{font-variant-numeric:tabular-nums;text-align:right}
.chips{display:flex;flex-wrap:wrap;gap:4px}
.chip{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:0 8px;font-size:12px;white-space:nowrap}
.chip.ok span[aria-hidden]{color:var(--success)}
.chip.bad span[aria-hidden]{color:var(--critical)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
details{margin:8px 0 0}
summary{cursor:pointer;color:var(--secondary)}
.output{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin:0 0 8px}
.output summary{color:var(--primary)}
pre{white-space:pre-wrap;word-break:break-word;font-size:12px;background:var(--page);border-radius:6px;padding:10px;max-height:360px;overflow:auto}
.facts{color:var(--secondary);font-size:13px}
.error{color:var(--critical)}
.meters{list-style:none;margin:0;padding:0}
.meter-row{display:grid;grid-template-columns:minmax(150px,220px) 1fr;gap:4px 16px;padding:8px 0;border-bottom:1px solid var(--grid)}
.meter-name{font-weight:600}
.meter-via{font-weight:400;color:var(--secondary);font-size:12px;display:block}
.via-line{display:block;font-weight:400;color:var(--secondary);font-size:12px}
.meter-prompt{font-weight:400;color:var(--secondary);margin-left:8px}
.meter{display:block;height:8px;border-radius:999px;background:var(--track);overflow:hidden;align-self:center}
.fill{display:block;height:100%;border-radius:999px;background:var(--s1)}
.fill.warning{background:var(--warning)}
.fill.critical{background:var(--critical)}
.meter-text{grid-column:2;color:var(--secondary);font-size:13px}
.meter-text strong{color:var(--primary)}
@media (max-width:560px){.meter-row{grid-template-columns:1fr}.meter-text{grid-column:1}}
#tip{position:fixed;z-index:10;pointer-events:none;background:var(--surface);border:1px solid var(--border);box-shadow:0 2px 8px rgba(0,0,0,.18);border-radius:6px;padding:6px 10px;font-size:12px;display:none;max-width:320px}
#tip strong{display:block;font-size:14px;color:var(--primary)}
#tip span{color:var(--secondary)}
`;

// One tooltip for every mark. Text goes in with textContent, never as markup.
const SCRIPT = `
(() => {
  const tip = document.getElementById('tip');
  const show = (mark, x, y) => {
    tip.replaceChildren();
    const value = document.createElement('strong');
    value.textContent = mark.dataset.value;
    const label = document.createElement('span');
    label.textContent = mark.dataset.label;
    tip.append(value, label);
    tip.style.display = 'block';
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(x + 14, window.innerWidth - w - 8)) + 'px';
    tip.style.top = Math.max(8, Math.min(y + 14, window.innerHeight - h - 8)) + 'px';
  };
  const hide = () => { tip.style.display = 'none'; };
  document.addEventListener('pointermove', (e) => {
    const mark = e.target.closest && e.target.closest('.mark');
    if (mark) show(mark, e.clientX, e.clientY); else hide();
  });
  document.addEventListener('focusin', (e) => {
    const mark = e.target.closest && e.target.closest('.mark');
    if (!mark) return;
    const box = mark.getBoundingClientRect();
    show(mark, box.left + 20, box.top);
  });
  document.addEventListener('focusout', hide);
})();
`;

/** The whole report as one self-contained HTML page (no network, no external files). */
export function renderReport(report: Report): string {
	const slots = seriesSlots(report.rows);
	const meters = capMeters(report.rows, slots);
	const chartHtml = charts(report.rows, slots);
	const outputs = details(report.rows);

	const sections = report.sections.map(
		(section) =>
			`<h2>${esc(section.title)}</h2>${section.description ? `<p class="description">${esc(section.description)}</p>` : ''}<div class="section-card">${section.html}</div>`
	);

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(report.title)}</title>
<style>${STYLE}</style>
</head>
<body class="viz-root">
<main>
<h1>${esc(report.title)}</h1>
${report.subtitle ? `<p class="subtitle">${esc(report.subtitle)}</p>` : ''}
${sections.join('\n')}
${meters ? `<h2>Share of the output cap used</h2><p class="description">Each zoom's output tokens (reasoning included) against the cap that run was sent with.</p><div class="section-card">${meters}</div>` : ''}
${chartHtml ? `<h2>Zoom by model and prompt</h2><p class="description">Each chart is one measure. Bars are means; the tooltip and table view give the number of runs and the range.</p>${legend(slots)}${chartHtml}` : ''}
${outputs ? `<h2>The outputs</h2><p class="description">The plan and the raw text each zoom returned.</p>${outputs}` : ''}
</main>
<div id="tip" role="tooltip"></div>
<script>${SCRIPT}</script>
</body>
</html>
`;
}
