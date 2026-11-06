// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { asNumber, esc, fmt, isRecord } from './html.js';
import { identityOf } from './models.js';
import { modelVia, type Report, type ReportSection } from './rows.js';

/**
 * Reads the JSON that apps/dashboard/scripts/smoke-zoom.ts writes: the programs
 * run through the real demo runner, with a screenshot of every level. It is a
 * gallery and a table, not charts: a handful of programs on a few models is
 * read by looking, and the pictures are the point. Screenshots are linked by
 * relative path, so the page has to sit beside the JSON.
 */
export function smokeReport(json: unknown): Report | undefined {
	if (!isRecord(json) || json.kind !== 'smoke-check') return undefined;
	const runs = (Array.isArray(json.runs) ? json.runs : []).filter(isRecord);
	const programs = (Array.isArray(json.programs) ? json.programs : []).filter(isRecord);
	const shots =
		typeof json.screenshots === 'string' && /^[\w.-]+$/.test(json.screenshots)
			? json.screenshots
			: undefined;

	const promptIds = new Set<string>();
	for (const run of runs) {
		for (const attempt of attemptsOf(run)) {
			if (typeof attempt.promptId === 'string') promptIds.add(attempt.promptId);
		}
	}
	const aliases = (Array.isArray(json.aliases) ? json.aliases : []).filter(
		(a): a is string => typeof a === 'string'
	);
	const ranAt = typeof json.ranAt === 'string' ? json.ranAt : undefined;

	const nameOf = (alias: string) => {
		const who = identityOf(json, alias);
		return { name: who.model, via: modelVia(who), alias };
	};

	const glance: ReportSection = {
		title: 'At a glance',
		description:
			'One row per program and model. Expected is what a person would say; the rest is measured in the real demo runner.',
		html: glanceTable(programs, runs, nameOf)
	};

	const perProgram = programs.map((program): ReportSection => {
		const id = String(program.id ?? '');
		const detail =
			shots && runs.some((run) => run.program === id && run.via === 'demo runner')
				? `<figure class="shot"><a href="${esc(`${shots}/${id}__detail.png`)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(`${shots}/${id}__detail.png`)}" alt="${esc(`${program.title}: the program at the Detail level`)}"></a><figcaption>The program (Detail)</figcaption></figure>`
				: '';
		const cards = runs
			.filter((run) => run.program === id)
			.map((run) => runCard(run, nameOf, shots))
			.join('');
		return {
			title: String(program.title ?? id),
			description: `${String(program.tests ?? '')} Expected concepts: ${String(program.expectedConcepts ?? '?')}.`,
			html: `${detail ? `<div class="gallery">${detail}</div>` : ''}${cards}`
		};
	});

	return {
		title: 'Zoom smoke check',
		subtitle: [
			ranAt && `Run ${ranAt}`,
			promptIds.size > 0 && `prompt ${[...promptIds].sort().join(', ')}`,
			`${programs.length} programs`,
			`${aliases.length} model${aliases.length === 1 ? '' : 's'}`
		]
			.filter(Boolean)
			.join(' · '),
		rows: [],
		sections: [glance, ...perProgram]
	};
}

type Who = { name: string; via: string; alias: string };

function attemptsOf(run: Record<string, unknown>): Record<string, unknown>[] {
	return (Array.isArray(run.attempts) ? run.attempts : []).filter(isRecord);
}

function levelOf(
	run: Record<string, unknown>,
	level: 'semantic' | 'concept'
): Record<string, unknown> | undefined {
	const found = run[level];
	return isRecord(found) ? found : undefined;
}

const count = (value: unknown): number => asNumber(value) ?? 0;

// How the attempts went: "2 attempts: schema, then ok".
function attemptsText(run: Record<string, unknown>): string {
	const attempts = attemptsOf(run);
	if (attempts.length === 0) return 'no log';
	const outcomes = attempts.map((attempt) => String(attempt.outcome ?? '?'));
	return `${attempts.length} attempt${attempts.length === 1 ? '' : 's'}: ${outcomes.join(', then ')}`;
}

// How much of the program the model's plan accounts for.
function planText(run: Record<string, unknown>): string {
	const ok = attemptsOf(run)
		.filter((attempt) => attempt.outcome === 'ok')
		.at(-1);
	const plan = ok && isRecord(ok.plan) ? ok.plan : undefined;
	if (!plan) return 'no plan logged';
	const concepts = (Array.isArray(plan.concepts) ? plan.concepts : []).filter(isRecord);
	const stacks = concepts.flatMap((concept) =>
		Array.isArray(concept.stacks) ? concept.stacks : []
	);
	const unique = new Set(stacks);
	const outline = isRecord(ok?.outline) ? asNumber(ok.outline.stacks) : undefined;
	const covered = `${unique.size}${outline === undefined ? '' : ` of ${outline}`} stack${unique.size === 1 ? '' : 's'}`;
	const repeats = stacks.length - unique.size;
	return `${concepts.length} concept${concepts.length === 1 ? '' : 's'} covering ${covered}${repeats > 0 ? `, ${repeats} listed twice` : ''}`;
}

function tokensText(run: Record<string, unknown>): string {
	const ok = attemptsOf(run)
		.filter((attempt) => attempt.outcome === 'ok')
		.at(-1);
	const usage = ok && isRecord(ok.usage) ? ok.usage : undefined;
	const out = usage ? asNumber(usage.completionTokens) : undefined;
	return out === undefined ? '' : `${fmt(out)} output tokens`;
}

// A colour from the page's own measurement, shown only when it has the expected shape.
function swatches(colours: unknown): string {
	const list = (Array.isArray(colours) ? colours : []).filter(
		(c): c is string => typeof c === 'string'
	);
	if (list.length === 0) return '—';
	return list
		.map((colour) => {
			const safe = /^rgba?\(\d{1,3}, \d{1,3}, \d{1,3}(, [\d.]+)?\)$/.test(colour);
			const black = colour === 'rgb(0, 0, 0)';
			return `${safe ? `<i class="swatch" style="background:${colour}"></i>` : ''}${esc(black ? 'black (no colour was set)' : colour)}`;
		})
		.join('<br>');
}

function editText(run: Record<string, unknown>): string {
	const edit = isRecord(run.edit) ? run.edit : undefined;
	if (!edit) return '—';
	const from = String(edit.from ?? '');
	const to = String(edit.to ?? '');
	if (edit.bound === false) {
		const fields = (Array.isArray(edit.boundFields) ? edit.boundFields : []).join(', ');
		return `<span class="bad-text">✕ ${esc(from)} was not exposed as a field (the fields were: ${esc(fields || 'none')})</span>`;
	}
	const before = (Array.isArray(edit.before) ? edit.before : []).map(String);
	const after = (Array.isArray(edit.after) ? edit.after : []).map(String);
	const changed = after.filter((value, i) => value !== before[i]);
	const everywhere = before.filter((value) => value === from).length;
	// Complete when every Detail field that showed the value now shows the new one.
	const complete =
		changed.length > 0 && changed.length === everywhere && changed.every((value) => value === to);
	const note =
		changed.length > 0 && !complete
			? ' (the others are bound to separate fields, or not bound)'
			: '';
	return `${complete ? '✓' : '⚠'} ${esc(from)} → ${esc(to)} reached ${changed.length} of ${everywhere} Detail field${everywhere === 1 ? '' : 's'} showing ${esc(from)}${note}`;
}

// A value counts as spelled out only when it stands alone in the label as a whole
// word or number: "greet" is not in "greeting". (Results recorded before the
// script matched whole words list substring hits, so this is checked again here.)
function mentions(label: string, value: string): boolean {
	const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, (char) => `\\${char}`);
	return new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}($|[^\\p{L}\\p{N}_])`, 'iu').test(label);
}

function leaksOf(run: Record<string, unknown>): { label: string; value: string }[] {
	return (['semantic', 'concept'] as const).flatMap((name) => {
		const level = levelOf(run, name);
		const leaks = level && Array.isArray(level.leaks) ? level.leaks.filter(isRecord) : [];
		return leaks
			.map((leak) => ({
				label: String(leak.label ?? ''),
				value: String(leak.value ?? '')
			}))
			.filter((leak) => mentions(leak.label, leak.value));
	});
}

function glanceTable(
	programs: Record<string, unknown>[],
	runs: Record<string, unknown>[],
	nameOf: (alias: string) => Who
): string {
	const body = runs
		.map((run) => {
			const program = programs.find((candidate) => candidate.id === run.program);
			const who = nameOf(String(run.alias ?? ''));
			const semantic = levelOf(run, 'semantic');
			const concept = levelOf(run, 'concept');
			const failed = typeof run.error === 'string';
			const overlaps = count(semantic?.overlaps) + count(concept?.overlaps);
			const leaks = leaksOf(run).length;
			const cells = failed
				? `<td colspan="7" class="bad-text">✕ failed: ${esc(String(run.error).slice(0, 200))}</td>`
				: `<td class="num">${concept?.topBlocks ?? '—'} <span class="muted">(expected ${esc(String(program?.expectedConcepts ?? '?'))})</span></td>
<td class="num">${semantic?.topBlocks ?? '—'}</td>
<td>${run.via === 'proxy only' ? 'not shown (no runner)' : overlaps === 0 ? '✓ none' : `⚠ ${overlaps}`}</td>
<td>${swatches(semantic?.colours)}</td>
<td class="num">${asNumber(run.seconds) ?? '—'} s</td>
<td>${esc(attemptsText(run))}</td>
<td>${leaks === 0 ? '✓ none found' : `⚠ ${leaks} to look at`}</td>`;
			return `<tr><th scope="row">${esc(String(program?.title ?? run.program))}${run.via === 'proxy only' ? '<span class="via-line">proxy only: the runner cannot load these blocks</span>' : ''}</th><td>${esc(who.name)}${who.via ? `<span class="via-line">${esc(who.via)}</span>` : ''}</td>${cells}</tr>`;
		})
		.join('');
	return `<div class="table-wrap"><table class="wide"><thead><tr><th scope="col">Program</th><th scope="col">Model</th><th scope="col">Concept blocks</th><th scope="col">Semantic stacks</th><th scope="col">Overlaps</th><th scope="col">Block colour</th><th scope="col">Time</th><th scope="col">Attempts</th><th scope="col">Values in labels</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function runCard(
	run: Record<string, unknown>,
	nameOf: (alias: string) => Who,
	shots: string | undefined
): string {
	const who = nameOf(String(run.alias ?? ''));
	const heading = `<h3>${esc(who.name)}${who.via ? ` <span class="muted">${esc(who.via)}</span>` : ''}</h3>`;
	if (typeof run.error === 'string') {
		return `<article class="run">${heading}<p class="error">✕ ${esc(run.error)}</p></article>`;
	}

	const semantic = levelOf(run, 'semantic');
	const concept = levelOf(run, 'concept');
	const picture = (level: Record<string, unknown> | undefined, name: string) => {
		const file =
			level && typeof level.screenshot === 'string' && /^[\w.-]+\.png$/.test(level.screenshot)
				? level.screenshot
				: undefined;
		if (!shots || !file) return '';
		const src = `${shots}/${file}`;
		return `<figure class="shot"><a href="${esc(src)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(src)}" alt="${esc(`${who.name}, ${name} level`)}"></a><figcaption>${esc(name)}: ${esc(String(level?.topBlocks ?? '?'))} top-level block${level?.topBlocks === 1 ? '' : 's'}</figcaption></figure>`;
	};
	const editFile =
		isRecord(run.edit) &&
		typeof run.edit.screenshot === 'string' &&
		/^[\w.-]+\.png$/.test(run.edit.screenshot)
			? run.edit.screenshot
			: undefined;
	const afterEdit =
		shots && editFile
			? `<figure class="shot"><a href="${esc(`${shots}/${editFile}`)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(`${shots}/${editFile}`)}" alt="${esc(`${who.name}: Detail after editing a bound field`)}"></a><figcaption>Detail after the edit</figcaption></figure>`
			: '';

	const labels = (level: Record<string, unknown> | undefined) =>
		(Array.isArray(level?.labels) ? level.labels : [])
			.map((label) => `<li>${esc(label)}</li>`)
			.join('');
	const leaks = leaksOf(run);

	return `<article class="run">${heading}
<p class="facts">${esc(String(run.info ?? ''))}${tokensText(run) ? ` · ${esc(tokensText(run))}` : ''} · ${esc(attemptsText(run))}</p>
<div class="gallery">${picture(semantic, 'Semantic')}${picture(concept, 'Concept')}${afterEdit}</div>
<dl class="notes">
<dt>Plan</dt><dd>${esc(planText(run))}</dd>
<dt>Concept labels</dt><dd><ul>${labels(concept)}</ul></dd>
<dt>Semantic labels</dt><dd><ul>${labels(semantic)}</ul></dd>
<dt>Block colour</dt><dd>${swatches(semantic?.colours)}</dd>
<dt>Editing a bound field</dt><dd>${editText(run)}</dd>
<dt>Values in labels</dt><dd>${leaks.length === 0 ? '✓ none found' : `<ul>${leaks.map((leak) => `<li>⚠ “${esc(leak.label)}” contains ${esc(leak.value)}</li>`).join('')}</ul>`}</dd>
</dl></article>`;
}
