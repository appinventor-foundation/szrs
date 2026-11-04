// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';
import { NotFoundError } from '#lib/server/errors.js';
import { fakeDemoRepository } from '#lib/server/test-support/fake-demo-repository.js';
import { createDemoService } from './demos.js';

describe('demo service', () => {
	it('creates a demo and lists it newest first', async () => {
		const service = createDemoService(fakeDemoRepository());
		await service.create({ title: 'first' });
		await service.create({ title: 'second' });

		const titles = (await service.list()).map((demo) => demo.title);

		expect(titles).toEqual(['second', 'first']);
	});

	it('gets a demo by id', async () => {
		const service = createDemoService(fakeDemoRepository());
		const created = await service.create({ title: 'one', description: 'text' });

		expect(await service.get(created.id)).toEqual(created);
	});

	it('updates a demo', async () => {
		const service = createDemoService(fakeDemoRepository());
		const created = await service.create({ title: 'old' });

		const updated = await service.update(created.id, { title: 'new', description: null });

		expect(updated.title).toBe('new');
	});

	it('has no demo until one is set, and keeps the starting program when the demo is switched off', async () => {
		const service = createDemoService(fakeDemoRepository());
		const created = await service.create(
			{ title: 'a' },
			{ demoKind: 'plugin', starter: { kind: 'sample', sampleId: 'shopping-total' } }
		);
		expect(created.demoKind).toBe('plugin');

		const off = await service.update(created.id, { title: 'a' }, { demoKind: 'none' });

		expect(off).toMatchObject({
			demoKind: 'none',
			starterKind: 'sample',
			sampleId: 'shopping-total'
		});
		expect((await service.create({ title: 'plain' })).demoKind).toBe('none');
	});

	it('starts empty, and stores a starter when given one', async () => {
		const service = createDemoService(fakeDemoRepository());

		const plain = await service.create({ title: 'plain' });
		const sampled = await service.create(
			{ title: 'sampled' },
			{ demoKind: 'plugin', starter: { kind: 'sample', sampleId: 'counting-loop' } }
		);

		expect(plain).toMatchObject({ starterKind: 'empty', sampleId: null, starterWorkspace: null });
		expect(sampled).toMatchObject({ starterKind: 'sample', sampleId: 'counting-loop' });
	});

	it('keeps the starter when an update gives none, and replaces it when it does', async () => {
		const service = createDemoService(fakeDemoRepository());
		const created = await service.create(
			{ title: 'a' },
			{ demoKind: 'plugin', starter: { kind: 'custom', workspace: { x: 1 } } }
		);

		const kept = await service.update(created.id, { title: 'b' });
		const replaced = await service.update(
			created.id,
			{ title: 'b' },
			{ demoKind: 'plugin', starter: { kind: 'empty' } }
		);

		expect(kept).toMatchObject({ starterKind: 'custom', starterWorkspace: { x: 1 } });
		expect(replaced).toMatchObject({ starterKind: 'empty', starterWorkspace: null });
	});

	it('stores the page of an embedded demo, and keeps it when the demo is switched away', async () => {
		const service = createDemoService(fakeDemoRepository());

		const created = await service.create(
			{ title: 'a' },
			{ demoKind: 'iframe', iframeUrl: 'https://example.org/x' }
		);
		const switched = await service.update(created.id, { title: 'a' }, { demoKind: 'none' });

		expect(created).toMatchObject({ demoKind: 'iframe', iframeUrl: 'https://example.org/x' });
		expect(switched).toMatchObject({ demoKind: 'none', iframeUrl: 'https://example.org/x' });
	});

	it('sets a starter on its own', async () => {
		const service = createDemoService(fakeDemoRepository());
		const created = await service.create({ title: 'a' });

		const updated = await service.setStarter(created.id, { kind: 'custom', workspace: { y: 2 } });

		expect(updated).toMatchObject({ starterKind: 'custom', starterWorkspace: { y: 2 } });
	});

	it('deletes a demo', async () => {
		const service = createDemoService(fakeDemoRepository());
		const created = await service.create({ title: 'gone' });

		await service.delete(created.id);

		expect(await service.list()).toEqual([]);
	});

	it('throws NotFoundError for a missing demo', async () => {
		const service = createDemoService(fakeDemoRepository());
		const id = '00000000-0000-4000-8000-ffffffffffff';

		await expect(service.get(id)).rejects.toBeInstanceOf(NotFoundError);
		await expect(service.update(id, { title: 'x' })).rejects.toBeInstanceOf(NotFoundError);
		await expect(service.setStarter(id, { kind: 'empty' })).rejects.toBeInstanceOf(NotFoundError);
		await expect(service.delete(id)).rejects.toBeInstanceOf(NotFoundError);
	});
});
