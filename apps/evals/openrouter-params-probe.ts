// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/* eslint-disable turbo/no-undeclared-env-vars --
   Run by hand with pnpm, not as a Turborepo task, so its variables are not part
   of any task environment. */

/**
 * Checks, through LiteLLM, what OpenRouter's `reasoning` and `provider` request
 * fields do for the models in baseline/model-registry.ts: whether LiteLLM passes
 * them on (at the top level of the request and in `extra_body`), whether
 * reasoning can be switched off or lowered, whether a provider pin is honoured
 * and a bogus one refused, and which provider served each call. Then one zoom of
 * a corpus program with reasoning at `low`. About twenty small calls and one zoom
 * per model, so a few cents. Run from apps/evals with LiteLLM up:
 *
 *   pnpm probe:openrouter glm-5.3-flash deepseek-v4.1-flash-1017
 *
 * A request LiteLLM cannot serve puts the model on a short cooldown (it answers 429
 * for a few seconds), so cases that fail on purpose come last, after a wait.
 * Results go to results/<date>-openrouter-params.json. It never prints keys.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isRecord } from '@szrs/llm-proxy/zoom/saved-blocks.js';

import { findProgram } from './baseline/corpus/index.js';
import { litellmComplete } from './baseline/litellm-complete.js';
import { findBenchmarkModel, type BenchmarkModel } from './baseline/model-registry.js';
import { fetchModels, identityFromModelString } from './baseline/models.js';
import { prepareProgram } from './baseline/prepare.js';
import { runOne } from './baseline/runner.js';

const BASE = process.env.LITELLM_BASE_URL ?? 'http://localhost:4000';
const KEY = process.env.LITELLM_VIRTUAL_KEY ?? '';
const ids = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));
const date = new Date().toISOString().slice(0, 10);
const outFile = resolve(here, 'results', `${date}-openrouter-params.json`);
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

const prompt = [
	{ role: 'user', content: 'What is 17 times 23? Think it through, then answer with the number.' }
];

interface Case {
	name: string;
	extra: Record<string, unknown>;
	/** Expected to be refused: run last, with a wait before it. */
	failsOnPurpose?: boolean;
}

function cases(model: BenchmarkModel): Case[] {
	const pin = model.request?.provider?.order?.[0] ?? 'unknown';
	const bogus = { order: ['no-such-provider'], allow_fallbacks: false };
	return [
		{ name: 'default (no extra fields)', extra: {} },
		{ name: 'reasoning low (top level)', extra: { reasoning: { effort: 'low' } } },
		{ name: 'reasoning low (extra_body)', extra: { extra_body: { reasoning: { effort: 'low' } } } },
		{ name: 'reasoning none (top level)', extra: { reasoning: { effort: 'none' } } },
		{
			name: 'reasoning none (extra_body)',
			extra: { extra_body: { reasoning: { effort: 'none' } } }
		},
		{
			name: 'provider pin (top level)',
			extra: { provider: { order: [pin], allow_fallbacks: false } }
		},
		{
			name: 'provider pin (extra_body)',
			extra: { extra_body: { provider: { order: [pin], allow_fallbacks: false } } }
		},
		{
			name: 'reasoning_effort low (OpenAI style)',
			extra: { reasoning_effort: 'low' },
			failsOnPurpose: true
		},
		{ name: 'bogus provider (top level)', extra: { provider: bogus }, failsOnPurpose: true },
		{
			name: 'bogus provider (extra_body)',
			extra: { extra_body: { provider: bogus } },
			failsOnPurpose: true
		}
	];
}

async function call(model: string, extra: Record<string, unknown>) {
	const started = Date.now();
	try {
		const res = await fetch(`${BASE}/v1/chat/completions`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
			body: JSON.stringify({
				model,
				messages: prompt,
				max_tokens: 4000,
				temperature: 0.2,
				...extra
			}),
			signal: AbortSignal.timeout(180_000)
		});
		const text = await res.text();
		let json: unknown;
		try {
			json = JSON.parse(text);
		} catch {
			json = undefined;
		}
		const body = isRecord(json) ? json : {};
		const choice = Array.isArray(body.choices) && isRecord(body.choices[0]) ? body.choices[0] : {};
		const message = isRecord(choice.message) ? choice.message : {};
		const usage = isRecord(body.usage) ? body.usage : {};
		const details = isRecord(usage.completion_tokens_details)
			? usage.completion_tokens_details
			: {};
		const error = isRecord(body.error) ? body.error.message : undefined;
		return {
			status: res.status,
			ms: Date.now() - started,
			finishReason: choice.finish_reason,
			completionTokens: usage.completion_tokens,
			reasoningTokens: details.reasoning_tokens,
			answeredCorrectly: /391/.test(String(message.content ?? '')),
			servedBy: body.provider,
			error: res.ok ? undefined : String(error ?? text).slice(0, 500)
		};
	} catch (error) {
		return { status: 0, ms: Date.now() - started, error: String(error).slice(0, 300) };
	}
}

async function main(): Promise<void> {
	if (ids.length === 0 || KEY === '') {
		console.error(
			'Usage: pnpm probe:openrouter <model id> [<model id> ...]  (LITELLM_VIRTUAL_KEY must be set)'
		);
		process.exit(2);
	}
	const models = ids.map((id) => findBenchmarkModel(id));
	const resolved = await fetchModels(
		{ baseUrl: BASE, key: KEY },
		models.map((m) => m.model)
	);
	const results: Record<string, unknown> = {
		kind: 'openrouter-params',
		ranAt: new Date().toISOString(),
		litellm: BASE,
		modelIds: ids,
		models: Object.fromEntries(
			models.map((m) => [
				m.id,
				{
					...(resolved[m.model] ?? identityFromModelString(m.model)),
					sentAs: m.model,
					request: m.request
				}
			])
		)
	};

	for (const model of models) {
		console.log(`\n== ${model.id}`);
		const rows: unknown[] = [];
		for (const item of cases(model)) {
			if (item.failsOnPurpose) await wait(12_000);
			const row = { case: item.name, ...(await call(model.model, item.extra)) };
			rows.push(row);
			console.log(JSON.stringify(row).slice(0, 300));
		}
		await wait(12_000);

		// One zoom under the registry's own conditions, with reasoning lowered.
		const lowered: BenchmarkModel = {
			...model,
			request: { ...model.request, reasoning: { effort: 'low' } }
		};
		const record = await runOne({
			runId: 'openrouter-params',
			prepared: prepareProgram(findProgram('dice-game')),
			promptId: 'v1',
			model: lowered,
			sample: 1,
			complete: litellmComplete({ baseUrl: BASE, key: KEY })
		});
		const m = record.metrics;
		console.log(
			'zoom at low:',
			JSON.stringify({
				valid: m?.valid,
				attempts: m?.attempts,
				completionTokens: m?.completionTokens,
				reasoningTokens: m?.reasoningTokens,
				providers: m?.providers
			})
		);
		results[model.id] = { cases: rows, zoomAtLow: record };
	}

	mkdirSync(dirname(outFile), { recursive: true });
	writeFileSync(outFile, `${JSON.stringify(results, null, '\t')}\n`);
	console.log(`\nwritten ${outFile}`);
}

main().catch((error: unknown) => {
	console.error('probe failed:', String(error).slice(0, 400));
	process.exit(1);
});
