// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { DATABASE_URL } from '$app/env/private';
import { createDatabase, type Database } from '#lib/server/db/create-database.js';

export { createDatabase, type Database };

let cached: Database | undefined;

export function getDatabase(): Database {
	cached ??= createDatabase(DATABASE_URL);
	return cached;
}
