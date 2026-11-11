// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError } from '../errors.js';
import { createEvalsFiles } from './evals-files.js';

let outer: string;
let root: string;

beforeEach(() => {
	outer = mkdtempSync(join(tmpdir(), 'evals-files-'));
	root = join(outer, 'results');
	mkdirSync(join(root, 'shots'), { recursive: true });
	writeFileSync(join(root, 'report.html'), '<p>hi</p>');
	writeFileSync(join(root, 'notes.md'), '# notes');
	writeFileSync(join(root, 'data.json'), '{}');
	writeFileSync(join(root, '.hidden.html'), 'x');
	writeFileSync(join(root, 'shots', 'a.png'), 'png');
	writeFileSync(join(outer, 'secret.html'), 'secret');
});
afterEach(() => rmSync(outer, { recursive: true }));

describe('createEvalsFiles', () => {
	it('serves a report, a picture in a folder and a write-up with their types', async () => {
		const files = createEvalsFiles(root);

		const report = await files.read('report.html');
		expect(report.contentType).toBe('text/html; charset=utf-8');
		expect(report.body.toString()).toBe('<p>hi</p>');
		expect((await files.read('shots/a.png')).contentType).toBe('image/png');
		expect((await files.read('notes.md')).contentType).toBe('text/plain; charset=utf-8');
	});

	it('does not serve other kinds of file, dot-files or missing ones', async () => {
		const files = createEvalsFiles(root);

		for (const path of ['data.json', '.hidden.html', 'missing.html', 'shots', 'shots/', '']) {
			await expect(files.read(path)).rejects.toBeInstanceOf(NotFoundError);
		}
	});

	it('does not leave the folder', async () => {
		const files = createEvalsFiles(root);

		for (const path of [
			'../secret.html',
			'shots/../../secret.html',
			'..%2Fsecret.html',
			'..\\secret.html'
		]) {
			await expect(files.read(path)).rejects.toBeInstanceOf(NotFoundError);
		}
	});

	it('does not follow a link out of the folder', async () => {
		symlinkSync(join(outer, 'secret.html'), join(root, 'link.html'));

		await expect(createEvalsFiles(root).read('link.html')).rejects.toBeInstanceOf(NotFoundError);
	});

	it('treats a missing results folder as not found', async () => {
		await expect(createEvalsFiles(join(outer, 'nope')).read('report.html')).rejects.toBeInstanceOf(
			NotFoundError
		);
	});
});
