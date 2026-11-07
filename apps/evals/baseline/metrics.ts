// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/**
 * The deterministic metrics of plan section 9.4 that need no golden annotation
 * and no model: they read a stored record, so they can be run again whenever a
 * validator changes (the replay principle). Not covered yet: D7 (the binding
 * round trip), D9 and D10 (golden), D19 (see `stability`), D20, D22 to D25.
 */
import { ZoomResponseSchema, type ZoomLevel, type ZoomResponse } from '@szrs/llm-proxy-contracts';

import { classifyError } from '@szrs/llm-proxy/zoom/attempt-log.js';
import { repairZoomResult } from '@szrs/llm-proxy/zoom/repair.js';
import { allBlocks, byId, isRecord } from '@szrs/llm-proxy/zoom/saved-blocks.js';
import { checkZoomResult } from '@szrs/llm-proxy/zoom/validate.js';
import { parseZoomResponse } from '@szrs/llm-proxy/zoom/zoom.js';
import type { CorpusProgram } from './corpus/index.js';
import { loadsInBlockly } from './headless.js';
import type { Attempt, AttemptOutcome, EvalRecord, LevelMetrics, Metrics } from './record.js';
import { snakeSlug, type PreparedProgram } from './prepare.js';

type Json = Record<string, unknown>;

/** How an attempt ends when its stored text is parsed and checked again today. */
export function judgeAttempt(
	attempt: Attempt,
	detail: Json
): { outcome: AttemptOutcome; message?: string; parsed?: ReturnType<typeof parseZoomResponse> } {
	if (attempt.upstreamError) return { outcome: 'other', message: attempt.upstreamError.message };
	if (attempt.finishReason === 'length') return { outcome: 'truncated' };
	try {
		return { outcome: 'ok', parsed: parseZoomResponse(attempt.rawText, detail) };
	} catch (error) {
		return {
			outcome: classifyError(error),
			message: String(error instanceof Error ? error.message : error).slice(0, 400)
		};
	}
}

/** A repair message with its names and numbers taken out, so repairs can be counted by kind. */
export function repairKind(message: string): string {
	return message
		.replace(/^(semantic|concept)(\.bindings\[\d+\])?: /, '')
		.replace(/"[^"]*"/g, '"…"')
		.replace(/zoom_[a-z0-9_]+/g, 'zoom_…')
		.replace(/\b\d+\b/g, 'N');
}

const levelBlocks = (level: ZoomLevel): number => allBlocks(level.workspaceJson).length;
const topLevel = (level: ZoomLevel): number => {
	const blocks = isRecord(level.workspaceJson.blocks) ? level.workspaceJson.blocks.blocks : [];
	return Array.isArray(blocks) ? blocks.length : 0;
};

/** The literal values in Detail that a label should not repeat. */
function detailValues(detail: Json): { numbers: Set<number>; texts: string[] } {
	const numbers = new Set<number>();
	const texts = new Set<string>();
	for (const block of allBlocks(detail)) {
		for (const value of Object.values(block.fields ?? {})) {
			if (typeof value === 'number' && value !== 0 && value !== 1) numbers.add(value);
			if (typeof value === 'string' && value.length >= 3) texts.add(value);
		}
	}
	return { numbers, texts: [...texts] };
}

/** The words a person reads on a zoomed block: its message, its tooltip and its label fields. */
function labelsOf(level: ZoomLevel): string[] {
	const labels: string[] = [];
	for (const def of level.blockDefs) {
		for (const [key, value] of Object.entries(def)) {
			if (/^message\d+$/.test(key) && typeof value === 'string') {
				labels.push(value.replace(/%\d+/g, ' ').trim());
			}
			if (key === 'tooltip' && typeof value === 'string') labels.push(value);
			if (/^args\d+$/.test(key) && Array.isArray(value)) {
				for (const arg of value) {
					if (isRecord(arg) && arg.type === 'field_label' && typeof arg.text === 'string') {
						labels.push(arg.text);
					}
				}
			}
		}
	}
	return labels.filter((label) => label !== '');
}

function valueLeaks(level: ZoomLevel, detail: Json): string[] {
	const { numbers, texts } = detailValues(detail);
	const leaks: string[] = [];
	for (const label of labelsOf(level)) {
		const tokens = label.match(/(?<![\w.])-?\d+(?:\.\d+)?(?!\w)/g) ?? [];
		const hasNumber = tokens.some((token) => numbers.has(Number(token)));
		const lower = label.toLowerCase();
		const hasText = texts.some((text) => lower.includes(text.toLowerCase()));
		if (hasNumber || hasText) leaks.push(label);
	}
	return leaks;
}

function namingProblems(level: ZoomLevel, name: 'semantic' | 'concept', slug: string): string[] {
	const problems: string[] = [];
	const prefix = `zoom_${snakeSlug(slug)}_`;
	for (const def of level.blockDefs) {
		const type = String(def.type);
		if (!type.startsWith(prefix)) problems.push(`${type}: does not start with ${prefix}`);
		if (name === 'concept' && !type.endsWith('_concept')) {
			problems.push(`${type}: a Concept block type should end with _concept`);
		}
	}
	const ids = allBlocks(level.workspaceJson).map((block) => block.id);
	if (ids.some((id) => id === undefined || id === '')) problems.push('a block has no id');
	const seen = new Set<string>();
	for (const id of ids) {
		if (id === undefined) continue;
		if (seen.has(id)) problems.push(`duplicate block id ${id}`);
		seen.add(id);
	}
	return problems;
}

function levelMetrics(
	name: 'semantic' | 'concept',
	level: ZoomLevel,
	detail: Json,
	slug: string,
	headless: boolean
): LevelMetrics {
	const detailBlocks = allBlocks(detail).length;
	const loaded = headless
		? loadsInBlockly({
				blockDefs: level.blockDefs as unknown as Json[],
				workspaceJson: level.workspaceJson as Json
			})
		: undefined;
	return {
		blocks: levelBlocks(level),
		topLevelBlocks: topLevel(level),
		compression: detailBlocks === 0 ? 0 : levelBlocks(level) / detailBlocks,
		...(loaded && { loads: loaded.ok, ...(loaded.error && { loadError: loaded.error }) }),
		valueLeaks: valueLeaks(level, detail),
		namingProblems: namingProblems(level, name, slug)
	};
}

/** Words in a level's labels, for comparing the two levels (D18). */
function words(level: ZoomLevel): Set<string> {
	return new Set(
		labelsOf(level)
			.join(' ')
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter((word) => word.length > 2)
	);
}
function jaccard(a: Set<string>, b: Set<string>): number {
	if (a.size === 0 && b.size === 0) return 1;
	const shared = [...a].filter((word) => b.has(word)).length;
	return shared / (a.size + b.size - shared);
}

/** D6 and D8 over the bindings of a zoom that parses as a zoom shape, even if it is not otherwise valid. */
function bindingMetrics(
	rawText: string,
	detail: Json
): Pick<Metrics, 'bindings' | 'bindingValidity' | 'bindingConsistency'> {
	let raw: unknown;
	try {
		const cleaned = rawText.trim();
		raw = JSON.parse(
			cleaned.slice(Math.max(0, cleaned.indexOf('{'))).replace(/^```(?:json)?\s*|\s*```$/g, '')
		);
	} catch {
		return { bindings: 0 };
	}
	repairZoomResult(raw, detail);
	const parsed = ZoomResponseSchema.safeParse(raw);
	if (!parsed.success) return { bindings: 0 };
	return bindingMetricsOf(parsed.data, detail);
}

function bindingMetricsOf(
	result: ZoomResponse,
	detail: Json
): Pick<Metrics, 'bindings' | 'bindingValidity' | 'bindingConsistency'> {
	const all = [...result.semantic.bindings, ...result.concept.bindings];
	if (all.length === 0) return { bindings: 0 };
	const bad = new Set(
		checkZoomResult(result, detail)
			.map((message) => /^(semantic|concept)\.bindings\[(\d+)\]/.exec(message))
			.flatMap((match) => (match ? [`${match[1]}${match[2]}`] : []))
	);
	const blocks = byId(allBlocks(detail));
	const multi = all.filter((binding) => binding.detail.length > 1);
	const consistent = multi.filter((binding) => {
		const values = binding.detail.map((ref) => blocks.get(ref.block)?.fields?.[ref.field]);
		return values.every((value) => value !== undefined && value === values[0]);
	});
	return {
		bindings: all.length,
		bindingValidity: 1 - bad.size / all.length,
		...(multi.length > 0 && { bindingConsistency: consistent.length / multi.length })
	};
}

/** D11: how well the plan's concepts cover the program's top-level stacks and the Semantic blocks. */
function coverage(
	plan: NonNullable<EvalRecord['plan']>,
	detail: Json,
	semantic: ZoomLevel
): NonNullable<Metrics['coverage']> {
	const tops = (workspace: Json): string[] => {
		const blocks = isRecord(workspace.blocks) ? workspace.blocks.blocks : [];
		return (Array.isArray(blocks) ? blocks : []).flatMap((block) =>
			isRecord(block) && typeof block.id === 'string' ? [block.id] : []
		);
	};
	const share = (ids: string[], listed: string[][]): { covered: number; duplicated: number } => {
		const counts = ids.map((id) => listed.filter((list) => list.includes(id)).length);
		return {
			covered: ids.length === 0 ? 1 : counts.filter((count) => count === 1).length / ids.length,
			duplicated: counts.filter((count) => count > 1).length
		};
	};
	const stacks = share(
		tops(detail),
		plan.concepts.map((concept) => concept.stacks)
	);
	const operations = share(
		tops(semantic.workspaceJson as Json),
		plan.concepts.map((concept) => concept.operations)
	);
	return {
		stacksCovered: stacks.covered,
		stacksDuplicated: stacks.duplicated,
		operationsCovered: operations.covered
	};
}

export interface ScoreOptions {
	/** Load levels into a headless Blockly workspace (D5). On by default. */
	headless?: boolean;
}

/**
 * Scores a record from its stored attempts, as if they had just been made.
 * `prepared` is the program as it was sent (see `prepareProgram`).
 */
export function scoreRecord(
	record: Pick<EvalRecord, 'attempts'>,
	prepared: PreparedProgram,
	options: ScoreOptions = {}
): { metrics: Metrics; result?: ZoomResponse; plan?: EvalRecord['plan']; repairs?: string[] } {
	const detail = prepared.workspaceJson;
	const headless = options.headless ?? true;
	const judged = record.attempts.map((attempt) => judgeAttempt(attempt, detail));
	const winner = judged.findIndex((attempt) => attempt.outcome === 'ok');
	const last = judged[judged.length - 1];

	const completionTokens = record.attempts.reduce(
		(sum, a) => sum + (a.usage?.completionTokens ?? 0),
		0
	);
	const totalSeconds = record.attempts.reduce((sum, a) => sum + a.latencyMs, 0) / 1000;
	const first = record.attempts[0];
	const base: Metrics = {
		valid: winner >= 0,
		validFirstAttempt: judged[0]?.outcome === 'ok',
		attempts: record.attempts.length,
		repairs: {},
		truncated: record.attempts.some((attempt) => attempt.finishReason === 'length'),
		bindings: 0,
		completionTokens,
		...(record.attempts.some((a) => a.reasoningTokens !== undefined) && {
			reasoningTokens: record.attempts.reduce((sum, a) => sum + (a.reasoningTokens ?? 0), 0)
		}),
		...(record.attempts.some((a) => a.cost !== undefined) && {
			costUsd: record.attempts.reduce((sum, a) => sum + (a.cost ?? 0), 0)
		}),
		providers: [...new Set(record.attempts.flatMap((a) => (a.provider ? [a.provider] : [])))],
		totalSeconds,
		...(first?.usage && { promptTokens: first.usage.promptTokens }),
		...(first?.firstTokenMs !== undefined && { firstTokenSeconds: first.firstTokenMs / 1000 })
	};

	if (winner < 0) {
		const lastAttempt = record.attempts[record.attempts.length - 1];
		return {
			metrics: {
				...base,
				failure: last?.outcome,
				...(last?.message && { failureMessage: last.message }),
				...(lastAttempt && bindingMetrics(lastAttempt.rawText, detail))
			}
		};
	}

	const { result, repairs, plan } = judged[winner].parsed!;
	const repairCounts: Record<string, number> = {};
	for (const message of repairs) {
		const kind = repairKind(message);
		repairCounts[kind] = (repairCounts[kind] ?? 0) + 1;
	}
	const semantic = levelMetrics('semantic', result.semantic, detail, prepared.slug, headless);
	const concept = levelMetrics('concept', result.concept, detail, prepared.slug, headless);
	const detailBlocks = allBlocks(detail).length;
	const program: CorpusProgram = prepared.program;
	const conceptCount = concept.topLevelBlocks;
	const [min, max] = program.expectedConcepts;

	return {
		result,
		plan,
		repairs,
		metrics: {
			...base,
			attemptsToSuccess: winner + 1,
			repairs: repairCounts,
			...bindingMetricsOf(result, detail),
			...(plan && { coverage: coverage(plan, detail, result.semantic) }),
			semantic,
			concept,
			monotonic:
				detailBlocks > semantic.blocks &&
				semantic.blocks >= concept.blocks &&
				conceptCount <= semantic.topLevelBlocks,
			conceptCount,
			conceptCountInRange: conceptCount >= min && conceptCount <= max,
			...(program.composedOf !== undefined && {
				compositionRecall: conceptCount >= program.composedOf
			}),
			redundancy: jaccard(words(result.semantic), words(result.concept))
		}
	};
}
