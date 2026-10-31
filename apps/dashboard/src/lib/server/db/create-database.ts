// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

// No SvelteKit imports and no `#lib` aliases: the auth CLI and the seed script
// load this file outside Vite.
export type Database = ReturnType<typeof createDatabase>;

export function createDatabase(url: string) {
	return drizzle(postgres(url), { schema });
}
