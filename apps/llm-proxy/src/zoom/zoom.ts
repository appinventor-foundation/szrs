import {
	ZoomResponseSchema,
	type ChatMessage,
	type ZoomRequest,
	type ZoomResponse
} from '@szrs/llm-proxy-contracts';
import { z } from 'zod';

import { applyDefaultColour } from './colour.js';
import { getZoomPrompt } from './prompts/index.js';
import { checkPlan } from './plan-check.js';
import { readPlan, type ZoomPlan } from './plan.js';
import { expandPlaceholders } from './placeholders.js';
import { isRecord } from './saved-blocks.js';
import { buildStacks } from './stacks.js';
import { repairZoomResult } from './repair.js';
import { checkZoomResult } from './validate.js';

export const MAX_ATTEMPTS = 3;

/**
 * Model output that parsed as JSON but is not a valid zoom: `schema` when it
 * does not match the response shape, `validation` when it does not fit the
 * Detail workspace. (Text that is not JSON throws a SyntaxError.)
 */
export class ZoomOutputError extends Error {
	constructor(
		readonly kind: 'schema' | 'validation',
		message: string
	) {
		super(message);
		this.name = 'ZoomOutputError';
	}
}

// The prompts themselves live in ./prompts (one frozen file per id).
export { DEFAULT_PROMPT_ID, getZoomPrompt, toSnakeSlug } from './prompts/index.js';

/** The default prompt's system text. */
export const ZOOM_SYSTEM_PROMPT = getZoomPrompt().system;

/** The user message of the default prompt, for a first attempt. */
export function buildZoomPrompt(slug: string, workspaceJson: Record<string, unknown>): string {
	return getZoomPrompt().buildUser({ slug, workspaceJson });
}

export function buildZoomMessages(
	request: ZoomRequest,
	previousError?: string,
	promptId?: string
): ChatMessage[] {
	const prompt = getZoomPrompt(promptId);
	return [
		{ role: 'system', content: prompt.system },
		{ role: 'user', content: prompt.buildUser(request, previousError) }
	];
}

/**
 * What a prompt's output format needs done to the parsed JSON before the
 * schema sees it: build the workspaces from `stacks` (v2 on), repair the
 * mistakes that have one fix, and turn value placeholders into fields and
 * bindings. Works in place. `failure` says what the model got wrong, in its own
 * words; the proxy and the evals scorer both read output through this, so they
 * cannot disagree.
 */
export function prepareOutput(
	raw: unknown,
	detailWorkspace: Record<string, unknown>,
	promptId?: string
): { repairs: string[]; failure?: ZoomOutputError } {
	const prompt = getZoomPrompt(promptId);
	if (prompt.workspace === 'stacks') {
		const problems = buildStacks(raw);
		if (problems.length > 0) {
			return {
				repairs: [],
				failure: new ZoomOutputError('schema', inPromptWords(problems.join('\n'), promptId))
			};
		}
	}
	const repairs = repairZoomResult(raw, detailWorkspace);
	if (prompt.output === 'placeholders') {
		const expanded = expandPlaceholders(raw, detailWorkspace);
		repairs.push(...expanded.repairs);
		if (expanded.problems.length > 0) {
			return {
				repairs,
				failure: new ZoomOutputError(
					'validation',
					inPromptWords(expanded.problems.join('\n'), promptId)
				)
			};
		}
	}
	return { repairs };
}

/** A prompt whose output has `stacks` never wrote a `workspaceJson`, so its errors should not name one. */
function inPromptWords(message: string, promptId?: string): string {
	return getZoomPrompt(promptId).workspace === 'stacks'
		? message.replaceAll('workspaceJson', 'stacks')
		: message;
}

// Models often wrap JSON in fences or lead with prose despite being told not
// to, so both are stripped before parsing. Mistakes with exactly one correct
// fix are then repaired, and the result is checked against the schema and
// against the Detail workspace it was made from. Throws with a message
// suitable for feeding back to the model on retry.
export function parseZoomResponse(
	text: string,
	detailWorkspace: Record<string, unknown>,
	promptId?: string
): { result: ZoomResponse; repairs: string[]; plan?: ZoomPlan; warnings: string[] } {
	let cleaned = text.trim();
	const fenceMatch = /```(?:json)?\s*\n([\s\S]*)\n\s*```/.exec(cleaned);
	if (fenceMatch) cleaned = fenceMatch[1].trim();
	const start = cleaned.indexOf('{');
	if (start > 0) cleaned = cleaned.slice(start);

	const raw: unknown = JSON.parse(cleaned);
	// Only v1 and later ask for one. Read before the schema drops it.
	const plan = readPlan(raw);
	const prepared = prepareOutput(raw, detailWorkspace, promptId);
	if (prepared.failure) throw prepared.failure;
	const { repairs } = prepared;
	// The plan is read leniently above, and returned with the result: a plan the
	// schema would not accept must not cost a retry.
	const result = ZoomResponseSchema.safeParse(
		isRecord(raw) ? Object.fromEntries(Object.entries(raw).filter(([key]) => key !== 'plan')) : raw
	);
	if (!result.success) {
		throw new ZoomOutputError('schema', inPromptWords(z.prettifyError(result.error), promptId));
	}
	const problems = checkZoomResult(result.data, detailWorkspace);
	if (problems.length > 0) {
		throw new ZoomOutputError('validation', inPromptWords(problems.join('\n'), promptId));
	}
	// Not errors: the zoom is valid. The caller may ask again and keep this one if that does not help.
	const warnings = checkPlan(plan, result.data, detailWorkspace).map((message) =>
		inPromptWords(message, promptId)
	);
	const response: ZoomResponse = { ...result.data, ...(plan && { plan }) };
	applyDefaultColour(response);
	return { result: response, repairs, ...(plan && { plan }), warnings };
}
