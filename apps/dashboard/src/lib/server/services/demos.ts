// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import type { Demo, DemoInput } from '#lib/schemas/demo.js';
import { NotFoundError } from '#lib/server/errors.js';
import type { DemoRepository } from '#lib/server/repositories/demos.js';

export interface DemoService {
	list(): Promise<Demo[]>;
	get(id: string): Promise<Demo>;
	create(input: DemoInput): Promise<Demo>;
	update(id: string, input: DemoInput): Promise<Demo>;
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

		create: (input) => repository.insert(input),

		async update(id, input) {
			const demo = await repository.update(id, input);
			if (!demo) throw new NotFoundError('Demo', id);
			return demo;
		},

		async delete(id) {
			if (!(await repository.remove(id))) throw new NotFoundError('Demo', id);
		}
	};
}
