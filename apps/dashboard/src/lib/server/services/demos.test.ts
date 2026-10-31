// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';
import type { Demo, DemoInput } from '#lib/schemas/demo.js';
import { NotFoundError } from '#lib/server/errors.js';
import type { DemoRepository } from '#lib/server/repositories/demos.js';
import { createDemoService } from './demos.js';

function fakeRepository(): DemoRepository {
	const rows = new Map<string, Demo>();
	let next = 0;
	const toDemo = (id: string, input: DemoInput): Demo => ({
		id,
		title: input.title,
		description: input.description ?? null,
		createdAt: new Date(2026, 0, 1, 0, 0, next),
		updatedAt: new Date(2026, 0, 1, 0, 0, next)
	});

	return {
		list: async () => [...rows.values()].reverse(),
		find: async (id) => rows.get(id),
		insert: async (input) => {
			const id = `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`;
			const row = toDemo(id, input);
			rows.set(id, row);
			return row;
		},
		update: async (id, input) => {
			if (!rows.has(id)) return undefined;
			const row = toDemo(id, input);
			rows.set(id, row);
			return row;
		},
		remove: async (id) => rows.delete(id)
	};
}

describe('demo service', () => {
	it('creates a demo and lists it newest first', async () => {
		const service = createDemoService(fakeRepository());
		await service.create({ title: 'first' });
		await service.create({ title: 'second' });

		const titles = (await service.list()).map((demo) => demo.title);

		expect(titles).toEqual(['second', 'first']);
	});

	it('gets a demo by id', async () => {
		const service = createDemoService(fakeRepository());
		const created = await service.create({ title: 'one', description: 'text' });

		expect(await service.get(created.id)).toEqual(created);
	});

	it('updates a demo', async () => {
		const service = createDemoService(fakeRepository());
		const created = await service.create({ title: 'old' });

		const updated = await service.update(created.id, { title: 'new', description: null });

		expect(updated.title).toBe('new');
	});

	it('deletes a demo', async () => {
		const service = createDemoService(fakeRepository());
		const created = await service.create({ title: 'gone' });

		await service.delete(created.id);

		expect(await service.list()).toEqual([]);
	});

	it('throws NotFoundError for a missing demo', async () => {
		const service = createDemoService(fakeRepository());
		const id = '00000000-0000-4000-8000-ffffffffffff';

		await expect(service.get(id)).rejects.toBeInstanceOf(NotFoundError);
		await expect(service.update(id, { title: 'x' })).rejects.toBeInstanceOf(NotFoundError);
		await expect(service.delete(id)).rejects.toBeInstanceOf(NotFoundError);
	});
});
