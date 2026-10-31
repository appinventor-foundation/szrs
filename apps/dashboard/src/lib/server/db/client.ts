// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { DATABASE_URL } from '$app/env/private';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '#lib/server/db/schema/index.js';

export type Database = ReturnType<typeof createDatabase>;

export function createDatabase(url: string) {
	return drizzle(postgres(url), { schema });
}

let cached: Database | undefined;

export function getDatabase(): Database {
	cached ??= createDatabase(DATABASE_URL);
	return cached;
}
