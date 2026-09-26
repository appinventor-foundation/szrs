// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/**
 * Turns a markdown file path relative to the content folder into URL segments.
 * `guide/intro.md` becomes `['guide', 'intro']`, and `guide/index.md` becomes `['guide']`.
 * The top level `index.md` becomes `[]`, the home page.
 *
 * @param {string} relativePath posix path relative to the content folder
 * @returns {string[]}
 */
export function segmentsFromPath(relativePath) {
	const segments = relativePath.replace(/\.md$/, '').split('/');
	if (segments[segments.length - 1] === 'index') segments.pop();
	return segments;
}
