// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { checkResume, mergeHeader, type RunHeader } from '../../baseline/resume.js';
import { freshPath } from '../../results-path.js';

const made: string[] = [];
afterEach(() => {
	for (const directory of made.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('freshPath', () => {
	it('uses the name when nothing is there', () => {
		const directory = mkdtempSync(join(tmpdir(), 'evals-'));
		made.push(directory);
		expect(freshPath(directory, '2026-11-07-spike', '.json')).toBe(
			resolve(directory, '2026-11-07-spike.json')
		);
	});

	it('never returns a path that exists: a second run on the day is -2, a third -3', () => {
		const directory = mkdtempSync(join(tmpdir(), 'evals-'));
		made.push(directory);
		writeFileSync(join(directory, 'run.json'), 'first');
		expect(freshPath(directory, 'run', '.json')).toBe(resolve(directory, 'run-2.json'));
		writeFileSync(join(directory, 'run-2.json'), 'second');
		expect(freshPath(directory, 'run', '.json')).toBe(resolve(directory, 'run-3.json'));
		expect(freshPath(directory, 'other', '.json')).toBe(resolve(directory, 'other.json'));
	});
});

const header = (over: Partial<RunHeader> = {}): RunHeader => ({
	kind: 'baseline',
	runId: 'r',
	ranAt: '2026-11-07T10:00:00.000Z',
	code: { commit: 'aaa1111', dirty: false },
	modelIds: ['a'],
	models: { a: { model: 'a', sentAs: 'openrouter/x/a' } },
	prompts: [{ id: 'v1', fingerprint: 'f1', params: {} }],
	samples: 1,
	...over
});

describe('resuming a run', () => {
	it('may continue on the same commit, or when either side does not know its commit', () => {
		expect(() => checkResume(header(), { commit: 'aaa1111' })).not.toThrow();
		expect(() => checkResume(header({ code: undefined }), { commit: 'bbb2222' })).not.toThrow();
		expect(() => checkResume(header(), undefined)).not.toThrow();
	});

	it('refuses to continue on other code, and says which commit to use', () => {
		expect(() => checkResume(header(), { commit: 'bbb2222' })).toThrow(/aaa1111.*bbb2222/);
		expect(() => checkResume(header(), { commit: 'bbb2222' })).toThrow(/new run/);
	});

	it('adds this invocation’s models and prompts to the header, so it describes every record', () => {
		const merged = mergeHeader(
			header(),
			header({
				ranAt: '2026-11-07T12:00:00.000Z',
				code: { commit: 'aaa1111', dirty: true },
				modelIds: ['b'],
				models: { b: { model: 'b', sentAs: 'openrouter/x/b' } },
				prompts: [
					{ id: 'v1', fingerprint: 'f1', params: {} },
					{ id: 'v0', fingerprint: 'f0', params: {} }
				],
				samples: 3
			})
		);
		expect(merged.modelIds).toEqual(['a', 'b']);
		expect(Object.keys(merged.models ?? {})).toEqual(['a', 'b']);
		expect(merged.prompts?.map((prompt) => prompt.id)).toEqual(['v1', 'v0']);
		expect(merged.samples).toBe(3);
		// The run started at the first time, on the first commit's state; the resume is noted.
		expect(merged.ranAt).toBe('2026-11-07T10:00:00.000Z');
		expect(merged.resumedAt).toEqual(['2026-11-07T12:00:00.000Z']);
		expect(merged.code).toEqual({ commit: 'aaa1111', dirty: false });
	});

	it('refuses a prompt that changed since the run started', () => {
		expect(() =>
			mergeHeader(header(), header({ prompts: [{ id: 'v1', fingerprint: 'CHANGED', params: {} }] }))
		).toThrow(/Prompt v1 has changed/);
	});
});
