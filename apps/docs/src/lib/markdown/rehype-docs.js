// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { posix, relative, sep } from 'node:path';
import { segmentsFromPath } from './slug.js';

/** @typedef {{ id: string, text: string, depth: number }} Heading */

const HEADING = /^h[1-6]$/;
const EXTERNAL_OR_ABSOLUTE = /^([a-z][a-z0-9+.-]*:|\/|#)/i;

/** @param {any} node */
function textOf(node) {
	if (node.type === 'text') return node.value;
	return (node.children ?? []).map(textOf).join('');
}

/** @param {string} text */
function slugify(text) {
	return text
		.toLowerCase()
		.trim()
		.replace(/[^\p{L}\p{N}\s-]/gu, '')
		.replace(/\s+/g, '-');
}

/**
 * Rewrites a relative link to another markdown file (`../guide/intro.md#setup`) into the URL
 * of the page it produces. Returns undefined when the link is not one of those.
 *
 * @param {string} href
 * @param {string} currentFile posix path of the current file, relative to the content folder
 * @param {string} base
 */
function rewriteMarkdownLink(href, currentFile, base) {
	if (EXTERNAL_OR_ABSOLUTE.test(href)) return undefined;
	const [, path, suffix = ''] = href.match(/^([^#?]*)([?#].*)?$/) ?? [];
	if (!path?.endsWith('.md')) return undefined;
	const target = posix.join(posix.dirname(currentFile), path);
	if (target.startsWith('..')) return undefined;
	const segments = segmentsFromPath(target);
	return `${base}/${segments.join('/')}${segments.length ? '/' : ''}${suffix}`;
}

/**
 * mdsvex rehype plugin for the docs site. It
 * - gives headings an id, so they can be linked to,
 * - exports `headings` (h2 and h3, for the table of contents) and a fallback `title` from the
 *   first h1 in the page's metadata,
 * - rewrites relative links between markdown files, so they work on GitHub and on the site.
 *
 * @param {{ contentDir: string, base?: string }} options
 */
export function rehypeDocs({ contentDir, base = '' }) {
	/**
	 * @param {any} tree
	 * @param {any} file
	 */
	return (tree, file) => {
		const filename = file.filename ?? file.path;
		const currentFile = filename && relative(contentDir, filename).split(sep).join('/');
		/** @type {Heading[]} */
		const headings = [];
		const usedIds = new Map();
		let title;

		/** @param {any} node */
		const walk = (node) => {
			if (node.type === 'element') {
				if (HEADING.test(node.tagName)) {
					const depth = Number(node.tagName[1]);
					const text = textOf(node);
					const slug = slugify(text) || 'section';
					const count = usedIds.get(slug) ?? 0;
					usedIds.set(slug, count + 1);
					const id = count ? `${slug}-${count}` : slug;
					node.properties = { ...node.properties, id };
					if (depth === 1) title ??= text;
					else if (depth <= 3) headings.push({ id, text, depth });
				} else if (
					node.tagName === 'a' &&
					currentFile &&
					typeof node.properties?.href === 'string'
				) {
					const href = rewriteMarkdownLink(node.properties.href, currentFile, base);
					if (href !== undefined) node.properties.href = href;
				}
			}
			node.children?.forEach(walk);
		};
		walk(tree);

		const frontmatter = file.data.fm ?? {};
		file.data.fm = { ...(title ? { title } : {}), ...frontmatter, headings };
	};
}
