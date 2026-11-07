// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import type { ChatMessage } from '@szrs/llm-proxy-contracts';

import { promptFingerprint } from '@szrs/llm-proxy/zoom/cache-key.js';
import { getZoomPrompt } from '@szrs/llm-proxy/zoom/prompts/index.js';
import { buildZoomMessages, MAX_ATTEMPTS } from '@szrs/llm-proxy/zoom/zoom.js';
import { effectiveParams, type BenchmarkModel } from './model-registry.js';
import { programHash, type PreparedProgram } from './prepare.js';
import type { Attempt, EvalRecord } from './record.js';
import { judgeAttempt, scoreRecord } from './metrics.js';

/** What one call to a model returns; the runner never talks to LiteLLM itself, so tests can fake it. */
export type Completion =
	| {
			ok: true;
			text: string;
			finishReason?: string;
			usage?: Attempt['usage'];
			firstTokenMs?: number;
			provider?: string;
			reasoningTokens?: number;
			/** Dollars, as OpenRouter reports it. */
			cost?: number;
			retries?: number;
	  }
	| { ok: false; status: number; message: string; timedOut?: boolean; retries?: number };

export interface CompleteRequest {
	/** Sent as `model`. */
	model: string;
	/** Extra fields for the request body (the model's provider pin and reasoning setting). */
	extra?: Record<string, unknown>;
	messages: ChatMessage[];
	temperature?: number;
	maxTokens?: number;
	/** Tags that reach Langfuse, so a run's traces can be found. */
	tags: string[];
	promptId: string;
}
export type CompleteFn = (request: CompleteRequest) => Promise<Completion>;

export interface RunOneOptions {
	runId: string;
	prepared: PreparedProgram;
	promptId: string;
	model: BenchmarkModel;
	sample: number;
	complete: CompleteFn;
	now?: () => number;
	/** Whether to load levels in headless Blockly while scoring (D5). */
	headless?: boolean;
}

/**
 * One program, one prompt, one model, one sample: what the proxy's zoom route
 * does (up to three attempts, a retry carries the last error, a truncated
 * answer stops the run), without the cache, and keeping the raw text of every
 * attempt. Never throws for a model failure: the record says what happened.
 */
export async function runOne(options: RunOneOptions): Promise<EvalRecord> {
	const { prepared, promptId, model, runId, sample, complete } = options;
	const now = options.now ?? Date.now;
	const prompt = getZoomPrompt(promptId);
	const params = effectiveParams(prompt.params, model.params);
	const attempts: Attempt[] = [];
	const startedAt = new Date(now()).toISOString();
	let lastError: string | undefined;

	for (let n = 1; n <= MAX_ATTEMPTS; n++) {
		const messages = buildZoomMessages(
			{ model: model.id, slug: prepared.slug, workspaceJson: prepared.workspaceJson },
			lastError,
			promptId
		);
		const started = now();
		const call = await complete({
			model: model.model,
			...(model.request && { extra: { ...model.request } }),
			messages,
			...params,
			tags: ['zoom', `zoom-prompt:${promptId}`, `baseline:${runId}`],
			promptId
		});
		const latencyMs = now() - started;
		if (!call.ok) {
			attempts.push({
				n,
				rawText: '',
				latencyMs,
				upstreamError: {
					status: call.status,
					message: call.message,
					...(call.timedOut && { timedOut: true })
				},
				...(call.retries && { retries: call.retries })
			});
			break;
		}
		const attempt: Attempt = {
			n,
			rawText: call.text,
			latencyMs,
			...(call.finishReason && { finishReason: call.finishReason }),
			...(call.usage && { usage: call.usage }),
			...(call.firstTokenMs !== undefined && { firstTokenMs: call.firstTokenMs }),
			...(call.provider && { provider: call.provider }),
			...(call.reasoningTokens !== undefined && { reasoningTokens: call.reasoningTokens }),
			...(call.cost !== undefined && { cost: call.cost }),
			...(call.retries && { retries: call.retries })
		};
		attempts.push(attempt);

		const judged = judgeAttempt(attempt, prepared.workspaceJson, promptId);
		// Done, or cut off by the output limit (a retry would be cut off in the same place).
		if (judged.outcome === 'ok' || judged.outcome === 'truncated') break;
		lastError = judged.message;
	}

	const { program } = prepared;
	const scored = scoreRecord({ attempts }, prepared, { headless: options.headless, promptId });
	return {
		runId,
		program: {
			id: program.id,
			tier: program.tier,
			blocks: program.blocks,
			topLevelStacks: program.topLevelStacks,
			hash: programHash(program)
		},
		prompt: { id: promptId, fingerprint: promptFingerprint(prompt) },
		model: {
			id: model.id,
			sentAs: model.model,
			params,
			...(model.request && { request: model.request })
		},
		sample,
		startedAt,
		attempts,
		...(scored.result && { result: scored.result }),
		...(scored.plan && { plan: scored.plan }),
		...(scored.repairs && { repairs: scored.repairs }),
		metrics: scored.metrics
	};
}

/** Runs `tasks` with at most `limit` in flight, keeping the order of results. */
export async function pool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
	const results = new Array<T>(tasks.length);
	let next = 0;
	const worker = async (): Promise<void> => {
		while (next < tasks.length) {
			const index = next++;
			results[index] = await tasks[index]();
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
	return results;
}
