// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/**
 * Scores a baseline results file again from the raw text it stored, with the
 * validators as they are today, and prints counts by model, prompt and size
 * tier. Makes no model call and changes no file.
 *
 *   pnpm baseline:score results/<run>.json
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { cells, isBaselineFile, rescore } from './summary.js';

const file = process.argv[2];
if (!file) {
	console.error('Usage: pnpm baseline:score <results.json>');
	process.exit(2);
}
const json: unknown = JSON.parse(readFileSync(resolve(file), 'utf8'));
if (!isBaselineFile(json)) {
	console.error(`${file} is not a baseline results file`);
	process.exit(2);
}

const scored = rescore(json);
for (const item of scored.filter((entry) => entry.problem)) {
	console.error(`not scored: ${item.record.program.id} (${item.problem})`);
}
console.table(
	cells(scored).map((cell) => ({
		model: cell.model,
		prompt: cell.prompt,
		tier: cell.tier,
		runs: cell.runs,
		valid: `${cell.valid}/${cell.runs}`,
		firstAttempt: `${cell.validFirstAttempt}/${cell.runs}`,
		attempts: cell.attempts,
		truncated: cell.truncated,
		loads: cell.loads === undefined ? '' : `${Math.round(cell.loads * 100)}%`,
		outTokens: cell.meanCompletionTokens === undefined ? '' : Math.round(cell.meanCompletionTokens),
		seconds: cell.meanSeconds === undefined ? '' : Math.round(cell.meanSeconds)
	}))
);
