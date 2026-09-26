// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';
import { buildNav, buildPages, humanize, normalizeSlug } from './nav';

describe('humanize', () => {
	it('makes a readable title from a file name', () => {
		expect(humanize('getting-started')).toBe('Getting started');
		expect(humanize('api_reference')).toBe('Api reference');
	});
});

describe('normalizeSlug', () => {
	it('drops trailing slashes', () => {
		expect(normalizeSlug('guide/')).toBe('guide');
		expect(normalizeSlug('')).toBe('');
	});
});

describe('buildPages', () => {
	it('derives slug, title and order from the path and metadata', () => {
		const pages = buildPages({
			'/content/index.md': { title: 'Home page', headings: [] },
			'/content/guide/index.md': undefined,
			'/content/guide/getting-started.md': { order: 2 }
		});

		expect(pages.map(({ slug, title, order }) => ({ slug, title, order }))).toEqual([
			{ slug: '', title: 'Home page', order: Infinity },
			{ slug: 'guide', title: 'Guide', order: Infinity },
			{ slug: 'guide/getting-started', title: 'Getting started', order: 2 }
		]);
	});

	it('rejects two files that produce the same url', () => {
		expect(() => buildPages({ '/content/guide.md': {}, '/content/guide/index.md': {} })).toThrow(
			'/content/guide.md and /content/guide/index.md both produce the URL /guide'
		);
	});
});

describe('buildNav', () => {
	const nav = (metas: Parameters<typeof buildPages>[0]) => buildNav(buildPages(metas));

	it('turns folders into sections, with their index page as the section page', () => {
		const root = nav({
			'/content/index.md': { title: 'Welcome' },
			'/content/guide/index.md': { title: 'The guide' },
			'/content/guide/intro.md': {}
		});

		expect(root).toMatchObject({ title: 'Welcome', slug: '' });
		expect(root.children).toHaveLength(1);
		expect(root.children[0]).toMatchObject({ title: 'The guide', slug: 'guide' });
		expect(root.children[0].children).toMatchObject([{ title: 'Intro', slug: 'guide/intro' }]);
	});

	it('creates a section without a page for a folder that has no index', () => {
		const root = nav({ '/content/api/events.md': {} });

		expect(root.slug).toBeNull();
		expect(root.children).toMatchObject([
			{ title: 'Api', slug: null, children: [{ title: 'Events', slug: 'api/events' }] }
		]);
	});

	it('sorts by order, then by title', () => {
		const root = nav({
			'/content/b.md': {},
			'/content/a.md': {},
			'/content/z.md': { order: 1 },
			'/content/y.md': { order: 2 }
		});

		expect(root.children.map((c) => c.title)).toEqual(['Z', 'Y', 'A', 'B']);
	});
});
