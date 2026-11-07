// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';

import type { BaselineFile } from '../../baseline/summary.js';
import { baselineReport } from '../../report/baseline.js';
import { renderReport } from '../../report/render.js';
import { ok, run, script, validZoom } from './support/baseline-fakes.js';

describe('baseline report', () => {
	const file = async (): Promise<BaselineFile> => {
		const good = await run(script(ok(validZoom())).complete, 'v1');
		const bad = await run(script(ok('{"semantic": 1}')).complete, 'v0');
		return {
			kind: 'baseline',
			runId: 'test-run',
			aliases: ['a'],
			models: { a: { model: 'glm-test', provider: 'openrouter', vendor: 'z-ai' } },
			records: [good, bad]
		};
	};

	it('makes a report that names the model and escapes what the model wrote', async () => {
		const base = await file();
		base.records[1].attempts[0].rawText = '<script>alert(1)</script>';
		const report = baselineReport(base);
		expect(report?.rows).toHaveLength(2);
		expect(report?.rows[0]).toMatchObject({ model: 'glm-test', provider: 'openrouter', tier: 'S' });
		const html = renderReport(report!);
		expect(html).toContain('glm-test');
		expect(html).not.toContain('<script>alert(1)</script>');
	});

	it('leaves other kinds of file to their own adapters', () => {
		expect(baselineReport({ kind: 'smoke-check' })).toBeUndefined();
		expect(baselineReport({ aliases: ['a'] })).toBeUndefined();
	});
});
