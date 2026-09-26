// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';
import { rehypeDocs } from './rehype-docs.js';
import { segmentsFromPath } from './slug.js';

const contentDir = '/site/content';

interface TestNode {
	type: string;
	tagName?: string;
	properties?: Record<string, unknown>;
	children?: TestNode[];
}
interface Frontmatter {
	title?: string;
	headings: { id: string; text: string; depth: number }[];
}

const text = (value: string): TestNode => ({ type: 'text', value }) as TestNode;
const el = (
	tagName: string,
	properties: Record<string, unknown>,
	...children: TestNode[]
): TestNode => ({
	type: 'element',
	tagName,
	properties,
	children
});

function run(
	children: TestNode[],
	file: Record<string, unknown> = {},
	options: { base?: string } = {}
) {
	const tree = { type: 'root', children };
	const vfile = {
		filename: `${contentDir}/guide/intro.md`,
		data: {} as { fm?: Frontmatter },
		...file
	};
	rehypeDocs({ contentDir, ...options })(tree, vfile);
	return { tree, fm: vfile.data.fm as Frontmatter };
}

describe('segmentsFromPath', () => {
	it('drops the extension and a trailing index', () => {
		expect(segmentsFromPath('guide/intro.md')).toEqual(['guide', 'intro']);
		expect(segmentsFromPath('guide/index.md')).toEqual(['guide']);
		expect(segmentsFromPath('index.md')).toEqual([]);
	});
});

describe('rehypeDocs headings', () => {
	it('gives headings ids and lists h2 and h3 as the table of contents', () => {
		const { tree, fm } = run([
			el('h1', {}, text('Intro')),
			el('h2', {}, text('Getting Started!')),
			el('h3', {}, text('Install '), el('code', {}, text('pnpm'))),
			el('h4', {}, text('Too deep'))
		]);

		expect(tree.children.map((c) => c.properties?.id)).toEqual([
			'intro',
			'getting-started',
			'install-pnpm',
			'too-deep'
		]);
		expect(fm.headings).toEqual([
			{ id: 'getting-started', text: 'Getting Started!', depth: 2 },
			{ id: 'install-pnpm', text: 'Install pnpm', depth: 3 }
		]);
	});

	it('keeps ids unique', () => {
		const { fm } = run([el('h2', {}, text('Setup')), el('h2', {}, text('Setup'))]);

		expect(fm.headings.map((h) => h.id)).toEqual(['setup', 'setup-1']);
	});

	it('uses the first h1 as the title unless the frontmatter has one', () => {
		expect(run([el('h1', {}, text('From heading'))]).fm.title).toBe('From heading');

		const { fm } = run([el('h1', {}, text('From heading'))], {
			data: { fm: { title: 'From frontmatter', order: 2 } }
		});
		expect(fm).toMatchObject({ title: 'From frontmatter', order: 2 });
	});

	it('exports metadata for pages without frontmatter or headings', () => {
		expect(run([]).fm).toEqual({ headings: [] });
	});
});

describe('rehypeDocs links', () => {
	const link = (href: string, options?: { base?: string }) =>
		run([el('a', { href }, text('x'))], {}, options).tree.children?.[0].properties?.href;

	it('rewrites relative links to markdown files into page urls', () => {
		expect(link('./other.md')).toBe('/guide/other/');
		expect(link('../index.md')).toBe('/');
		expect(link('../api/index.md#setup')).toBe('/api/#setup');
		expect(link('sub/page.md?x=1')).toBe('/guide/sub/page/?x=1');
	});

	it('prefixes the base path', () => {
		expect(link('./other.md', { base: '/szrs' })).toBe('/szrs/guide/other/');
		expect(link('../index.md', { base: '/szrs' })).toBe('/szrs/');
	});

	it('leaves other links alone', () => {
		for (const href of [
			'https://example.com/a.md',
			'/abs/a.md',
			'#top',
			'./image.png',
			'../../../outside.md'
		]) {
			expect(link(href)).toBe(href);
		}
	});
});
