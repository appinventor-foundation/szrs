// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { asNumber, esc, isRecord } from './html.js';
import { identityOf } from './models.js';
import { modelVia, type Report, type ReportSection } from './rows.js';

/**
 * Reads the JSON that screenshots/render.ts writes: stored baseline zooms drawn
 * in a real browser. A gallery first and a table second: each program shows its
 * Detail view, then each model's runs side by side, one column per prompt, so
 * `v0` and `v1` (and later `v2`) can be compared by eye. Pictures are linked by
 * relative path, so the page has to sit beside the JSON.
 */
export function screenshotsReport(json: unknown): Report | undefined {
	if (!isRecord(json) || json.kind !== 'baseline-screenshots') return undefined;
	const programs = records(json.programs);
	const items = records(json.items);
	const prompts = strings(json.prompts);
	const folder =
		typeof json.screenshots === 'string' && /^[\w.-]+$/.test(json.screenshots)
			? json.screenshots
			: undefined;
	const modelIds = Object.keys(isRecord(json.models) ? json.models : {});

	const nameOf = (alias: string) => {
		const who = identityOf(json, alias);
		return { name: who.model, via: modelVia(who) };
	};
	const detailFile = (program: string) => `${program}__detail.png`;

	const glance: ReportSection = {
		title: 'At a glance',
		description:
			'One row per program, model and prompt, measured from the pictures: how many blocks each level draws, whether any top-level blocks overlap (D25) and what colour the blocks are.',
		html: glanceTable(items, programs, nameOf)
	};

	const perProgram = programs.map((program): ReportSection => {
		const id = String(program.id ?? '');
		const detail = isRecord(program.detail) ? program.detail : {};
		const expected = Array.isArray(program.expectedConcepts)
			? program.expectedConcepts.join(' to ')
			: '?';
		const mine = items.filter((item) => item.program === id);
		const cards = modelIds
			.map((alias) => ({ alias, runs: mine.filter((item) => item.model === alias) }))
			.filter(({ runs }) => runs.length > 0)
			.map(({ alias, runs }) => modelCard(alias, runs, prompts, nameOf(alias), folder))
			.join('');
		return {
			title: String(program.title ?? id),
			description: `Tier ${String(program.tier ?? '?')}, ${String(program.blocks ?? '?')} blocks in ${String(program.topLevelStacks ?? '?')} top-level stacks. Expected concepts (the author's provisional guess): ${expected}.`,
			html: `<div class="gallery">${figure(folder, detailFile(id), `${String(program.title ?? id)}: the program at the Detail level`, `The program (Detail): ${String(asNumber(detail.blocks) ?? '?')} blocks`)}</div>${cards}`
		};
	});

	return {
		title: 'Baseline zooms, drawn',
		subtitle: [
			typeof json.source === 'string' && `from ${json.source}`,
			typeof json.ranAt === 'string' && `drawn ${json.ranAt}`,
			`${programs.length} programs`,
			`${modelIds.length} models`
		]
			.filter(Boolean)
			.join(' · '),
		rows: [],
		sections: [glance, ...perProgram]
	};
}

type Who = { name: string; via: string };

function records(value: unknown): Record<string, unknown>[] {
	return (Array.isArray(value) ? value : []).filter(isRecord);
}

function strings(value: unknown): string[] {
	return (Array.isArray(value) ? value : []).filter((x): x is string => typeof x === 'string');
}

/** A picture, linked by a file name that is checked to be a plain PNG name in the results folder. */
function figure(folder: string | undefined, file: unknown, alt: string, caption: string): string {
	if (!folder || typeof file !== 'string' || !/^[\w.-]+\.png$/.test(file)) return '';
	const src = `${folder}/${file}`;
	return `<figure class="shot natural"><a href="${esc(src)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(src)}" alt="${esc(alt)}"></a><figcaption>${esc(caption)}</figcaption></figure>`;
}

const plural = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;

function levelsOf(item: Record<string, unknown>): Record<string, Record<string, unknown>> {
	const levels = isRecord(item.levels) ? item.levels : {};
	const pick = (name: string) => (isRecord(levels[name]) ? levels[name] : {});
	return { semantic: pick('semantic'), concept: pick('concept') };
}

/** Block colours as swatches, only for values of the expected shape. */
function swatches(colours: unknown): string {
	const list = strings(colours).filter((colour) => /^#[0-9a-f]{6}$/i.test(colour));
	if (list.length === 0) return '—';
	return list
		.map(
			(colour) =>
				`<span class="swatch" style="background:${esc(colour)}"></span>${colour.toLowerCase() === '#000000' ? 'black' : esc(colour)}`
		)
		.join(' ');
}

function modelCard(
	alias: string,
	runs: Record<string, unknown>[],
	prompts: string[],
	who: Who,
	folder: string | undefined
): string {
	const columns = prompts
		.map((prompt) => {
			const item = runs.find((run) => run.prompt === prompt);
			return `<div><h4>${esc(prompt)}</h4>${item ? column(item, who, folder) : '<p class="muted">not run</p>'}</div>`;
		})
		.join('');
	return `<article class="run"><h3>${esc(who.name)}${who.via ? ` <span class="muted">${esc(who.via)}</span>` : ''}</h3><div class="compare">${columns}</div></article>`;
}

function column(item: Record<string, unknown>, who: Who, folder: string | undefined): string {
	const attempts = `${plural(asNumber(item.attempts) ?? 0, 'attempt')}`;
	if (item.status !== 'ok') {
		const message =
			typeof item.failureMessage === 'string'
				? `<details><summary>the model's last error</summary><pre>${esc(item.failureMessage)}</pre></details>`
				: '';
		return `<p class="error">✕ no valid zoom (${esc(String(item.failure ?? 'invalid'))}, ${esc(attempts)})</p>${message}`;
	}
	const levels = levelsOf(item);
	const pictures = (['semantic', 'concept'] as const)
		.map((name) => {
			const level = levels[name];
			const label = name === 'semantic' ? 'Semantic' : 'Concept';
			if (typeof level.error === 'string') {
				return `<p class="error">✕ ${label}: the plugin cannot load this level</p><details><summary>Blockly's error</summary><pre>${esc(level.error)}</pre></details>`;
			}
			const top = asNumber(level.topBlocks) ?? 0;
			return figure(
				folder,
				level.file,
				`${who.name}, ${item.prompt}, ${label} level`,
				`${label}: ${plural(top, 'top-level block')}${asNumber(level.overlaps) ? `, ${plural(asNumber(level.overlaps) ?? 0, 'overlap')}` : ''}`
			);
		})
		.join('');
	return `<p class="facts">${esc(attempts)}</p><div class="gallery">${pictures}</div>`;
}

function glanceTable(
	items: Record<string, unknown>[],
	programs: Record<string, unknown>[],
	nameOf: (alias: string) => Who
): string {
	const title = (id: unknown) => String(programs.find((p) => p.id === id)?.title ?? id);
	const body = items
		.map((item) => {
			const who = nameOf(String(item.model ?? ''));
			if (item.status !== 'ok') {
				return `<tr><td>${esc(title(item.program))}</td><td>${esc(who.name)}</td><td>${esc(item.prompt)}</td><td class="error">no valid zoom (${esc(String(item.failure ?? 'invalid'))})</td><td></td><td></td><td></td><td></td></tr>`;
			}
			const { semantic, concept } = levelsOf(item);
			const loads = (level: Record<string, unknown>) => typeof level.error !== 'string';
			const overlaps = (asNumber(semantic.overlaps) ?? 0) + (asNumber(concept.overlaps) ?? 0);
			const result =
				loads(semantic) && loads(concept)
					? 'valid, both levels load'
					: `<span class="error">${!loads(semantic) ? 'Semantic' : 'Concept'} does not load</span>`;
			return `<tr><td>${esc(title(item.program))}</td><td>${esc(who.name)}</td><td>${esc(item.prompt)}</td><td>${result}</td><td>${loads(semantic) ? esc(asNumber(semantic.topBlocks) ?? '?') : '—'}</td><td>${loads(concept) ? esc(asNumber(concept.topBlocks) ?? '?') : '—'}</td><td>${overlaps}</td><td>${swatches([...new Set([...strings(semantic.colours), ...strings(concept.colours)])])}</td></tr>`;
		})
		.join('');
	return `<div class="table-wrap"><table class="wide"><thead><tr><th scope="col">Program</th><th scope="col">Model</th><th scope="col">Prompt</th><th scope="col">Result</th><th scope="col">Semantic top-level blocks</th><th scope="col">Concept blocks</th><th scope="col">Overlaps</th><th scope="col">Block colour</th></tr></thead><tbody>${body}</tbody></table></div>`;
}
