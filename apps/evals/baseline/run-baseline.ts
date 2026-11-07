// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/* eslint-disable turbo/no-undeclared-env-vars --
   Run by hand with pnpm, not as a Turborepo task, so its variables are not part
   of any task environment. */

/**
 * The zoom baseline: every corpus program, with each chosen prompt, on each
 * chosen model, k times. It makes real model calls and costs money, so it is
 * never part of `pnpm test` and starts only when asked. Run from apps/evals
 * with LiteLLM up (see README.md):
 *
 *   pnpm baseline:run --models openrouter,openrouter-2 --prompts v0,v1 --dry-run
 *   pnpm baseline:run --models openrouter,openrouter-2 --prompts v0,v1 --samples 1
 *
 * Options:
 *   --models a,b       LiteLLM aliases (required)
 *   --prompts v0,v1    prompt ids (default: every registered prompt)
 *   --samples k        runs per program, prompt and model (default 1)
 *   --only id,id       only these corpus programs
 *   --tiers S,M        only programs of these size tiers
 *   --concurrency n    calls in flight at once (default 2)
 *   --run-id name      names the run (default: the date and "baseline")
 *   --resume           continue the run's results file, skipping what it already holds
 *   --dry-run          print what would run and an input-size estimate; call nothing
 *
 * Results go to results/<run id>.json after every finished run, so a
 * stopped run keeps its work. It never prints keys.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { promptFingerprint } from '@szrs/llm-proxy/zoom/cache-key.js';
import { getZoomPrompt, zoomPromptIds } from '@szrs/llm-proxy/zoom/prompts/index.js';
import { buildZoomMessages } from '@szrs/llm-proxy/zoom/zoom.js';
import { corpus, type Tier } from './corpus/index.js';
import { litellmComplete } from './litellm-complete.js';
import { fetchModels } from './models.js';
import { prepareProgram } from './prepare.js';
import type { EvalRecord } from './record.js';
import { pool, runOne } from './runner.js';

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.LITELLM_BASE_URL ?? 'http://localhost:4000';
const KEY = process.env.LITELLM_VIRTUAL_KEY ?? '';

function option(name: string): string | undefined {
	const at = process.argv.indexOf(`--${name}`);
	return at >= 0 ? process.argv[at + 1] : undefined;
}
const flag = (name: string): boolean => process.argv.includes(`--${name}`);
const list = (value: string | undefined): string[] | undefined =>
	value === undefined ? undefined : value.split(',').filter((part) => part !== '');

const aliases = list(option('models')) ?? [];
const promptIds = list(option('prompts')) ?? zoomPromptIds();
const samples = Number(option('samples') ?? 1);
const only = list(option('only'));
const tiers = list(option('tiers')) as Tier[] | undefined;
const concurrency = Number(option('concurrency') ?? 2);
const runId = option('run-id') ?? `${new Date().toISOString().slice(0, 10)}-baseline`;
const outFile = resolve(here, '..', 'results', `${runId}.json`);

function usage(message: string): never {
	console.error(
		`${message}\nUsage: pnpm baseline:run --models <alias,...> [--prompts v0,v1] [--samples k] [--only id] [--tiers S,M] [--concurrency n] [--run-id name] [--resume] [--dry-run]`
	);
	process.exit(2);
}

async function main(): Promise<void> {
	if (aliases.length === 0) usage('--models is required');
	if (!Number.isInteger(samples) || samples < 1) usage('--samples must be a positive integer');
	for (const id of promptIds) getZoomPrompt(id); // throws on an unknown id

	const programs = corpus.filter(
		(program) =>
			(only === undefined || only.includes(program.id)) &&
			(tiers === undefined || tiers.includes(program.tier))
	);
	if (programs.length === 0) usage('no corpus program matches --only / --tiers');
	const prepared = programs.map((program) => prepareProgram(program));

	const wanted = prepared.flatMap((program) =>
		promptIds.flatMap((promptId) =>
			aliases.flatMap((alias) =>
				Array.from({ length: samples }, (_, i) => ({ program, promptId, alias, sample: i + 1 }))
			)
		)
	);

	if (flag('dry-run')) {
		console.log(
			`${wanted.length} zoom runs: ${programs.length} programs x ${promptIds.length} prompts x ${aliases.length} models x ${samples} sample(s).`
		);
		console.log('Each run is up to 3 attempts; most need one.');
		for (const promptId of promptIds) {
			const chars = prepared.map((entry) =>
				buildZoomMessages(
					{ model: 'x', slug: entry.slug, workspaceJson: entry.workspaceJson },
					undefined,
					promptId
				)
					.map((message) => message.content.length)
					.reduce((a, b) => a + b, 0)
			);
			const tokens = chars.map((count) => Math.round(count / 4));
			console.log(
				`prompt ${promptId}: about ${tokens.reduce((a, b) => a + b, 0)} input tokens per pass over the corpus (${Math.min(...tokens)} to ${Math.max(...tokens)} per program, 4 characters a token), params ${JSON.stringify(getZoomPrompt(promptId).params)}`
			);
		}
		console.log(
			"Output is not estimable here: the spike measured 2.5k to 30k tokens per zoom on a 14-block program, most of it reasoning. Multiply a pass by the model's price per million tokens."
		);
		console.log(`Would write ${outFile}`);
		return;
	}

	if (KEY === '')
		usage('LITELLM_VIRTUAL_KEY is not set (pnpm baseline:run loads apps/llm-proxy/.env.local)');

	let records: EvalRecord[] = [];
	if (existsSync(outFile)) {
		if (!flag('resume'))
			usage(`${outFile} exists. Pass --resume to continue it, or choose another --run-id.`);
		records = (JSON.parse(readFileSync(outFile, 'utf8')) as { records: EvalRecord[] }).records;
	}
	const done = new Set(
		records.map((r) => `${r.program.id}|${r.prompt.id}|${r.model.alias}|${r.sample}`)
	);
	const todo = wanted.filter(
		(w) => !done.has(`${w.program.program.id}|${w.promptId}|${w.alias}|${w.sample}`)
	);

	const ranAt = new Date().toISOString();
	const save = async (): Promise<void> => {
		mkdirSync(dirname(outFile), { recursive: true });
		const body = {
			kind: 'baseline',
			runId,
			ranAt,
			litellm: BASE,
			aliases,
			models: await fetchModels({ baseUrl: BASE, key: KEY }, aliases),
			prompts: promptIds.map((id) => ({
				id,
				fingerprint: promptFingerprint(getZoomPrompt(id)),
				params: getZoomPrompt(id).params
			})),
			samples,
			records
		};
		writeFileSync(outFile, `${JSON.stringify(body)}\n`);
	};

	const complete = litellmComplete({ baseUrl: BASE, key: KEY });
	let finished = 0;
	console.log(
		`${todo.length} runs to do (${wanted.length - todo.length} already in the file), ${concurrency} at a time.`
	);
	await pool(
		todo.map((item) => async () => {
			const record = await runOne({
				runId,
				prepared: item.program,
				promptId: item.promptId,
				alias: item.alias,
				sample: item.sample,
				complete
			});
			records.push(record);
			finished++;
			const m = record.metrics!;
			console.log(
				`[${finished}/${todo.length}] ${item.program.program.id} ${item.promptId} ${item.alias} #${item.sample}: ${m.valid ? 'ok' : `FAILED (${m.failure ?? '?'})`}, ${m.attempts} attempt(s), ${m.completionTokens} output tokens, ${m.totalSeconds.toFixed(0)}s`
			);
			await save();
		}),
		concurrency
	);
	await save();
	console.log(`written ${outFile}`);
}

main().catch((error: unknown) => {
	console.error('baseline failed:', String(error).slice(0, 400));
	process.exit(1);
});
