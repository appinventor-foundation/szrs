// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import type { Component } from 'svelte';
import { buildPages, normalizeSlug, type Page, type PageMeta } from './nav';

interface MarkdownModule {
	default: Component;
	metadata?: PageMeta;
}

// Every markdown file under content/ is a page. The glob is what makes a new file show up.
const modules = import.meta.glob<MarkdownModule>('/content/**/*.md', { eager: true });

export const pages: Page[] = buildPages(
	Object.fromEntries(Object.entries(modules).map(([path, module]) => [path, module.metadata]))
);

export function findPage(slug: string): Page | undefined {
	const wanted = normalizeSlug(slug);
	return pages.find((page) => page.slug === wanted);
}

export function pageComponent(page: Page): Component {
	return modules[page.path].default;
}
