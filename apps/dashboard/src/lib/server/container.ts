// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { getDatabase } from '#lib/server/db/client.js';
import { createDemoRepository } from '#lib/server/repositories/demos.js';
import { createDemoService, type DemoService } from '#lib/server/services/demos.js';

// The one place that wires repositories into services. Routes call these
// getters and never touch the database themselves.
let demoService: DemoService | undefined;

export function getDemoService(): DemoService {
	demoService ??= createDemoService(createDemoRepository(getDatabase()));
	return demoService;
}
