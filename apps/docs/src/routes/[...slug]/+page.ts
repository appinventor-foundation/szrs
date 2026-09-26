// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { error } from '@sveltejs/kit';
import { findPage, pageComponent, pages } from '$lib/content';
import type { EntryGenerator, PageLoad } from './$types';

export const entries: EntryGenerator = () => pages.map(({ slug }) => ({ slug }));

export const load: PageLoad = ({ params }) => {
	const page = findPage(params.slug);
	if (!page) error(404, 'Page not found');
	return { page, content: pageComponent(page) };
};
