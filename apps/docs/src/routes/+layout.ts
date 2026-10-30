// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { pages } from '#lib/content.js';
import { buildNav } from '#lib/nav.js';
import type { LayoutLoad } from './$types';

export const prerender = true;
// guide/intro/index.html works on any static host, unlike guide/intro.html.
export const trailingSlash = 'always';

export const load: LayoutLoad = () => ({ nav: buildNav(pages) });
