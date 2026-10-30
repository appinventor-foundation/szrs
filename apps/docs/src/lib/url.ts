// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { resolve } from '$app/paths';

/**
 * The URL of a docs page, where an empty slug is the home page. The site uses
 * trailingSlash: 'always', but resolve() doesn't add the slash itself.
 */
export function pageUrl(slug: string): string {
	const url = resolve('/[...slug]', { slug });
	return url.endsWith('/') ? url : `${url}/`;
}
