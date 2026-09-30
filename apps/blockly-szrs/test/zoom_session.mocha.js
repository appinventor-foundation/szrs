// Copyright 2026 appinventor.org, All rights reserved
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/**
 * @fileoverview Tests for zoom request caching and cancellation.
 */

const assert = require('assert');
const { ZoomSession } = require('../src/zoom_session');

const target = (slug = 'fizz-buzz-n') => ({ slug, workspaceJson: { blocks: {} } });
const resultFor = (slug) => ({ semantic: { slug }, concept: { slug } });

/**
 * A fake requester that records each call and leaves it pending until the
 * test resolves or rejects it. Aborting a call's signal rejects it with an
 * AbortError, as fetch does.
 */
function fakeRequester() {
	const calls = [];
	const request = (zoomTarget, init) =>
		new Promise((resolve, reject) => {
			const call = { target: zoomTarget, init, resolve, reject };
			init.signal.addEventListener('abort', () => {
				const error = new Error('aborted');
				error.name = 'AbortError';
				reject(error);
			});
			calls.push(call);
		});
	return { calls, request };
}

suite('ZoomSession', function () {
	test('requests a target once and serves it from the cache after that', async function () {
		const fake = fakeRequester();
		const session = new ZoomSession(fake.request);

		const first = session.zoom(target());
		fake.calls[0].resolve(resultFor('fizz-buzz-n'));

		assert.deepStrictEqual(await first, resultFor('fizz-buzz-n'));
		assert.deepStrictEqual(await session.zoom(target()), resultFor('fizz-buzz-n'));
		assert.strictEqual(fake.calls.length, 1);
	});

	test('requests again when the target changes', async function () {
		const fake = fakeRequester();
		const session = new ZoomSession(fake.request);

		const first = session.zoom(target('a'));
		fake.calls[0].resolve(resultFor('a'));
		await first;
		const second = session.zoom(target('b'));
		fake.calls[1].resolve(resultFor('b'));

		assert.deepStrictEqual(await second, resultFor('b'));
		assert.strictEqual(fake.calls.length, 2);
	});

	test('joins the in-flight request for the same target', async function () {
		const fake = fakeRequester();
		const session = new ZoomSession(fake.request);

		const first = session.zoom(target());
		const second = session.zoom(target());
		fake.calls[0].resolve(resultFor('fizz-buzz-n'));

		assert.strictEqual(first, second);
		await first;
		assert.strictEqual(fake.calls.length, 1);
	});

	test('aborts the in-flight request when a different target is requested', async function () {
		const fake = fakeRequester();
		const session = new ZoomSession(fake.request);

		const first = session.zoom(target('a'));
		const second = session.zoom(target('b'));
		fake.calls[1].resolve(resultFor('b'));

		await assert.rejects(first, { name: 'AbortError' });
		assert.ok(fake.calls[0].init.signal.aborted);
		assert.deepStrictEqual(await second, resultFor('b'));
	});

	test('cancel() aborts, and the aborted target is requested again next time', async function () {
		const fake = fakeRequester();
		const session = new ZoomSession(fake.request);

		const first = session.zoom(target());
		session.cancel();
		await assert.rejects(first, { name: 'AbortError' });

		const second = session.zoom(target());
		fake.calls[1].resolve(resultFor('fizz-buzz-n'));
		assert.deepStrictEqual(await second, resultFor('fizz-buzz-n'));
		assert.strictEqual(fake.calls.length, 2);
	});

	test('does not cache failures', async function () {
		const fake = fakeRequester();
		const session = new ZoomSession(fake.request);

		const first = session.zoom(target());
		fake.calls[0].reject(new Error('invalid model output'));
		await assert.rejects(first, /invalid model output/);

		const second = session.zoom(target());
		fake.calls[1].resolve(resultFor('fizz-buzz-n'));
		assert.deepStrictEqual(await second, resultFor('fizz-buzz-n'));
	});

	test('forget() drops the cached result', async function () {
		const fake = fakeRequester();
		const session = new ZoomSession(fake.request);

		const first = session.zoom(target());
		fake.calls[0].resolve(resultFor('fizz-buzz-n'));
		await first;
		session.forget();
		const second = session.zoom(target());
		fake.calls[1].resolve(resultFor('fizz-buzz-n'));
		await second;

		assert.strictEqual(fake.calls.length, 2);
	});

	test('retarget() serves the cached result for another target', async function () {
		const fake = fakeRequester();
		const session = new ZoomSession(fake.request);

		const first = session.zoom(target('before-edit'));
		fake.calls[0].resolve(resultFor('before-edit'));
		await first;
		session.retarget(target('after-edit'));

		assert.deepStrictEqual(await session.zoom(target('after-edit')), resultFor('before-edit'));
		assert.strictEqual(fake.calls.length, 1);
	});

	test('keeps a cached result for each model', async function () {
		const fake = fakeRequester();
		let model = 'local-ollama';
		const session = new ZoomSession(fake.request, undefined, () => model);

		const first = session.zoom(target());
		fake.calls[0].resolve(resultFor('ollama'));
		await first;

		model = 'gpt-4o-mini';
		const second = session.zoom(target());
		assert.strictEqual(fake.calls.length, 2);
		fake.calls[1].resolve(resultFor('gpt'));
		assert.deepStrictEqual(await second, resultFor('gpt'));

		model = 'local-ollama';
		assert.deepStrictEqual(await session.zoom(target()), resultFor('ollama'));
		assert.strictEqual(fake.calls.length, 2);
	});

	test('forwards progress events', async function () {
		const fake = fakeRequester();
		const progress = [];
		const session = new ZoomSession(fake.request, (event) => progress.push(event));

		const pending = session.zoom(target());
		fake.calls[0].init.onProgress({ type: 'attempt', attempt: 1, maxAttempts: 3 });
		fake.calls[0].resolve(resultFor('fizz-buzz-n'));
		await pending;

		assert.deepStrictEqual(progress, [{ type: 'attempt', attempt: 1, maxAttempts: 3 }]);
	});
});
