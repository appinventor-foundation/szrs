// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import type { Demo, DemoInput, DemoSetup, Starter } from '#lib/schemas/demo.js';
import { NotFoundError } from '#lib/server/errors.js';
import type { DemoRepository } from '#lib/server/repositories/demos.js';

export interface DemoService {
	list(): Promise<Demo[]>;
	get(id: string): Promise<Demo>;
	// Without a setup, a new entry has no demo and an updated one keeps what it has.
	create(input: DemoInput, setup?: DemoSetup): Promise<Demo>;
	update(id: string, input: DemoInput, setup?: DemoSetup): Promise<Demo>;
	setStarter(id: string, starter: Starter): Promise<Demo>;
	delete(id: string): Promise<void>;
}

export function createDemoService(repository: DemoRepository): DemoService {
	return {
		list: () => repository.list(),

		async get(id) {
			const demo = await repository.find(id);
			if (!demo) throw new NotFoundError('Demo', id);
			return demo;
		},

		create: (input, setup) => repository.insert(input, setup),

		async update(id, input, setup) {
			const demo = await repository.update(id, input, setup);
			if (!demo) throw new NotFoundError('Demo', id);
			return demo;
		},

		async setStarter(id, starter) {
			const demo = await repository.setStarter(id, starter);
			if (!demo) throw new NotFoundError('Demo', id);
			return demo;
		},

		async delete(id) {
			if (!(await repository.remove(id))) throw new NotFoundError('Demo', id);
		}
	};
}
