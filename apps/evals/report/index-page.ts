// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/**
 * The results folder's front page: results/index.html lists every generated
 * report (newest first) with its write-up when there is one. Links are relative,
 * so the folder can be opened from disk or served from any path.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { esc } from './html.js';

export type IndexEntry = {
	/** The report's file name, e.g. 2026-11-07-baseline.html */
	file: string;
	/** The page's <title>, which says what kind of report it is. */
	title: string;
	/** The file name's leading YYYY-MM-DD, if it has one. */
	date?: string;
	/** The Markdown write-up beside it, if there is one. */
	writeUp?: string;
};

export const INDEX_FILE = 'index.html';

export function titleOf(html: string): string {
	const match = /<title>([^<]*)<\/title>/i.exec(html);
	return match ? match[1].trim().replace(/&amp;/g, '&') : '';
}

export function dateOf(file: string): string | undefined {
	return /^(\d{4}-\d{2}-\d{2})-/.exec(file)?.[1];
}

/** Reads the reports in a results folder. */
export function listReports(dir: string): IndexEntry[] {
	return readdirSync(dir)
		.filter((name) => name.endsWith('.html') && name !== INDEX_FILE)
		.map((file) => {
			const writeUp = file.replace(/\.html$/, '.md');
			return {
				file,
				title: titleOf(readFileSync(resolve(dir, file), 'utf8')),
				date: dateOf(file),
				writeUp: existsSync(resolve(dir, writeUp)) ? writeUp : undefined
			};
		});
}

/** Newest first by date, then by name. Reports without a date go last. */
export function sortEntries(entries: IndexEntry[]): IndexEntry[] {
	return [...entries].sort((a, b) => {
		if (a.date !== b.date) return (b.date ?? '').localeCompare(a.date ?? '');
		return a.file.localeCompare(b.file);
	});
}

// Links are relative and the names come from the file system, but they still go
// through esc() and encodeURI: a file name is not trusted HTML.
export function renderIndex(entries: IndexEntry[]): string {
	const items = sortEntries(entries)
		.map(
			(entry) => `<li data-testid="report">
<a href="${esc(encodeURI(entry.file))}">${esc(entry.file.replace(/\.html$/, ''))}</a>
<span class="what">${esc(entry.title)}</span>${
				entry.writeUp ? ` <a class="note" href="${esc(encodeURI(entry.writeUp))}">write-up</a>` : ''
			}
</li>`
		)
		.join('\n');
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Zoom evaluation results</title>
<style>
:root{--page:#fff;--text:#1f2328;--muted:#59636e;--link:#0550ae;--border:#d1d9e0}
@media (prefers-color-scheme: dark){:root{--page:#0d1117;--text:#e6edf3;--muted:#9198a1;--link:#79c0ff;--border:#3d444d}}
body{margin:0;padding:24px 16px;background:var(--page);color:var(--text);font:16px/1.5 system-ui,sans-serif}
main{max-width:52rem;margin:0 auto}
h1{font-size:1.5rem;margin:0 0 .25rem}
p{color:var(--muted);margin:0 0 1.5rem}
ul{list-style:none;margin:0;padding:0}
li{padding:.6rem 0;border-top:1px solid var(--border)}
a{color:var(--link)}
.what{display:block;color:var(--muted);font-size:.9rem}
.note{font-size:.9rem}
</style>
</head>
<body>
<main>
<h1>Zoom evaluation results</h1>
<p>${entries.length} report${entries.length === 1 ? '' : 's'}, newest first. Each is a self-contained page.</p>
<ul>
${items}
</ul>
</main>
</body>
</html>
`;
}
