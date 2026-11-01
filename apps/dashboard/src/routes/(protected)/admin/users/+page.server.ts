// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { getUserService } from '#lib/server/container.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
	users: await getUserService(event).list(),
	deleted: event.url.searchParams.get('deleted') === '1'
});
