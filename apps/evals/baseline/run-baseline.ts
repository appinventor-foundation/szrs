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
 *   pnpm baseline:run --models glm-5.3-flash,deepseek-v4.1-flash-1017 --prompts v0,v1 --dry-run
 *   pnpm baseline:run --models glm-5.3-flash,deepseek-v4.1-flash-1017 --prompts v0,v1 --samples 1
 *
 * Options:
 *   --models a,b       model ids from baseline/model-registry.ts (required). Each carries its own
 *                      conditions: the LiteLLM model it is sent as, a provider pin, reasoning
 *   --prompts v0,v1    prompt ids (default: every registered prompt)
 *   --samples k        runs per program, prompt and model (default 1)
 *   --only id,id       only these corpus programs
 *   --tiers S,M        only programs of these size tiers
 *   --concurrency n    calls in flight at once (default 2)
 *   --run-id name      names the run (default: the date, the time and "baseline"). An existing
 *                      file is never overwritten: use --resume to continue it
 *   --resume           continue the run's results file, skipping what it already holds
 *   --dry-run          print what would run and an input-size estimate; call nothing
 *
 * Results go to results/<run id>.json after every finished run, so a
 * stopped run keeps its work. It never prints keys.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { promptFingerprint } from '@szrs/llm-proxy/zoom/cache-key.js';
import { getZoomPrompt, zoomPromptIds } from '@szrs/llm-proxy/zoom/prompts/index.js';
import { buildZoomMessages } from '@szrs/llm-proxy/zoom/zoom.js';
import { corpus, type Tier } from './corpus/index.js';
import { litellmComplete } from './litellm-complete.js';
import { fetchModels, fetchRouteNames, identityFromModelString, isServed } from './models.js';
import { findBenchmarkModel } from './model-registry.js';
import { prepareProgram } from './prepare.js';
import type { EvalRecord } from './record.js';
import { checkResume, mergeHeader, type RunHeader } from './resume.js';
import { pool, runOne } from './runner.js';

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.LITELLM_BASE_URL ?? 'http://localhost:4000';
const KEY = process.env.LITELLM_VIRTUAL_KEY ?? '';

/**
 * The commit the run was made on, and whether the tracked files differed from it. The
 * prompts, the corpus and the validators are all code, so a result is only
 * reproducible if this is known. Undefined when git is not available.
 */
function codeVersion(): { commit: string; dirty: boolean } | undefined {
	try {
		const git = (args: string[]): string =>
			execFileSync('git', args, {
				cwd: here,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'ignore']
			}).trim();
		return {
			commit: git(['rev-parse', '--short', 'HEAD']),
			dirty: git(['status', '--porcelain', '--untracked-files=no']) !== ''
		};
	} catch {
		return undefined;
	}
}

function option(name: string): string | undefined {
	const at = process.argv.indexOf(`--${name}`);
	return at >= 0 ? process.argv[at + 1] : undefined;
}
const flag = (name: string): boolean => process.argv.includes(`--${name}`);
const list = (value: string | undefined): string[] | undefined =>
	value === undefined ? undefined : value.split(',').filter((part) => part !== '');

const modelIds = list(option('models')) ?? [];
const promptIds = list(option('prompts')) ?? zoomPromptIds();
const samples = Number(option('samples') ?? 1);
const only = list(option('only'));
const tiers = list(option('tiers')) as Tier[] | undefined;
const concurrency = Number(option('concurrency') ?? 2);
// The time is in the default name so that two runs on one day are two files.
const runId =
	option('run-id') ??
	`${new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '')}-baseline`;
const outFile = resolve(here, '..', 'results', `${runId}.json`);

function usage(message: string): never {
	console.error(
		`${message}\nUsage: pnpm baseline:run --models <id,...> [--prompts v0,v1] [--samples k] [--only id] [--tiers S,M] [--concurrency n] [--run-id name] [--resume] [--dry-run]`
	);
	process.exit(2);
}

async function main(): Promise<void> {
	if (modelIds.length === 0) usage('--models is required');
	const models = modelIds.map((id) => findBenchmarkModel(id));
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
			models.flatMap((model) =>
				Array.from({ length: samples }, (_, i) => ({ program, promptId, model, sample: i + 1 }))
			)
		)
	);

	if (flag('dry-run')) {
		console.log(
			`${wanted.length} zoom runs: ${programs.length} programs x ${promptIds.length} prompts x ${models.length} models x ${samples} sample(s).`
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
	let existing: RunHeader | undefined;
	if (existsSync(outFile)) {
		if (!flag('resume'))
			usage(`${outFile} exists. Pass --resume to continue it, or choose another --run-id.`);
		const file = JSON.parse(readFileSync(outFile, 'utf8')) as RunHeader & { records: EvalRecord[] };
		records = file.records;
		existing = file;
		try {
			checkResume(file, codeVersion());
		} catch (error) {
			usage(String(error instanceof Error ? error.message : error));
		}
	}
	const done = new Set(
		records.map((r) => `${r.program.id}|${r.prompt.id}|${r.model.id}|${r.sample}`)
	);
	const todo = wanted.filter(
		(w) => !done.has(`${w.program.program.id}|${w.promptId}|${w.model.id}|${w.sample}`)
	);

	// Before any money is spent: does LiteLLM have a route for each model?
	const routes = await fetchRouteNames({ baseUrl: BASE, key: KEY });
	for (const model of models) {
		if (!isServed(model.model, routes)) {
			usage(
				`${model.id}: LiteLLM has no route for "${model.model}". Models named in full ("openrouter/vendor/model") need the local wildcard route: docker compose -f infra/llm-proxy/docker-compose.yml -f infra/llm-proxy/docker-compose.benchmark.yml up -d litellm`
			);
		}
	}

	// What each model is, as LiteLLM resolves it. An alias can be repointed, so a model that
	// says what it expects to be is checked before any money is spent.
	const resolved = await fetchModels(
		{ baseUrl: BASE, key: KEY },
		models.map((model) => model.model)
	);
	const identities = Object.fromEntries(
		models.map((model) => {
			const identity = resolved[model.model] ?? identityFromModelString(model.model);
			if (model.expect !== undefined && identity.model !== model.expect) {
				usage(
					`${model.id}: ${model.model} resolves to ${identity.model}, not ${model.expect}. Repoint the alias in LiteLLM's config, or change the registry.`
				);
			}
			return [model.id, { ...identity, sentAs: model.model, request: model.request }];
		})
	);

	const ranAt = new Date().toISOString();
	const code = codeVersion();
	const save = async (): Promise<void> => {
		mkdirSync(dirname(outFile), { recursive: true });
		const header: RunHeader = {
			kind: 'baseline',
			runId,
			ranAt,
			litellm: BASE,
			code,
			modelIds,
			models: identities,
			prompts: promptIds.map((id) => ({
				id,
				fingerprint: promptFingerprint(getZoomPrompt(id)),
				params: getZoomPrompt(id).params
			})),
			samples
		};
		let merged: RunHeader;
		try {
			merged = existing ? mergeHeader(existing, header) : header;
		} catch (error) {
			usage(String(error instanceof Error ? error.message : error));
		}
		writeFileSync(outFile, `${JSON.stringify({ ...merged, records })}\n`);
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
				model: item.model,
				sample: item.sample,
				complete
			});
			records.push(record);
			finished++;
			const m = record.metrics!;
			console.log(
				`[${finished}/${todo.length}] ${item.program.program.id} ${item.promptId} ${item.model.id} #${item.sample}: ${m.valid ? 'ok' : `FAILED (${m.failure ?? '?'})`}, ${m.attempts} attempt(s), ${m.completionTokens} output tokens, ${m.totalSeconds.toFixed(0)}s`
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
