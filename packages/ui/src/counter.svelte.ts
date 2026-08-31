// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import type { Counter } from './types';

/**
 * An example store based on the svelte tutorial for custom stores:
 * https://svelte.dev/blog/runes#Beyond-components
 */
export function newCounter(): Counter {
	let _count = $state(0);
	return {
		get count() {
			return _count;
		},
		decrement() {
			_count -= 1;
		},
		increment() {
			_count += 1;
		}
	};
}
