// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { NotFoundError } from '../errors.js';

// Serves the evaluation results (apps/evals/results): the generated HTML
// reports, their pictures and the Markdown write-ups. Only these kinds of file
// are ever served, and only from inside the results folder.
const TYPES: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.md': 'text/plain; charset=utf-8'
};

export type EvalsFile = { body: Buffer; contentType: string };

export interface EvalsFiles {
	// `path` is what follows the route, e.g. "2026-11-07-baseline.html" or
	// "2026-11-07-baseline-screenshots/fizzbuzz__detail.png".
	read(path: string): Promise<EvalsFile>;
}

export function createEvalsFiles(root: string): EvalsFiles {
	return {
		async read(path) {
			const contentType = TYPES[extname(path).toLowerCase()];
			const segments = path.split('/');
			// No dot-files, no "..", no empty parts, no odd characters.
			const unsafe = segments.some(
				(part) => part === '' || part.startsWith('.') || /[\\\0]/.test(part)
			);
			if (!contentType || unsafe) throw new NotFoundError('Results file', path);

			try {
				const base = await realpath(resolve(root));
				// realpath also follows symlinks, so a link pointing outside is refused.
				const file = await realpath(resolve(base, ...segments));
				if (!file.startsWith(base + sep)) throw new NotFoundError('Results file', path);
				return { body: await readFile(file), contentType };
			} catch (error) {
				if (error instanceof NotFoundError) throw error;
				throw new NotFoundError('Results file', path);
			}
		}
	};
}
