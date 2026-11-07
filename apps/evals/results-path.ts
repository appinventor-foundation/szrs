// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * A path for a new results file that nothing is at yet: `<name><extension>`, or
 * `<name>-2<extension>`, `<name>-3<extension>` and so on. A result is never
 * overwritten: a second run on the same day is a new file.
 */
export function freshPath(
	directory: string,
	name: string,
	extension: string,
	exists: (path: string) => boolean = existsSync
): string {
	let path = resolve(directory, `${name}${extension}`);
	for (let n = 2; exists(path); n++) path = resolve(directory, `${name}-${n}${extension}`);
	return path;
}
