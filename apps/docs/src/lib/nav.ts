// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { segmentsFromPath } from './markdown/slug.js';

export interface Heading {
	id: string;
	text: string;
	depth: number;
}

/** What a markdown file exports as `metadata`: its frontmatter plus what rehype-docs adds. */
export interface PageMeta {
	title?: string;
	order?: number;
	headings?: Heading[];
}

export interface Page {
	/** Path of the source file, as given by import.meta.glob. */
	path: string;
	/** URL path without slashes at either end, empty for the home page. */
	slug: string;
	segments: string[];
	title: string;
	order: number;
	headings: Heading[];
}

export interface NavNode {
	title: string;
	/** Slug of the page this node links to, null for a folder that has no index.md. */
	slug: string | null;
	order: number;
	children: NavNode[];
}

/** Route params carry the trailing slash of the URL: 'guide/' becomes 'guide'. */
export function normalizeSlug(slug: string): string {
	return slug.replace(/\/+$/, '');
}

/** 'getting-started' becomes 'Getting started'. */
export function humanize(segment: string): string {
	const text = segment.replace(/[-_]+/g, ' ').trim();
	return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * @param metas frontmatter and headings of every markdown file, keyed by path
 * @param contentRoot the part of each key that comes before the path inside the content folder
 */
export function buildPages(
	metas: Record<string, PageMeta | undefined>,
	contentRoot = '/content/'
): Page[] {
	const bySlug = new Map<string, Page>();
	for (const [path, meta] of Object.entries(metas)) {
		const segments = segmentsFromPath(path.slice(contentRoot.length));
		const slug = segments.join('/');
		const existing = bySlug.get(slug);
		if (existing) {
			throw new Error(`${existing.path} and ${path} both produce the URL /${slug}`);
		}
		bySlug.set(slug, {
			path,
			slug,
			segments,
			title: meta?.title ?? humanize(segments.at(-1) ?? 'home'),
			order: meta?.order ?? Infinity,
			headings: meta?.headings ?? []
		});
	}
	return [...bySlug.values()];
}

function compare(a: NavNode, b: NavNode): number {
	if (a.order !== b.order) return a.order < b.order ? -1 : 1;
	return a.title.localeCompare(b.title);
}

function sortTree(node: NavNode): NavNode {
	node.children.sort(compare).forEach(sortTree);
	return node;
}

/**
 * Builds the sidebar tree: folders become nodes with children, and the folder's index.md,
 * if there is one, is the page of that node. The root node stands for the home page.
 */
export function buildNav(pages: Page[]): NavNode {
	const root: NavNode = { title: 'Home', slug: null, order: 0, children: [] };
	const nodes = new Map<string, NavNode>([['', root]]);

	const nodeFor = (segments: string[]): NavNode => {
		const key = segments.join('/');
		let node = nodes.get(key);
		if (!node) {
			const title = humanize(segments[segments.length - 1]);
			node = { title, slug: null, order: Infinity, children: [] };
			nodes.set(key, node);
			nodeFor(segments.slice(0, -1)).children.push(node);
		}
		return node;
	};

	for (const page of pages) {
		const node = nodeFor(page.segments);
		node.slug = page.slug;
		node.title = page.title;
		node.order = page.order;
	}
	return sortTree(root);
}
