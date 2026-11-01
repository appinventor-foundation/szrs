// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { getDemoService } from '#lib/server/container.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => ({
	demos: await getDemoService().list(),
	deleted: url.searchParams.get('deleted') === '1'
});
