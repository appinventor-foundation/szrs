// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
	dateOf,
	listReports,
	renderIndex,
	sortEntries,
	titleOf,
	type IndexEntry
} from '../../report/index-page.js';

describe('titleOf and dateOf', () => {
	it('read the title and the leading date', () => {
		expect(titleOf('<head><title> Zoom smoke check </title></head>')).toBe('Zoom smoke check');
		expect(titleOf('<p>no title</p>')).toBe('');
		expect(dateOf('2026-11-07-baseline.html')).toBe('2026-11-07');
		expect(dateOf('notes.html')).toBeUndefined();
	});
});

describe('sortEntries', () => {
	const entry = (file: string): IndexEntry => ({ file, title: '', date: dateOf(file) });

	it('puts the newest first, then by name, and undated last, without changing its input', () => {
		const input = [
			entry('2026-11-06-b.html'),
			entry('misc.html'),
			entry('2026-11-08-z.html'),
			entry('2026-11-08-a.html')
		];
		expect(sortEntries(input).map((e) => e.file)).toEqual([
			'2026-11-08-a.html',
			'2026-11-08-z.html',
			'2026-11-06-b.html',
			'misc.html'
		]);
		expect(input[0].file).toBe('2026-11-06-b.html');
	});
});

describe('renderIndex', () => {
	it('links each report, with its write-up when there is one', () => {
		const html = renderIndex([
			{
				file: '2026-11-07-baseline.html',
				title: 'Zoom baseline',
				date: '2026-11-07',
				writeUp: '2026-11-07-baseline.md'
			},
			{ file: '2026-11-06-spike.html', title: 'Spike', date: '2026-11-06' }
		]);
		expect(html).toContain('href="2026-11-07-baseline.html"');
		expect(html).toContain('href="2026-11-07-baseline.md"');
		expect(html).not.toContain('2026-11-06-spike.md');
		expect(html.indexOf('2026-11-07-baseline')).toBeLessThan(html.indexOf('2026-11-06-spike'));
		expect(html).toContain('2 reports');
	});

	it('escapes names and titles, which are not trusted', () => {
		const html = renderIndex([{ file: 'a"><script>x.html', title: '<b>t</b>' }]);
		expect(html).not.toContain('<script>x');
		expect(html).not.toContain('<b>t</b>');
	});
});

describe('listReports', () => {
	const dirs: string[] = [];
	afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true })));

	it('reads the html files, skips index.html, and finds write-ups', () => {
		const dir = mkdtempSync(join(tmpdir(), 'report-index-'));
		dirs.push(dir);
		writeFileSync(join(dir, '2026-11-07-a.html'), '<title>A report</title>');
		writeFileSync(join(dir, '2026-11-07-a.md'), '# notes');
		writeFileSync(join(dir, '2026-11-06-b.html'), '<title>B report</title>');
		writeFileSync(join(dir, 'index.html'), '<title>old index</title>');
		writeFileSync(join(dir, 'data.json'), '{}');

		const found = sortEntries(listReports(dir));

		expect(found).toEqual([
			{
				file: '2026-11-07-a.html',
				title: 'A report',
				date: '2026-11-07',
				writeUp: '2026-11-07-a.md'
			},
			{ file: '2026-11-06-b.html', title: 'B report', date: '2026-11-06', writeUp: undefined }
		]);
	});
});
