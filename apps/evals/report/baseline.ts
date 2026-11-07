// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { rescore, isBaselineFile, type BaselineFile } from '../baseline/summary.js';
import { findProgram } from '../baseline/corpus/index.js';
import type { Metrics } from '../baseline/record.js';
import { esc } from './html.js';
import { modelVia, type Report, type ResultRow } from './rows.js';

const rate = (value: boolean | undefined): number | undefined =>
	value === undefined ? undefined : value ? 1 : 0;
const seconds = (value: number | undefined): number | undefined =>
	value === undefined ? undefined : Math.round(value * 10) / 10;

function rowMetrics(m: Metrics): ResultRow['metrics'] {
	const levels = m.semantic && m.concept ? [m.semantic, m.concept] : [];
	return {
		// 1 or 0 per run, so the bar is the rate.
		valid: rate(m.valid),
		validFirstAttempt: rate(m.validFirstAttempt),
		truncated: rate(m.truncated),
		attempts: m.attempts,
		repairs: Object.values(m.repairs).reduce((a, b) => a + b, 0),
		loads: levels.length > 0 ? rate(levels.every((level) => level.loads)) : undefined,
		monotonic: rate(m.monotonic),
		conceptCountInRange: rate(m.conceptCountInRange),
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
		planCoversStacks: m.coverage?.stacksCovered,
		promptTokens: m.promptTokens,
		completionTokens: m.completionTokens,
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
		const found = json.models?.[record.model.alias];
		return [
			{
				model: found?.model ?? record.model.alias,
				provider: found?.provider,
				vendor: found?.vendor,
				alias: record.model.alias,
				prompt: record.prompt.id,
				tier: record.program.tier,
				program: record.program.id,
				sample: record.sample,
				metrics: rowMetrics(metrics),
				facts: {
					outcome: metrics.valid ? 'valid' : `failed (${metrics.failure ?? 'unknown'})`,
					attempts: String(metrics.attempts)
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
			`${programs.size} programs`,
			`${json.aliases.length} model${json.aliases.length === 1 ? '' : 's'}`,
			`${json.records.length} runs`
		]
			.filter(Boolean)
			.join(' · '),
		rows,
		sections: [
			{
				title: 'By program',
				description:
					'One row per program; a cell per model and prompt. The concept count is next to the author’s provisional expectation (not a golden annotation).',
				html: programTable(json, scored)
			},
			{
				title: 'How to read this',
				html: '<p>Bars average over the runs behind them. Validity, loadability and the like are 1 or 0 per run, so a bar is a rate. Every metric is scored again from the stored model text each time this page is made, with the validators as they are now.</p>'
			}
		]
	};
}

function programTable(file: BaselineFile, scored: ReturnType<typeof rescore>): string {
	const columns = [
		...new Set(scored.map((s) => `${s.record.model.alias}\u0000${s.record.prompt.id}`))
	];
	const programIds = [...new Set(scored.map((s) => s.record.program.id))];
	const head = columns
		.map((column) => {
			const [alias, prompt] = column.split('\u0000');
			const found = file.models?.[alias];
			const who = {
				model: found?.model ?? alias,
				provider: found?.provider,
				vendor: found?.vendor
			};
			const via = modelVia(who);
			return `<th scope="col">${esc(who.model)} ${esc(prompt)}${via ? `<span class="via-line">${esc(via)}</span>` : ''}</th>`;
		})
		.join('');
	const body = programIds
		.map((id) => {
			const program = findProgramSafe(id);
			const cells = columns
				.map((column) => {
					const [alias, prompt] = column.split('\u0000');
					const runs = scored.filter(
						(s) =>
							s.record.program.id === id &&
							s.record.model.alias === alias &&
							s.record.prompt.id === prompt
					);
					if (runs.length === 0) return '<td>—</td>';
					const parts = runs.map((run) => {
						const m = run.metrics;
						if (!m) return `<span class="bad-text">✕ not scored</span>`;
						if (!m.valid) return `<span class="bad-text">✕ ${esc(m.failure ?? 'failed')}</span>`;
						const loads =
							m.semantic?.loads === false || m.concept?.loads === false ? ' (does not load)' : '';
						return `<span>✓ ${esc(String(m.conceptCount))} concept${m.conceptCount === 1 ? '' : 's'}${esc(loads)}</span>`;
					});
					return `<td>${parts.join('<br>')}</td>`;
				})
				.join('');
			const expected = program
				? `${program.expectedConcepts[0]}–${program.expectedConcepts[1]}`
				: '?';
			return `<tr><th scope="row">${esc(program?.title ?? id)}<span class="via-line">${program ? `${esc(program.tier)}, ${program.blocks} blocks, expected ${esc(expected)}` : ''}</span></th>${cells}</tr>`;
		})
		.join('');
	return `<div class="table-wrap"><table class="wide"><thead><tr><th scope="col">Program</th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function findProgramSafe(id: string) {
	try {
		return findProgram(id);
	} catch {
		return undefined;
	}
}
