// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import type { ChatCompletionUsage } from '@szrs/llm-proxy-contracts';
import type { FastifyBaseLogger } from 'fastify';

import type { Outline } from './outline.js';
import type { ZoomPlan } from './plan.js';
import { ZoomOutputError } from './zoom.js';

/**
 * How an attempt ended. `ok` includes outputs that needed repair (see `repairs`).
 * `flagged` is a valid zoom that broke a rule worth asking again for (see
 * plan-check.ts and `warnings`); it is the answer only if asking again fails.
 */
export type AttemptOutcome =
	'ok' | 'flagged' | 'parse' | 'schema' | 'validation' | 'truncated' | 'other';

/** One call to the model, as logged. */
export interface AttemptRecord {
	promptId: string;
	/** The alias the caller asked for. */
	model: string;
	attempt: number;
	outcome: AttemptOutcome;
	/** Why the model stopped, when LiteLLM said (`stop`, `length`, …). */
	finishReason?: string;
	usage?: ChatCompletionUsage;
	/** What repair.ts changed, one message per repair. */
	repairs: string[];
	/** The size of the program asked about. */
	outline?: Pick<Outline, 'blocks'> & { stacks: number };
	/** The model's plan, for attempts that made a valid zoom. */
	plan?: ZoomPlan;
	/** What plan-check.ts found wrong with a valid zoom, when anything. */
	warnings?: string[];
	latencyMs: number;
}

/** The outcome for text that did not make a valid zoom. */
export function classifyError(error: unknown): 'parse' | 'schema' | 'validation' | 'other' {
	if (error instanceof SyntaxError) return 'parse';
	if (error instanceof ZoomOutputError) return error.kind;
	return 'other';
}

/** The error for an answer the model's output limit cut off. Retrying would cut it off again. */
export function truncationMessage(tokens: number | undefined): string {
	return `The model's output was cut off${tokens === undefined ? '' : ` at ${tokens} tokens`}, so the zoom is incomplete. The program may be too large for one request.`;
}

/** One structured record per attempt, so retries, repairs and truncation can be counted. */
export function logAttempt(log: FastifyBaseLogger, record: AttemptRecord): void {
	log.info(record, 'zoom attempt');
}

/** LiteLLM request metadata that lets traces be filtered by prompt version. */
export function traceMetadata(promptId: string): Record<string, unknown> {
	return { prompt_id: promptId, tags: ['zoom', `zoom-prompt:${promptId}`] };
}
