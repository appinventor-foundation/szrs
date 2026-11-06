// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

export function toSnakeSlug(slug: string): string {
	return slug
		.toLowerCase()
		.replace(/-/g, '_')
		.replace(/[^a-z0-9_]/g, '_');
}
