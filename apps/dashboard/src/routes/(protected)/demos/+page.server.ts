// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { demoView } from '#lib/schemas/demo.js';
import { getDemoService } from '#lib/server/container.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => ({
	demos: (await getDemoService().list()).map(demoView),
	deleted: url.searchParams.get('deleted') === '1'
});
