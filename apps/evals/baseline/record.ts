// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import type { ZoomResponse } from '@szrs/llm-proxy-contracts';

import type { ZoomPlan } from '@szrs/llm-proxy/zoom/plan.js';
import type { Tier } from './corpus/index.js';

/** How one call to the model ended (the same vocabulary as the proxy's attempt log). */
export type AttemptOutcome = 'ok' | 'parse' | 'schema' | 'validation' | 'truncated' | 'other';

/** One call to the model. The raw text is kept so a later validator can score it again. */
export interface Attempt {
	n: number;
	rawText: string;
	finishReason?: string;
	usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
	latencyMs: number;
	firstTokenMs?: number;
	/** Set when the call itself failed (LiteLLM answered with an error status). */
	upstreamError?: { status: number; message: string };
}

/** One program zoomed once with one prompt on one model (plan, Appendix D). */
export interface EvalRecord {
	runId: string;
	program: { id: string; tier: Tier; blocks: number; topLevelStacks: number; hash: string };
	prompt: { id: string; fingerprint: string };
	model: { alias: string; params: { temperature?: number; maxTokens?: number } };
	sample: number;
	startedAt: string;
	/** Every call, in order; the last one made the result, or the run gave up after it. */
	attempts: Attempt[];
	/** The first attempt that parsed, as the proxy would have returned it (canonical ids). */
	result?: ZoomResponse;
	plan?: ZoomPlan;
	repairs?: string[];
	/** Scored by `score.ts`; recomputed whenever a validator changes. */
	metrics?: Metrics;
}

export interface LevelMetrics {
	/** Blocks in the level, over blocks in Detail (D12). */
	compression: number;
	blocks: number;
	topLevelBlocks: number;
	/** Whether the level loaded into a headless Blockly workspace (D5). */
	loads?: boolean;
	loadError?: string;
	/** Labels or tooltips that contain a literal value from Detail (D17). */
	valueLeaks: string[];
	/** Block types and ids that break the naming rules (D16). */
	namingProblems: string[];
}

export interface Metrics {
	/** D1: the run ended with a zoom that passes the schema and the checks against Detail. */
	valid: boolean;
	/** D2 */
	validFirstAttempt: boolean;
	/** D3: the number of the attempt that succeeded. Undefined for a failed run. */
	attemptsToSuccess?: number;
	attempts: number;
	/** D4: repair messages by kind. */
	repairs: Record<string, number>;
	/** What stopped the run, when it did not succeed: the last attempt's outcome. */
	failure?: AttemptOutcome;
	failureMessage?: string;
	/** D26 */
	truncated: boolean;
	/** D6: bindings with no problem, over all bindings (undefined when the output had none or never parsed as a zoom). */
	bindingValidity?: number;
	bindings: number;
	/** D8: multi-reference bindings whose Detail fields start with the same value, over all such bindings. */
	bindingConsistency?: number;
	/** D11: from the plan (v1 and later). */
	coverage?: { stacksCovered: number; stacksDuplicated: number; operationsCovered: number };
	semantic?: LevelMetrics;
	concept?: LevelMetrics;
	/** D13 */
	monotonic?: boolean;
	/** D14 */
	conceptCount?: number;
	conceptCountInRange?: boolean;
	/** D15, for compositions of k independent programs. */
	compositionRecall?: boolean;
	/** D18: how alike the two levels' labels are, 0 to 1. */
	redundancy?: number;
	/** D21, D27 */
	promptTokens?: number;
	completionTokens: number;
	totalSeconds: number;
	firstTokenSeconds?: number;
}
