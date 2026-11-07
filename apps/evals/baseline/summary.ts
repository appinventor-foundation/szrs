// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { findProgram } from './corpus/index.js';
import type { Metrics, EvalRecord } from './record.js';
import { scoreRecord } from './metrics.js';
import { prepareProgram } from './prepare.js';

/** The file `run-baseline.ts` writes. */
export interface BaselineFile {
	kind: 'baseline';
	runId: string;
	ranAt?: string;
	aliases: string[];
	models?: Record<string, { model: string; provider?: string; vendor?: string }>;
	prompts?: { id: string; fingerprint: string; params: unknown }[];
	records: EvalRecord[];
}

export function isBaselineFile(json: unknown): json is BaselineFile {
	return (
		typeof json === 'object' &&
		json !== null &&
		(json as { kind?: unknown }).kind === 'baseline' &&
		Array.isArray((json as { records?: unknown }).records)
	);
}

/**
 * Every record scored again from its stored attempts, with today's validators.
 * Prepared programs are made once each. A record of a program the corpus no
 * longer has, or has changed, is returned unscored with a reason.
 */
export function rescore(
	file: BaselineFile
): { record: EvalRecord; metrics?: Metrics; problem?: string }[] {
	const prepared = new Map<string, ReturnType<typeof prepareProgram>>();
	return file.records.map((record) => {
		try {
			const program = findProgram(record.program.id);
			let entry = prepared.get(program.id);
			if (!entry) {
				entry = prepareProgram(program);
				prepared.set(program.id, entry);
			}
			return { record, metrics: scoreRecord(record, entry).metrics };
		} catch (error) {
			return { record, problem: String(error instanceof Error ? error.message : error) };
		}
	});
}

const mean = (values: number[]): number | undefined =>
	values.length === 0 ? undefined : values.reduce((a, b) => a + b, 0) / values.length;

export interface Cell {
	model: string;
	prompt: string;
	tier: string;
	runs: number;
	valid: number;
	validFirstAttempt: number;
	attempts: number;
	truncated: number;
	loads?: number;
	meanCompletionTokens?: number;
	meanSeconds?: number;
}

/** Counts by model, prompt and size tier, for a table printed to the terminal. */
export function cells(scored: ReturnType<typeof rescore>): Cell[] {
	const groups = new Map<string, typeof scored>();
	for (const item of scored) {
		if (!item.metrics) continue;
		const key = [item.record.model.alias, item.record.prompt.id, item.record.program.tier].join(
			'|'
		);
		groups.set(key, [...(groups.get(key) ?? []), item]);
	}
	return [...groups.entries()].map(([key, items]) => {
		const [model, prompt, tier] = key.split('|');
		const metrics = items.map((item) => item.metrics!);
		const levels = metrics.flatMap((m) => (m.semantic && m.concept ? [m.semantic, m.concept] : []));
		return {
			model,
			prompt,
			tier,
			runs: items.length,
			valid: metrics.filter((m) => m.valid).length,
			validFirstAttempt: metrics.filter((m) => m.validFirstAttempt).length,
			attempts: metrics.reduce((sum, m) => sum + m.attempts, 0),
			truncated: metrics.filter((m) => m.truncated).length,
			...(levels.length > 0 && {
				loads: levels.filter((level) => level.loads).length / levels.length
			}),
			meanCompletionTokens: mean(metrics.map((m) => m.completionTokens)),
			meanSeconds: mean(metrics.map((m) => m.totalSeconds))
		};
	});
}
