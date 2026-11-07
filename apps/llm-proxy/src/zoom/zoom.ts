import {
	ZoomResponseSchema,
	type ChatMessage,
	type ZoomRequest,
	type ZoomResponse
} from '@szrs/llm-proxy-contracts';
import { z } from 'zod';

import { getZoomPrompt } from './prompts/index.js';
import { readPlan, type ZoomPlan } from './plan.js';
import { expandPlaceholders } from './placeholders.js';
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

// Models often wrap JSON in fences or lead with prose despite being told not
// to, so both are stripped before parsing. Mistakes with exactly one correct
// fix are then repaired, and the result is checked against the schema and
// against the Detail workspace it was made from. Throws with a message
// suitable for feeding back to the model on retry.
export function parseZoomResponse(
	text: string,
	detailWorkspace: Record<string, unknown>,
	promptId?: string
): { result: ZoomResponse; repairs: string[]; plan?: ZoomPlan } {
	let cleaned = text.trim();
	const fenceMatch = /```(?:json)?\s*\n([\s\S]*)\n\s*```/.exec(cleaned);
	if (fenceMatch) cleaned = fenceMatch[1].trim();
	const start = cleaned.indexOf('{');
	if (start > 0) cleaned = cleaned.slice(start);

	const raw: unknown = JSON.parse(cleaned);
	// Only v1 and later ask for one. Read before the schema drops it.
	const plan = readPlan(raw);
	const repairs = repairZoomResult(raw, detailWorkspace);
	if (getZoomPrompt(promptId).output === 'placeholders') {
		const expanded = expandPlaceholders(raw, detailWorkspace);
		repairs.push(...expanded.repairs);
		if (expanded.problems.length > 0) {
			throw new ZoomOutputError('validation', expanded.problems.join('\n'));
		}
	}
	const result = ZoomResponseSchema.safeParse(raw);
	if (!result.success) {
		throw new ZoomOutputError('schema', z.prettifyError(result.error));
	}
	const problems = checkZoomResult(result.data, detailWorkspace);
	if (problems.length > 0) {
		throw new ZoomOutputError('validation', problems.join('\n'));
	}
	return { result: result.data, repairs, ...(plan && { plan }) };
}
