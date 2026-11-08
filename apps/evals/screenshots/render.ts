// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/**
 * Draws the zooms the baseline stored, in a real browser, and keeps the
 * pictures: no model is called, so it costs nothing. Run from apps/evals:
 *
 *   pnpm baseline:screenshots [--results a.json[,b.json]] [--name label]
 *                             [--programs a,b] [--models a,b] [--prompts v0,v1]
 *                             [--colour] [--covers covers.json]
 *
 * For each program it draws the Detail program, then for each model and prompt
 * the run's Semantic and Concept levels, through the plugin's own
 * `ZoomLevelLoader` (see page/main.ts). A run that never produced a zoom has
 * no pictures and is recorded as invalid; a level the plugin cannot load is
 * recorded with the plugin's error.
 *
 * By default a zoom is drawn as it was stored. `--colour` draws it as the proxy returns it
 * today: block definitions with no colour get the default one, and the plugin colours each zoom
 * block by its anchor in the run's stored plan (concept blocks have one in a `v1` or `v2` run;
 * Semantic blocks only with `covers`). `--covers` is a JSON file of hand-made covers,
 * `{ "program/model/prompt": { "s1": ["b3", "b4"] } }`, in canonical ids, added to that run's
 * plan: it shows what the plugin does with a plan a `v3` run would give, without a model call.
 *
 * `--results` takes several files, comma separated, to put prompts from different
 * runs side by side (the first file wins when two hold the same run). Writes
 * results/<date>-<label>.json (label default `baseline-screenshots`) and, beside it, a folder of
 * the same name with the PNGs. An existing result is never overwritten (a
 * second run is `-2`). `pnpm report` turns the JSON into a gallery.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';
import { build } from 'vite';

import { findProgram } from '../baseline/corpus/index.js';
import { prepareProgram } from '../baseline/prepare.js';
import type { EvalRecord } from '../baseline/record.js';
import { freshPath } from '../results-path.js';
import type { Drawn, Job } from './page/types.js';
import {
	DEFAULT_MODELS,
	DEFAULT_PROGRAMS,
	DEFAULT_PROMPTS,
	detailFile,
	levelFile,
	colouredLevels,
	mergeResults,
	runKey,
	selectRecords,
	type CoversByRun,
	type LevelName
} from './plan.js';

const here = dirname(fileURLToPath(import.meta.url));
const resultsDir = resolve(here, '..', 'results');

function option(name: string): string | undefined {
	const at = process.argv.indexOf(`--${name}`);
	return at >= 0 ? process.argv[at + 1] : undefined;
}
const list = (name: string, fallback: string[]): string[] =>
	option(name)
		?.split(',')
		.map((item) => item.trim())
		.filter(Boolean) ?? fallback;

/** The page's code as one script, so it needs no server and no file:// module loading. */
async function bundle(): Promise<string> {
	const pageDir = resolve(here, 'page');
	const output = await build({
		root: pageDir,
		configFile: false,
		logLevel: 'warn',
		resolve: { dedupe: ['blockly'] },
		define: { 'process.env.NODE_ENV': '"production"' },
		build: {
			write: false,
			minify: true,
			lib: { entry: resolve(pageDir, 'main.ts'), formats: ['iife'], name: 'zoomShots' }
		}
	});
	const outputs = Array.isArray(output) ? output : [output];
	const chunk = outputs
		.flatMap((one) => ('output' in one ? one.output : []))
		.find((item) => item.type === 'chunk');
	if (!chunk || chunk.type !== 'chunk') throw new Error('the page did not bundle');
	return chunk.code;
}

const resultFiles = (option('results') ?? resolve(resultsDir, '2026-11-07-baseline.json'))
	.split(',')
	.map((file) => resolve(file.trim()));
const merged = mergeResults(
	resultFiles.map((file) => {
		const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
			runId: string;
			models: Record<string, unknown>;
			records: EvalRecord[];
		};
		return { name: basename(file), ...parsed };
	})
);
const programs = list('programs', DEFAULT_PROGRAMS);
const models = list('models', DEFAULT_MODELS);
const prompts = list('prompts', DEFAULT_PROMPTS);
const records = selectRecords(merged.records, programs, models, prompts);
const colour = process.argv.includes('--colour') || option('covers') !== undefined;
const covers: CoversByRun = option('covers')
	? (JSON.parse(readFileSync(resolve(option('covers')!), 'utf8')) as CoversByRun)
	: {};
const unknownCovers = Object.keys(covers).filter(
	(key) => !records.some((record) => runKey(record) === key)
);
if (unknownCovers.length > 0)
	throw new Error(`--covers names no selected run: ${unknownCovers.join('; ')}`);

const day = new Date().toISOString().slice(0, 10);
const name = option('name') ?? 'baseline-screenshots';
const manifestPath = freshPath(resultsDir, `${day}-${name}`, '.json');
const folder = basename(manifestPath, '.json');
const shotsDir = resolve(resultsDir, folder);
mkdirSync(shotsDir, { recursive: true });

const browser = await chromium.launch();
try {
	const page = await browser.newPage({ viewport: { width: 1900, height: 2700 } });
	await page.setContent(
		'<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff"><div id="ws"></div></body>'
	);
	await page.addScriptTag({ content: await bundle() });

	/** Draws one job and saves the picture of it, unless drawing failed. */
	async function draw(job: Job, file: string): Promise<Drawn & { file?: string }> {
		// Strings, not functions: this file has no DOM types, and the page's code is the bundle.
		const drawn = (await page.evaluate(`window.drawJob(${JSON.stringify(job)})`)) as Drawn;
		if (drawn.error) return drawn;
		// Two frames, so the resize and the scroll have been painted.
		await page.evaluate(
			'new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))'
		);
		await page.locator('#ws').screenshot({ path: resolve(shotsDir, file) });
		return { ...drawn, file };
	}

	const programEntries = [];
	const prepared = new Map<
		string,
		{ detail: Record<string, unknown>; blockDefs?: Job['blockDefs'] }
	>();
	for (const id of programs) {
		const program = findProgram(id);
		const { workspaceJson } = prepareProgram(program);
		prepared.set(id, { detail: workspaceJson, blockDefs: program.blockDefs });
		const drawn = await draw(
			{ detail: workspaceJson, blockDefs: program.blockDefs },
			detailFile(id)
		);
		console.log(`${id}: Detail, ${drawn.blocks} blocks${drawn.error ? ` — ${drawn.error}` : ''}`);
		programEntries.push({
			id,
			title: program.title,
			tier: program.tier,
			blocks: program.blocks,
			topLevelStacks: program.topLevelStacks,
			expectedConcepts: program.expectedConcepts,
			detail: drawn
		});
	}

	const items = [];
	for (const record of records) {
		const { detail, blockDefs } = prepared.get(record.program.id) ?? { detail: {} };
		const base = {
			program: record.program.id,
			model: record.model.id,
			prompt: record.prompt.id,
			run: record.runId,
			attempts: record.attempts.length,
			...(record.metrics?.failure && { failure: record.metrics.failure }),
			...(record.metrics?.failureMessage && {
				failureMessage: record.metrics.failureMessage.slice(0, 400)
			})
		};
		if (!record.result) {
			items.push({ ...base, status: 'invalid' as const });
			console.log(`${record.program.id} / ${record.model.id} / ${record.prompt.id}: invalid`);
			continue;
		}
		const levels: Record<string, Drawn & { file?: string }> = {};
		const shown = colour ? colouredLevels(record, covers) : undefined;
		for (const level of ['semantic', 'concept'] as LevelName[]) {
			levels[level] = await draw(
				{
					detail,
					blockDefs,
					level: shown?.[level].level ?? record.result[level],
					anchors: shown?.[level].anchors
				},
				levelFile(record.program.id, record.model.id, record.prompt.id, level)
			);
		}
		const note = Object.entries(levels)
			.map(
				([name, drawn]) => `${name} ${drawn.error ? 'FAILED to load' : `${drawn.topBlocks} top`}`
			)
			.join(', ');
		console.log(`${record.program.id} / ${record.model.id} / ${record.prompt.id}: ${note}`);
		items.push({ ...base, status: 'ok' as const, levels });
	}

	writeFileSync(
		manifestPath,
		JSON.stringify({
			kind: 'baseline-screenshots',
			ranAt: new Date().toISOString(),
			source: merged.source,
			sourceRunId: merged.sourceRunId,
			screenshots: folder,
			prompts,
			colour,
			models: Object.fromEntries(models.map((id) => [id, merged.models[id]])),
			programs: programEntries,
			items
		})
	);
	console.log(`written ${manifestPath} and ${shotsDir}`);
} finally {
	await browser.close();
}
