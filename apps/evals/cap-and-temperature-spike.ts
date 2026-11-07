// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/* eslint-disable turbo/no-undeclared-env-vars --
   Run by hand with pnpm, not as a Turborepo task, so its variables are not part
   of any task environment. */

/**
 * Measures, for each model alias, what the zoom prompts depend on: whether the
 * model accepts a fixed `temperature`, how large an output cap it accepts, whether
 * it honours a cap, whether it spends hidden "reasoning" tokens against it, and how
 * `v0` and `v1` behave on a small sample program. Then checks that the prompt id
 * reaches Langfuse. It makes real model calls (a few dozen small ones and four
 * zooms per alias), so it costs a little money. It never prints keys.
 *
 * Run from apps/evals, with LiteLLM up (see README.md):
 *
 *   pnpm spike:cap openrouter openrouter-2
 *
 * To add the model each alias resolves to into an existing results file, without
 * making any model call:
 *
 *   pnpm spike:cap --models-only results/<file>.json
 *
 * Results go to results/<date>-cap-and-temperature-spike.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chatCompletionStream } from '@szrs/llm-proxy/lib/litellm.js';
import { traceMetadata } from '@szrs/llm-proxy/zoom/attempt-log.js';
import { normalizeWorkspace } from '@szrs/llm-proxy/zoom/normalize.js';
import { buildOutline } from '@szrs/llm-proxy/zoom/outline.js';
import { getZoomPrompt } from '@szrs/llm-proxy/zoom/prompts/index.js';
import { buildZoomMessages, parseZoomResponse } from '@szrs/llm-proxy/zoom/zoom.js';

import { freshPath } from './results-path.js';

const BASE = process.env.LITELLM_BASE_URL ?? 'http://localhost:4000';
const KEY = process.env.LITELLM_VIRTUAL_KEY ?? '';
const LANGFUSE_HOST = process.env.LANGFUSE_HOST_URL ?? 'http://localhost:3001';
const CAPS = [8192, 16384, 32768, 65536, 131072];
const PROMPT_IDS = ['v1', 'v0'];
const args = process.argv.slice(2);
const modelsOnly = args[0] === '--models-only';
const aliases = modelsOnly ? [] : args;

const here = dirname(fileURLToPath(import.meta.url));
const date = new Date().toISOString().slice(0, 10);
const outFile = freshPath(resolve(here, 'results'), `${date}-cap-and-temperature-spike`, '.json');

type Message = { role: 'user'; content: string };
const reply: Message[] = [{ role: 'user', content: 'Reply with the single word: ok' }];
// An answer far longer than the small cap used with it, so the cap decides where it stops.
const longAnswer: Message[] = [
	{ role: 'user', content: 'Write a detailed 800-word essay about the history of bridges.' }
];
const SMALL_CAP = 256;

interface RawResult {
	status: number;
	ms: number;
	model?: string;
	finishReason?: string;
	usage?: unknown;
	/** The message carried reasoning text, so the model "thinks" before it answers. */
	hasReasoning?: boolean;
	contentChars?: number;
	error?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

// A plain chat call, to see exactly what LiteLLM and the provider answer.
async function raw(body: Record<string, unknown>): Promise<RawResult> {
	const started = Date.now();
	try {
		const res = await fetch(`${BASE}/v1/chat/completions`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(240_000)
		});
		const text = await res.text();
		let json: unknown;
		try {
			json = JSON.parse(text);
		} catch {
			json = undefined;
		}
		const choices = isRecord(json) && Array.isArray(json.choices) ? json.choices : [];
		const choice = isRecord(choices[0]) ? choices[0] : undefined;
		const message = choice && isRecord(choice.message) ? choice.message : undefined;
		const errorBody = isRecord(json) && isRecord(json.error) ? json.error.message : undefined;
		return {
			status: res.status,
			ms: Date.now() - started,
			model: isRecord(json) && typeof json.model === 'string' ? json.model : undefined,
			finishReason: typeof choice?.finish_reason === 'string' ? choice.finish_reason : undefined,
			usage: isRecord(json) ? json.usage : undefined,
			hasReasoning: Boolean(message?.reasoning ?? message?.reasoning_content),
			contentChars: typeof message?.content === 'string' ? message.content.length : undefined,
			error: res.ok ? undefined : String(errorBody ?? text).slice(0, 400)
		};
	} catch (error) {
		return { status: 0, ms: Date.now() - started, error: String(error).slice(0, 300) };
	}
}

// A small program: a procedure that rolls a die, a loose score update and a reset procedure.
const num = (id: string, value: number) => ({ type: 'math_number', id, fields: { NUM: value } });
const getVar = (id: string, varId: string) => ({
	type: 'variables_get',
	id,
	fields: { VAR: { id: varId } }
});
const sample = {
	blocks: {
		languageVersion: 0,
		blocks: [
			{
				type: 'procedures_defnoreturn',
				id: 'rollDiceId',
				x: 20,
				y: 20,
				fields: { NAME: 'rollDice' },
				inputs: {
					STACK: {
						block: {
							type: 'variables_set',
							id: 'setRoll',
							fields: { VAR: { id: 'rollVar' } },
							inputs: {
								VALUE: {
									block: {
										type: 'math_random_int',
										id: 'rnd',
										inputs: { FROM: { shadow: num('from', 1) }, TO: { shadow: num('to', 6) } }
									}
								}
							},
							next: {
								block: {
									type: 'text_print',
									id: 'show',
									inputs: { TEXT: { block: getVar('getRoll', 'rollVar') } }
								}
							}
						}
					}
				}
			},
			{
				type: 'variables_set',
				id: 'addScore',
				x: 20,
				y: 220,
				fields: { VAR: { id: 'scoreVar' } },
				inputs: {
					VALUE: {
						block: {
							type: 'math_arithmetic',
							id: 'sum',
							fields: { OP: 'ADD' },
							inputs: {
								A: { block: getVar('getScore', 'scoreVar') },
								B: { block: getVar('getRoll2', 'rollVar') }
							}
						}
					}
				}
			},
			{
				type: 'procedures_defnoreturn',
				id: 'resetId',
				x: 20,
				y: 360,
				fields: { NAME: 'resetGame' },
				inputs: {
					STACK: {
						block: {
							type: 'variables_set',
							id: 'zeroScore',
							fields: { VAR: { id: 'scoreVar' } },
							inputs: { VALUE: { shadow: num('zero', 0) } }
						}
					}
				}
			}
		]
	},
	variables: [
		{ name: 'roll', id: 'rollVar' },
		{ name: 'score', id: 'scoreVar' }
	]
};

// One real zoom, through the proxy's own client, prompt registry and parser.
async function zoom(alias: string, promptId: string, workspaceJson: Record<string, unknown>) {
	const prompt = getZoomPrompt(promptId);
	const started = Date.now();
	const call = await chatCompletionStream(
		{ LITELLM_BASE_URL: BASE, LITELLM_VIRTUAL_KEY: KEY },
		{
			model: alias,
			messages: buildZoomMessages(
				{ model: alias, slug: 'dice-game', workspaceJson },
				undefined,
				promptId
			),
			...prompt.params
		},
		{ metadata: traceMetadata(promptId) }
	);
	if (!call.ok) {
		return { ok: false, status: call.status, body: JSON.stringify(call.body).slice(0, 300) };
	}

	let text = '';
	let firstTokenMs: number | undefined;
	for await (const token of call.tokens) {
		firstTokenMs ??= Date.now() - started;
		text += token;
	}

	let parsed: Record<string, unknown>;
	try {
		const { result, repairs, plan } = parseZoomResponse(text, workspaceJson);
		const topBlocks = (level: { workspaceJson: Record<string, unknown> }): number => {
			const blocks = isRecord(level.workspaceJson.blocks) ? level.workspaceJson.blocks.blocks : [];
			return Array.isArray(blocks) ? blocks.length : 0;
		};
		parsed = {
			outcome: 'ok',
			repairs,
			semanticTopBlocks: topBlocks(result.semantic),
			conceptTopBlocks: topBlocks(result.concept),
			bindings: result.semantic.bindings.length + result.concept.bindings.length,
			plan
		};
	} catch (error) {
		parsed = {
			outcome: 'invalid',
			error: String(error instanceof Error ? error.message : error).slice(0, 500)
		};
	}
	return {
		ok: true,
		totalMs: Date.now() - started,
		firstTokenMs,
		chars: text.length,
		finishReason: call.summary.finishReason,
		usage: call.summary.usage,
		maxTokens: prompt.params.maxTokens,
		...parsed,
		rawText: text
	};
}

// Does the prompt id reach Langfuse? Traces arrive a little after the call.
async function langfuseTraces(tag: string, since: Date, expected: number) {
	const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
	const secretKey = process.env.LANGFUSE_SECRET_KEY;
	if (!publicKey || !secretKey)
		return { skipped: 'LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY not set' };

	const auth = Buffer.from(`${publicKey}:${secretKey}`).toString('base64');
	const url = `${LANGFUSE_HOST}/api/public/traces?tags=${encodeURIComponent(tag)}&fromTimestamp=${since.toISOString()}&limit=50`;
	let found: unknown[] = [];
	for (let attempt = 0; attempt < 18; attempt++) {
		try {
			const res = await fetch(url, { headers: { authorization: `Basic ${auth}` } });
			const body: unknown = await res.json();
			found = isRecord(body) && Array.isArray(body.data) ? body.data : [];
			if (found.length >= expected) break;
		} catch (error) {
			return { error: String(error).slice(0, 200) };
		}
		await new Promise((done) => setTimeout(done, 5000));
	}
	return {
		tag,
		expected,
		found: found.length,
		sample: found.slice(0, 2).map((trace) =>
			isRecord(trace)
				? {
						name: trace.name,
						tags: trace.tags,
						metadataKeys: Object.keys(isRecord(trace.metadata) ? trace.metadata : {})
					}
				: trace
		)
	};
}

/** What an alias resolves to. An alias is a name in LiteLLM's config; the model is what matters. */
interface ModelIdentity {
	/** The model, without its provider and maker: "glm-5.3-flash". */
	model: string;
	/** The service the request goes to ("openrouter", "openai"). */
	provider?: string;
	/** The maker, when the provider routes to several ("z-ai", "deepseek"). */
	vendor?: string;
	/** LiteLLM's full model string. */
	litellmModel: string;
}

// LiteLLM reports, for each alias, the model it is configured with. Read-only.
async function fetchModels(wanted: string[]): Promise<Record<string, ModelIdentity>> {
	const res = await fetch(`${BASE}/v1/model/info`, { headers: { authorization: `Bearer ${KEY}` } });
	const body: unknown = await res.json();
	const entries = isRecord(body) && Array.isArray(body.data) ? body.data : [];
	const found: Record<string, ModelIdentity> = {};
	for (const entry of entries) {
		if (!isRecord(entry) || typeof entry.model_name !== 'string') continue;
		if (!wanted.includes(entry.model_name)) continue;
		const params = isRecord(entry.litellm_params) ? entry.litellm_params : {};
		const info = isRecord(entry.model_info) ? entry.model_info : {};
		const litellmModel = typeof params.model === 'string' ? params.model : entry.model_name;
		const parts = litellmModel.split('/');
		found[entry.model_name] = {
			model: parts[parts.length - 1] ?? litellmModel,
			provider:
				typeof info.litellm_provider === 'string'
					? info.litellm_provider
					: parts.length > 1
						? parts[0]
						: undefined,
			vendor: parts.length > 2 ? parts[1] : undefined,
			litellmModel
		};
	}
	return found;
}

// Adds the models block to a results file that was written without one.
async function recordModels(file: string): Promise<void> {
	const path = resolve(file);
	const json: unknown = JSON.parse(readFileSync(path, 'utf8'));
	if (!isRecord(json) || !Array.isArray(json.aliases)) throw new Error(`${path} has no aliases`);
	const wanted = json.aliases.filter((alias): alias is string => typeof alias === 'string');
	json.models = await fetchModels(wanted);
	json.modelsRecordedAt = new Date().toISOString();
	writeFileSync(path, `${JSON.stringify(json, null, '\t')}\n`);
	console.log(`models recorded in ${path}`, JSON.stringify(json.models));
}

async function main(): Promise<void> {
	if (modelsOnly) {
		if (args[1] === undefined || KEY === '') {
			console.error('Usage: pnpm spike:cap --models-only <results.json>');
			process.exit(2);
		}
		await recordModels(args[1]);
		return;
	}

	if (aliases.length === 0 || KEY === '') {
		console.error(
			'Usage: LITELLM_VIRTUAL_KEY=... pnpm spike:cap <alias> [<alias> ...]\n' +
				'(pnpm spike:cap loads apps/llm-proxy/.env.local; LiteLLM must be up.)'
		);
		process.exit(2);
	}

	const startedAt = new Date();
	const results: Record<string, unknown> = {
		ranAt: startedAt.toISOString(),
		litellm: BASE,
		aliases,
		models: await fetchModels(aliases),
		modelsRecordedAt: startedAt.toISOString()
	};
	const { workspaceJson } = normalizeWorkspace(sample);
	const outline = buildOutline(workspaceJson);
	results.program = { blocks: outline.blocks, topLevelStacks: outline.stacks.length };

	for (const alias of aliases) {
		console.log(`\n== ${alias}`);
		const perAlias: Record<string, unknown> = {};
		results[alias] = perAlias;

		perAlias.temperature = {
			accepted: await raw({ model: alias, messages: reply, temperature: 0.2, max_tokens: 50 }),
			omitted: await raw({ model: alias, messages: reply, max_tokens: 50 })
		};

		// A provider rejects too large a max_tokens at request time whatever the
		// answer's length, so a tiny prompt is enough to see which caps are accepted.
		const acceptance: Record<string, RawResult> = {};
		for (const cap of CAPS) {
			acceptance[cap] = await raw({
				model: alias,
				messages: reply,
				temperature: 0.2,
				max_tokens: cap
			});
		}
		perAlias.capAcceptance = acceptance;

		// Is a cap honoured, and what counts against it?
		perAlias.capHonoured = await raw({
			model: alias,
			messages: longAnswer,
			temperature: 0.2,
			max_tokens: SMALL_CAP
		});

		const zooms: Record<string, unknown> = {};
		for (const promptId of PROMPT_IDS) {
			zooms[promptId] = await zoom(alias, promptId, workspaceJson);
			const summary = Object.fromEntries(
				Object.entries(zooms[promptId] as Record<string, unknown>).filter(
					([key]) => key !== 'rawText'
				)
			);
			console.log(promptId, JSON.stringify(summary).slice(0, 400));
		}
		perAlias.zooms = zooms;
	}

	results.langfuse = await langfuseTraces('zoom-prompt:v1', startedAt, aliases.length);
	console.log('langfuse', JSON.stringify(results.langfuse));

	mkdirSync(dirname(outFile), { recursive: true });
	writeFileSync(outFile, `${JSON.stringify(results, null, '\t')}\n`);
	console.log(`\nwritten ${outFile}`);
}

main().catch((error: unknown) => {
	console.error('spike failed:', String(error).slice(0, 400));
	process.exit(1);
});
