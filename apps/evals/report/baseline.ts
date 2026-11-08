// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { rescore, isBaselineFile, type BaselineFile } from '../baseline/summary.js';
import type { Metrics } from '../baseline/record.js';
import {
	BASELINE_CHART_GROUPS,
	BASELINE_METRICS,
	glossary,
	promptEffect,
	programGrid,
	standsOut
} from './baseline-insights.js';
import type { Report, ResultRow } from './rows.js';

const rate = (value: boolean | undefined): number | undefined =>
	value === undefined ? undefined : value ? 1 : 0;
const seconds = (value: number | undefined): number | undefined =>
	value === undefined ? undefined : Math.round(value * 10) / 10;

const share = (part: number, whole: number): number | undefined =>
	whole > 0 ? part / whole : undefined;

function rowMetrics(m: Metrics): ResultRow['metrics'] {
	const levels = m.semantic && m.concept ? [m.semantic, m.concept] : [];
	const { semantic: sa, concept: ca } = m.anchors ?? {};
	return {
		// 1 or 0 per run, so the bar is the rate.
		valid: rate(m.valid),
		validFirstAttempt: rate(m.validFirstAttempt),
		truncated: rate(m.truncated),
		timedOut: rate(m.failure === 'timeout'),
		attempts: m.attempts,
		repairs: Object.values(m.repairs).reduce((a, b) => a + b, 0),
		loads: levels.length > 0 ? rate(levels.every((level) => level.loads)) : undefined,
		monotonic: rate(m.monotonic),
		conceptCountInRange: rate(m.conceptCountInRange),
		stackSplit: rate(m.stackSplit),
		compositionRecall: rate(m.compositionRecall),
		conceptCount: m.conceptCount,
		semanticCompression: m.semantic && Math.round(m.semantic.compression * 100) / 100,
		conceptCompression: m.concept && Math.round(m.concept.compression * 100) / 100,
		valueLeaks:
			levels.length > 0 ? levels.reduce((sum, l) => sum + l.valueLeaks.length, 0) : undefined,
		namingProblems:
			levels.length > 0 ? levels.reduce((sum, l) => sum + l.namingProblems.length, 0) : undefined,
		redundancy: m.redundancy === undefined ? undefined : Math.round(m.redundancy * 100) / 100,
		bindingValidity: m.bindingValidity,
		// Colour anchors (D23, D24a). Only a run that has them is counted: no plan, no anchors.
		semanticAnchored: sa && share(sa.named, sa.zoomBlocks),
		semanticAnchorsResolved: sa && share(sa.resolved, sa.named),
		conceptAnchorsResolved: ca && share(ca.resolved, ca.named),
		anchorFlagged: m.anchorChecks && share(m.anchorChecks.flagged, m.anchorChecks.checked),
		planCoversStacks: m.coverage?.stacksCovered,
		promptTokens: m.promptTokens,
		completionTokens: m.completionTokens,
		reasoningTokens: m.reasoningTokens,
		costUsd: m.costUsd === undefined ? undefined : Math.round(m.costUsd * 1e6) / 1e6,
		totalSeconds: seconds(m.totalSeconds)
	};
}

/**
 * Reads the JSON that `baseline/run-baseline.ts` writes. Every record is
 * scored again from its stored text, so the page shows today's validators, not
 * the ones that ran when the models answered. Returns undefined for any other file.
 */
export function baselineReport(json: unknown): Report | undefined {
	if (!isBaselineFile(json)) return undefined;
	const scored = rescore(json);

	const rows: ResultRow[] = scored.flatMap(({ record, metrics }) => {
		if (!metrics) return [];
		const found = json.models?.[record.model.id];
		return [
			{
				model: found?.model ?? record.model.id,
				provider: found?.provider,
				vendor: found?.vendor,
				alias: record.model.sentAs,
				prompt: record.prompt.id,
				tier: record.program.tier,
				program: record.program.id,
				sample: record.sample,
				metrics: rowMetrics(metrics),
				facts: {
					outcome: metrics.valid ? 'valid' : `failed (${metrics.failure ?? 'unknown'})`,
					attempts: String(metrics.attempts),
					...(metrics.providers.length > 0 && { servedBy: metrics.providers.join(', ') })
				},
				detail: {
					plan: record.plan,
					rawText: record.attempts[record.attempts.length - 1]?.rawText,
					error: metrics.failureMessage
				}
			}
		];
	});

	const programs = new Set(json.records.map((record) => record.program.id));
	return {
		title: `Zoom baseline: ${json.runId}`,
		subtitle: [
			json.ranAt && `Run ${json.ranAt}`,
			json.code &&
				`commit ${json.code.commit}${json.code.dirty ? ' (with uncommitted changes)' : ''}`,
			`${programs.size} programs`,
			`${json.modelIds.length} model${json.modelIds.length === 1 ? '' : 's'}`,
			`${json.records.length} runs`
		]
			.filter(Boolean)
			.join(' · '),
		rows,
		sections: [
			{
				title: 'What stands out',
				description: 'The findings that can be computed from these runs, with their counts.',
				html: standsOut(json, scored)
			},
			{
				title: 'What changing the prompt did, per model',
				html: promptEffect(json, scored)
			},
			{
				title: 'By program',
				html: programGrid(json, scored)
			},
			{
				title: 'What the measures mean',
				placement: 'after',
				open: false,
				html: glossary()
			}
		],
		metrics: BASELINE_METRICS,
		chartGroups: BASELINE_CHART_GROUPS
	};
}

/**
 * Several baseline files as one, so two prompts run on different days can be
 * read in one report (the prompt-effect table compares the first prompt with the
 * second). Records keep the order of the files; a model's identity comes from the
 * first file that names it. `prompts` keeps only those prompts' records. The
 * commit is kept only when every file was made on the same one, since the report
 * says which code made the numbers; otherwise the run ids say which files were
 * combined. Nothing is written: the files are not changed.
 */
export function combineBaselines(files: BaselineFile[], prompts?: string[]): BaselineFile {
	const records = files
		.flatMap((file) => file.records)
		.filter((record) => prompts === undefined || prompts.includes(record.prompt.id));
	const models: NonNullable<BaselineFile['models']> = {};
	for (const file of files) {
		for (const [id, identity] of Object.entries(file.models ?? {})) models[id] ??= identity;
	}
	const used = new Set(records.map((record) => record.prompt.id));
	const commits = new Set(files.map((file) => file.code?.commit));
	const [first] = files;
	return {
		kind: 'baseline',
		runId: files.map((file) => file.runId).join(' + '),
		modelIds: [...new Set(files.flatMap((file) => file.modelIds))],
		models,
		prompts: files.flatMap((file) => file.prompts ?? []).filter((prompt) => used.has(prompt.id)),
		...(commits.size === 1 && first.code && { code: first.code }),
		records
	};
}
