// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';
import type { Workspace } from '#lib/schemas/workspace.js';
import { samples } from '#lib/samples/index.js';
import { NotFoundError } from '#lib/server/errors.js';
import type { WorkspaceRepository } from '#lib/server/repositories/workspaces.js';
import { fakeDemoRepository } from '#lib/server/test-support/fake-demo-repository.js';
import { createWorkspaceService } from './workspaces.js';

function fakeWorkspaceRepository(): WorkspaceRepository {
	const rows = new Map<string, Workspace>();
	const key = (demoId: string, userId: string) => `${demoId}:${userId}`;
	return {
		find: async (demoId, userId) => rows.get(key(demoId, userId)),
		upsert: async (demoId, userId, workspace) => void rows.set(key(demoId, userId), workspace),
		remove: async (demoId, userId) => void rows.delete(key(demoId, userId))
	};
}

async function setup() {
	const demos = fakeDemoRepository();
	const service = createWorkspaceService(fakeWorkspaceRepository(), demos);
	return { demos, service };
}

describe('workspace service', () => {
	it('opens an empty workspace when nothing is saved and the demo has no starter', async () => {
		const { demos, service } = await setup();
		const demo = await demos.insert({ title: 'd' }, { demoKind: 'plugin' });

		expect(await service.load(demo.id, 'u1')).toEqual({ workspace: null, source: 'empty' });
	});

	it('opens the sample a demo points at', async () => {
		const { demos, service } = await setup();
		const demo = await demos.insert(
			{ title: 'd' },
			{ demoKind: 'plugin', starter: { kind: 'sample', sampleId: 'shopping-total' } }
		);

		expect(await service.load(demo.id, 'u1')).toEqual({
			workspace: samples['shopping-total'].workspace,
			source: 'starter'
		});
	});

	it('opens the custom program an admin saved', async () => {
		const { demos, service } = await setup();
		const demo = await demos.insert(
			{ title: 'd' },
			{ demoKind: 'plugin', starter: { kind: 'custom', workspace: { a: 1 } } }
		);

		expect(await service.load(demo.id, 'u1')).toEqual({ workspace: { a: 1 }, source: 'starter' });
	});

	it('prefers a saved copy, and keeps every person separate', async () => {
		const { demos, service } = await setup();
		const demo = await demos.insert(
			{ title: 'd' },
			{ demoKind: 'plugin', starter: { kind: 'custom', workspace: { a: 1 } } }
		);

		await service.save(demo.id, 'u1', { mine: true });

		expect(await service.load(demo.id, 'u1')).toEqual({
			workspace: { mine: true },
			source: 'saved'
		});
		expect(await service.load(demo.id, 'u2')).toEqual({ workspace: { a: 1 }, source: 'starter' });
	});

	it('overwrites on save', async () => {
		const { demos, service } = await setup();
		const demo = await demos.insert({ title: 'd' }, { demoKind: 'plugin' });

		await service.save(demo.id, 'u1', { v: 1 });
		await service.save(demo.id, 'u1', { v: 2 });

		expect((await service.load(demo.id, 'u1')).workspace).toEqual({ v: 2 });
	});

	it('goes back to the starter on reset', async () => {
		const { demos, service } = await setup();
		const demo = await demos.insert(
			{ title: 'd' },
			{ demoKind: 'plugin', starter: { kind: 'custom', workspace: { a: 1 } } }
		);
		await service.save(demo.id, 'u1', { mine: true });

		await service.reset(demo.id, 'u1');

		expect(await service.load(demo.id, 'u1')).toEqual({ workspace: { a: 1 }, source: 'starter' });
	});

	it('treats an entry without a demo as not runnable', async () => {
		const { demos, service } = await setup();
		const entry = await demos.insert({ title: 'no demo' });

		await expect(service.load(entry.id, 'u1')).rejects.toBeInstanceOf(NotFoundError);
		await expect(service.save(entry.id, 'u1', {})).rejects.toBeInstanceOf(NotFoundError);
		await expect(service.reset(entry.id, 'u1')).rejects.toBeInstanceOf(NotFoundError);
	});

	it('keeps saved copies per entry when entries share the demo', async () => {
		const { demos, service } = await setup();
		const a = await demos.insert({ title: 'a' }, { demoKind: 'plugin' });
		const b = await demos.insert({ title: 'b' }, { demoKind: 'plugin' });

		await service.save(a.id, 'u1', { in: 'a' });

		expect((await service.load(a.id, 'u1')).workspace).toEqual({ in: 'a' });
		expect((await service.load(b.id, 'u1')).workspace).toBeNull();
	});

	it('throws NotFoundError for a missing demo', async () => {
		const { service } = await setup();
		const id = '00000000-0000-4000-8000-ffffffffffff';

		await expect(service.load(id, 'u1')).rejects.toBeInstanceOf(NotFoundError);
		await expect(service.save(id, 'u1', {})).rejects.toBeInstanceOf(NotFoundError);
		await expect(service.reset(id, 'u1')).rejects.toBeInstanceOf(NotFoundError);
	});
});
