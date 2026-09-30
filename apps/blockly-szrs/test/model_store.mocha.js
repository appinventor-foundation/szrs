// Copyright 2026 appinventor.org, All rights reserved
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/**
 * @fileoverview Tests for the zoom model store.
 */

const assert = require('assert');
const { ModelStore } = require('../src/model_store');

function fakeStorage(initial = {}) {
	const items = { ...initial };
	return {
		items,
		getItem: (key) => items[key] ?? null,
		setItem: (key, value) => {
			items[key] = value;
		}
	};
}

suite('ModelStore', function () {
	test('starts with the host-configured model', function () {
		const store = new ModelStore('openrouter', fakeStorage());

		assert.strictEqual(store.current, 'openrouter');
		assert.deepStrictEqual([...store.models], ['openrouter']);
	});

	test('remembers a selection and restores it when the list arrives', function () {
		const storage = fakeStorage();
		const first = new ModelStore('openrouter', storage);
		first.setModels(['openrouter', 'gpt-4o-mini']);
		first.select('gpt-4o-mini');

		const second = new ModelStore('openrouter', storage);
		assert.strictEqual(second.current, 'openrouter');
		second.setModels(['openrouter', 'gpt-4o-mini']);

		assert.strictEqual(second.current, 'gpt-4o-mini');
	});

	test('ignores a remembered model the proxy no longer offers', function () {
		const store = new ModelStore('openrouter', fakeStorage({ 'szrs.zoomModel': 'retired' }));

		store.setModels(['openrouter', 'gpt-4o-mini']);

		assert.strictEqual(store.current, 'openrouter');
	});

	test('keeps a model picked before the list arrived', function () {
		const store = new ModelStore('openrouter', null);

		store.select('gpt-4o-mini');
		store.setModels(['openrouter', 'gpt-4o-mini']);

		assert.strictEqual(store.current, 'gpt-4o-mini');
	});

	test('keeps the default list when the proxy offers no models', function () {
		const store = new ModelStore('openrouter', fakeStorage());

		store.setModels([]);

		assert.deepStrictEqual([...store.models], ['openrouter']);
	});

	test('notifies listeners of changes until they unsubscribe', function () {
		const store = new ModelStore('openrouter', fakeStorage());
		let count = 0;
		const stop = store.onChange(() => count++);

		store.setModels(['openrouter', 'gpt-4o-mini']);
		store.select('gpt-4o-mini');
		store.select('gpt-4o-mini');
		stop();
		store.select('openrouter');

		assert.strictEqual(count, 2);
	});

	test('works when storage throws or is missing', function () {
		const broken = {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			}
		};

		for (const storage of [broken, null]) {
			const store = new ModelStore('openrouter', storage);
			store.setModels(['openrouter', 'gpt-4o-mini']);
			store.select('gpt-4o-mini');

			assert.strictEqual(store.current, 'gpt-4o-mini');
		}
	});
});
