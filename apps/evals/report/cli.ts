// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/**
 * Turns results JSON into a self-contained HTML report beside each file:
 *
 *   pnpm report                      every results/*.json
 *   pnpm report path/to/results.json one file
 *
 * The HTML is generated, so it is not committed (see .gitignore).
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { baselineReport } from './baseline.js';
import { renderReport } from './render.js';
import type { Report } from './rows.js';
import { smokeReport } from './smoke.js';
import { spikeReport } from './spike.js';

// One adapter per kind of result: it returns a Report, or undefined for a file
// that is not its kind. The baseline's adapter reads baseline/ records.
const ADAPTERS: ((json: unknown) => Report | undefined)[] = [
	spikeReport,
	smokeReport,
	baselineReport
];

const resultsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'results');
const requested = process.argv.slice(2);
const files =
	requested.length > 0
		? requested.map((file) => resolve(file))
		: readdirSync(resultsDir)
				.filter((name) => name.endsWith('.json'))
				.map((name) => resolve(resultsDir, name));

let failed = false;
for (const file of files) {
	const json: unknown = JSON.parse(readFileSync(file, 'utf8'));
	const report = ADAPTERS.map((adapt) => adapt(json)).find((found) => found !== undefined);
	if (!report) {
		console.error(`${file}: not a results file this viewer knows (add an adapter in report)`);
		failed = true;
		continue;
	}
	const out = file.replace(/\.json$/, '.html');
	writeFileSync(out, renderReport(report));
	console.log(`written ${out}`);
}
process.exit(failed ? 1 : 0);
