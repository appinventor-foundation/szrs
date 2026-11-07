// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

// The zoom smoke check: runs the programs in smoke-programs.ts through the real
// demo runner on each model alias, with real model calls, and records what
// appears. It needs a running LLM proxy and a dashboard server pointed at the
// TEST database and at that proxy; see apps/evals/README.md for the
// exact commands. Never touches the dev database: it empties and refills the
// demos table of `dashboard_test`, like the e2e tests do.
//
// Run from apps/dashboard:
//   pnpm smoke:zoom --models openrouter,openrouter-2 --proxy-log <file>
//
// Files that run outside Vite use relative imports and no `$app/*` (AGENTS.md).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, type Locator, type Page } from '@playwright/test';
import postgres from 'postgres';
import { adminCredentials, baseURL, testAuthEnv } from '../tests/support/auth.js';
import { resetDatabase, testDatabaseUrl } from '../tests/support/database.js';
import { signIn, visit } from '../tests/support/page.js';
import { customBlockSet } from './smoke-custom-blocks.js';
import { programs, type SmokeProgram } from './smoke-programs.js';

const here = dirname(fileURLToPath(import.meta.url));
const date = new Date().toISOString().slice(0, 10);

function option(name: string): string | undefined {
	const at = process.argv.indexOf(`--${name}`);
	return at >= 0 ? process.argv[at + 1] : undefined;
}

const aliases = (option('models') ?? '').split(',').filter(Boolean);
const proxyLog = option('proxy-log');
const proxyUrl = option('proxy') ?? 'http://localhost:3000';
const only = option('only')?.split(',');
const resultsDir = resolve(here, '../../evals/results');
const shotsName = `${date}-smoke-check`;
const shotsDir = resolve(option('out') ?? resultsDir, shotsName);
const jsonFile = resolve(option('out') ?? resultsDir, `${shotsName}.json`);
const ZOOM_TIMEOUT_MS = 300_000;

if (aliases.length === 0) {
	console.error(
		'Usage: pnpm smoke:zoom --models <alias>[,<alias>] [--proxy-log <file>] [--only <program>[,...]]'
	);
	process.exit(2);
}

type LevelStats = {
	topBlocks: number;
	overlaps: number;
	offscreen: number;
	colours: string[];
	/** What each block reads like on screen, editable field values included. */
	labels: string[];
	/** The values the model exposed as editable fields. */
	fields: string[];
	/** Labels that contain a value the Detail program holds: it goes stale on the first edit. */
	leaks: { label: string; value: string }[];
	screenshot: string;
};

type Run = {
	program: string;
	alias: string;
	via: 'demo runner' | 'proxy only';
	seconds?: number;
	info?: string;
	error?: string;
	semantic?: LevelStats;
	concept?: LevelStats;
	edit?: {
		from: string;
		to: string;
		/** False when the model did not expose that value as a field at all. */
		bound: boolean;
		boundFields: string[];
		before: string[];
		after: string[];
		screenshot?: string;
	};
	attempts?: unknown[];
};

// Prepares the test database the way the e2e tests do, then fills the demos.
async function seed(selected: SmokeProgram[]): Promise<Map<string, string>> {
	const env = { ...process.env, ...testAuthEnv, DATABASE_URL: testDatabaseUrl };
	execFileSync('pnpm', ['exec', 'drizzle-kit', 'migrate'], { env, stdio: 'ignore' });
	execFileSync('pnpm', ['exec', 'tsx', 'scripts/ensure-admin.ts'], { env, stdio: 'ignore' });
	await resetDatabase();

	const sql = postgres(testDatabaseUrl);
	const ids = new Map<string, string>();
	try {
		for (const program of selected) {
			const [row] = await sql<{ id: string }[]>`
				insert into demos (title, description, demo_kind, starter_kind, starter_workspace)
				values (${`Smoke: ${program.title}`}, ${program.tests}, 'plugin', 'custom', ${sql.json(program.workspace as never)})
				returning id`;
			ids.set(program.id, row.id);
		}
	} finally {
		await sql.end();
	}
	return ids;
}

// The values a Detail program holds in its fields: numbers and text, not the
// dropdown choices (their text ends with an arrow) or operators.
function valuesIn(fields: string[]): string[] {
	return [
		...new Set(
			fields.filter(
				(text) => /^-?\d+(\.\d+)?$/.test(text) || (text.length > 1 && !text.includes('▾'))
			)
		)
	];
}

// A label that spells out a value ("count down from 10") is wrong as soon as
// that value is edited. Small numbers (0, 1) also match innocent words, so these
// are candidates for a person to look at, not verdicts.
function findLeaks(labels: string[], values: string[]): { label: string; value: string }[] {
	const leaks: { label: string; value: string }[] = [];
	for (const label of labels) {
		for (const value of values) {
			const hit = /^-?\d/.test(value)
				? new RegExp(`(^|[^\\d.])${value.replace('.', '\\.')}([^\\d.]|$)`).test(label)
				: new RegExp(
						`(^|[^\\p{L}\\p{N}_])${value.replace(/[.*+?^${}()|[\]\\]/g, (char) => `\\${char}`)}($|[^\\p{L}\\p{N}_])`,
						'iu'
					).test(label);
			if (hit) leaks.push({ label, value });
		}
	}
	return leaks;
}

// The zoomed view's top-level blocks: how many, whether any overlap or sit
// outside the view, which colours they have and what they say.
async function levelStats(
	page: Page,
	screenshot: string,
	detailValues: string[]
): Promise<LevelStats> {
	const stats = await page.evaluate(() => {
		const view = document.querySelector('.blockly-zoomView');
		if (!view)
			return {
				topBlocks: 0,
				overlaps: 0,
				offscreen: 0,
				colours: [],
				labels: [],
				staticLabels: [],
				fields: []
			};
		const frame = view.getBoundingClientRect();
		const blocks = [
			...view.querySelectorAll(
				// Locked blocks are not draggable, so they have no blocklyDraggable class.
				'svg.blocklySvg > g.blocklyWorkspace > g.blocklyBlockCanvas > g.blocklyBlock'
			)
		];
		const boxes = blocks.map((block) => block.getBoundingClientRect());
		let overlaps = 0;
		for (let i = 0; i < boxes.length; i++) {
			for (let j = i + 1; j < boxes.length; j++) {
				const a = boxes[i];
				const b = boxes[j];
				const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
				const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
				if (width > 2 && height > 2) overlaps++;
			}
		}
		const offscreen = boxes.filter(
			(box) =>
				box.right < frame.left ||
				box.left > frame.right ||
				box.bottom < frame.top ||
				box.top > frame.bottom
		).length;
		const colours = new Set<string>();
		for (const block of blocks) {
			const path = block.querySelector(':scope > path.blocklyPath');
			if (path) colours.add(getComputedStyle(path).fill);
		}
		// What the block reads like, field values included, for a person looking at it.
		const labels = blocks.map((block) =>
			[...block.querySelectorAll('text.blocklyText')].map((node) => node.textContent ?? '')
		);
		// The words a model wrote into the block definition. A value shown in an
		// editable field is live (it follows Detail), so only these can go stale.
		const staticLabels = blocks.map((block) =>
			[...block.querySelectorAll('g.blocklyLabelField text')].map((node) => node.textContent ?? '')
		);
		// The editable fields: the values the model exposed.
		const fields = blocks.flatMap((block) =>
			[...block.querySelectorAll('g.blocklyEditableField text')].map(
				(node) => node.textContent?.trim() ?? ''
			)
		);
		return {
			topBlocks: blocks.length,
			overlaps,
			offscreen,
			colours: [...colours],
			labels,
			staticLabels,
			fields
		};
	});
	await page.waitForTimeout(400);
	await workspaceOf(page).screenshot({ path: resolve(shotsDir, screenshot) });
	const tidy = (pieces: string[][]) =>
		pieces.map((texts) => texts.join(' ').replace(/\s+/g, ' ').trim());
	const labels = tidy(stats.labels);
	const staticLabels = tidy(stats.staticLabels);
	return {
		topBlocks: stats.topBlocks,
		overlaps: stats.overlaps,
		offscreen: stats.offscreen,
		colours: stats.colours,
		labels,
		fields: stats.fields,
		leaks: findLeaks(staticLabels, detailValues),
		screenshot
	};
}

const workspaceOf = (page: Page): Locator => page.getByTestId('blockly-workspace');

// The text of every editable field on the main (Detail) workspace, in document order.
const detailFields = (page: Page): Promise<string[]> =>
	page.evaluate(() => {
		const main = document.querySelector('svg.blocklySvg');
		return [...(main?.querySelectorAll('g.blocklyEditableField text') ?? [])].map(
			(node) => node.textContent?.trim() ?? ''
		);
	});

async function openRunner(page: Page, demoId: string) {
	await visit(page, `/demos/${demoId}`);
	await page.getByRole('link', { name: 'Start demo' }).click();
	await expect(workspaceOf(page)).toHaveAttribute('data-workspace-ready', 'true');
	await expect(page.locator('.zoom-slider')).toBeVisible();
}

const stop = (page: Page, level: 'Detail' | 'Semantic' | 'Concept') =>
	page.locator(`button.zoom-slider__stop[title="${level}"]`);

// Waits for the zoom the last click started to end, one way or the other.
async function waitForZoom(page: Page, level: string) {
	await page.waitForFunction(
		(want) => {
			const label = document.querySelector('.zoom-slider__active-label');
			if (!label) return false;
			return (
				label.textContent === want || label.classList.contains('zoom-slider__active-label--error')
			);
		},
		level,
		{ timeout: ZOOM_TIMEOUT_MS }
	);
}

async function runInRunner(
	page: Page,
	program: SmokeProgram,
	demoId: string,
	alias: string,
	first: boolean
): Promise<Run> {
	const run: Run = { program: program.id, alias, via: 'demo runner' };
	const base = `${program.id}__${alias}`;
	await openRunner(page, demoId);
	if (first)
		await workspaceOf(page).screenshot({ path: resolve(shotsDir, `${program.id}__detail.png`) });
	const detailValues = valuesIn(await detailFields(page));

	const select = page.locator('select.zoom-model-select');
	await expect(select.locator(`option[value="${alias}"]`)).toHaveCount(1);
	await select.selectOption(alias);

	const label = page.locator('.zoom-slider__active-label');
	const started = Date.now();
	await stop(page, 'Semantic').click();
	await waitForZoom(page, 'Semantic');
	run.seconds = Math.round((Date.now() - started) / 100) / 10;

	if ((await label.getAttribute('class'))?.includes('--error')) {
		run.error =
			`${(await label.textContent()) ?? ''} ${(await label.getAttribute('title')) ?? ''}`.trim();
		await workspaceOf(page).screenshot({ path: resolve(shotsDir, `${base}__failed.png`) });
		return run;
	}
	run.info = (await label.getAttribute('title')) ?? undefined;
	run.semantic = await levelStats(page, `${base}__semantic.png`, detailValues);

	await stop(page, 'Concept').click();
	await waitForZoom(page, 'Concept');
	run.concept = await levelStats(page, `${base}__concept.png`, detailValues);

	// A bound field: edit the one showing a known value at Semantic, and see what
	// Detail does. A model that did not expose that value is a finding too.
	if (program.editBound) {
		const { from, to } = program.editBound;
		await stop(page, 'Semantic').click();
		await waitForZoom(page, 'Semantic');
		const editable = page.locator('.blockly-zoomView g.blocklyEditableField');
		// Read before editing: the view is cleared once Detail is shown again.
		const boundFields = (await editable.allTextContents()).map((text) => text.trim());
		const before = await detailFields(page);
		const target = editable.filter({ hasText: new RegExp(`^\\s*${from}\\s*$`) });
		if ((await target.count()) === 0) {
			run.edit = { from, to, bound: false, boundFields, before, after: before };
		} else {
			await target.first().click();
			await page.keyboard.press('Control+A');
			await page.keyboard.type(to);
			await page.keyboard.press('Enter');
			await page.waitForTimeout(500);
			const after = await detailFields(page);
			await stop(page, 'Detail').click();
			await page.waitForTimeout(500);
			const screenshot = `${base}__detail-after-edit.png`;
			await workspaceOf(page).screenshot({ path: resolve(shotsDir, screenshot) });
			run.edit = { from, to, bound: true, boundFields, before, after, screenshot };
		}
	}
	return run;
}

// The custom block set: the demo runner cannot load blocks it does not define,
// so this program goes straight to the proxy and is judged from its log.
async function runOnProxy(alias: string): Promise<Run> {
	const run: Run = { program: 'custom-blocks', alias, via: 'proxy only' };
	const started = Date.now();
	const response = await fetch(`${proxyUrl}/v1/zoom/stream`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ model: alias, slug: 'robot-demo', workspaceJson: customBlockSet }),
		signal: AbortSignal.timeout(ZOOM_TIMEOUT_MS)
	});
	const body = await response.text();
	run.seconds = Math.round((Date.now() - started) / 100) / 10;
	const events = body
		.split('\n\n')
		.filter((chunk) => chunk.startsWith('data: '))
		.map((chunk) => JSON.parse(chunk.slice('data: '.length)) as Record<string, unknown>);
	const done = events.find((event) => event.type === 'done') as
		{ result: { semantic: Level; concept: Level } } | undefined;
	const error = events.find((event) => event.type === 'error');
	if (!done) {
		run.error = JSON.stringify(error ?? body.slice(0, 300));
		return run;
	}
	const top = (level: Level): number => level.workspaceJson.blocks?.blocks?.length ?? 0;
	const labels = (level: Level): string[] =>
		level.blockDefs.map((def) => String(def.message0 ?? def.type));
	run.semantic = {
		topBlocks: top(done.result.semantic),
		overlaps: 0,
		offscreen: 0,
		colours: [],
		labels: labels(done.result.semantic),
		fields: [],
		leaks: [],
		screenshot: ''
	};
	run.concept = {
		topBlocks: top(done.result.concept),
		overlaps: 0,
		offscreen: 0,
		colours: [],
		labels: labels(done.result.concept),
		fields: [],
		leaks: [],
		screenshot: ''
	};
	return run;
}

type Level = {
	blockDefs: Record<string, unknown>[];
	workspaceJson: { blocks?: { blocks?: unknown[] } };
};

// The proxy logs one record per attempt (prompt id, usage, repairs, plan).
// Those made while a run was going belong to it.
function attemptsBetween(from: number, to: number, alias: string): unknown[] {
	if (!proxyLog) return [];
	return readFileSync(proxyLog, 'utf8')
		.split('\n')
		.flatMap((line) => {
			try {
				const entry = JSON.parse(line) as Record<string, unknown>;
				return entry.msg === 'zoom attempt' &&
					entry.model === alias &&
					typeof entry.time === 'number' &&
					entry.time >= from - 1000 &&
					entry.time <= to + 1000
					? [entry]
					: [];
			} catch {
				return [];
			}
		});
}

async function main() {
	const selected = programs.filter((program) => !only || only.includes(program.id));
	mkdirSync(shotsDir, { recursive: true });
	const demoIds = await seed(selected);

	const browser = await chromium.launch();
	const context = await browser.newContext({
		baseURL,
		extraHTTPHeaders: { 'x-forwarded-proto': 'http' },
		viewport: { width: 1280, height: 860 }
	});
	const page = await context.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	await signIn(page, adminCredentials);

	const runs: Run[] = [];
	for (const program of selected) {
		for (const [index, alias] of aliases.entries()) {
			const started = Date.now();
			console.log(`${program.id} on ${alias} ...`);
			let run: Run;
			try {
				run = await runInRunner(page, program, demoIds.get(program.id) ?? '', alias, index === 0);
			} catch (error) {
				run = {
					program: program.id,
					alias,
					via: 'demo runner',
					error: String(error).slice(0, 400)
				};
				await workspaceOf(page)
					.screenshot({ path: resolve(shotsDir, `${program.id}__${alias}__error.png`) })
					.catch(() => {});
			}
			run.attempts = attemptsBetween(started, Date.now(), alias);
			runs.push(run);
			console.log(
				`  ${run.error ? `FAILED ${run.error.slice(0, 120)}` : `semantic ${run.semantic?.topBlocks} / concept ${run.concept?.topBlocks} top-level blocks, ${run.semantic?.overlaps} overlaps, ${run.seconds}s`}`
			);
		}
	}
	if (!only || only.includes('custom-blocks')) {
		for (const alias of aliases) {
			const started = Date.now();
			console.log(`custom-blocks on ${alias} (proxy only) ...`);
			const run = await runOnProxy(alias);
			run.attempts = attemptsBetween(started, Date.now(), alias);
			runs.push(run);
			console.log(
				`  ${run.error ? `FAILED ${run.error.slice(0, 120)}` : `semantic ${run.semantic?.topBlocks} / concept ${run.concept?.topBlocks}, ${run.seconds}s`}`
			);
		}
	}
	await browser.close();
	await resetDatabase();

	writeFileSync(
		jsonFile,
		`${JSON.stringify(
			{
				kind: 'smoke-check',
				ranAt: new Date().toISOString(),
				aliases,
				proxy: proxyUrl,
				screenshots: shotsName,
				pageErrors: errors,
				programs: [
					...selected.map(({ id, title, tests, expectedConcepts }) => ({
						id,
						title,
						tests,
						expectedConcepts,
						via: 'demo runner'
					})),
					{
						id: 'custom-blocks',
						title: 'Custom block set',
						tests:
							'Blocks the host defines itself: the outline and plan must not depend on core block names.',
						expectedConcepts: '3',
						via: 'proxy only'
					}
				],
				runs
			},
			null,
			'\t'
		)}\n`
	);
	console.log(`\nwritten ${jsonFile}`);
}

main().catch((error: unknown) => {
	console.error('smoke check failed:', error);
	process.exit(1);
});
