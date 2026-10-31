// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import postgres from 'postgres';

// Never the dev database: the tests empty their tables.
export const testDatabaseUrl =
	process.env.TEST_DATABASE_URL ?? 'postgresql://dashboard:dashboard@localhost:5433/dashboard_test';

export async function resetDatabase(): Promise<void> {
	const sql = postgres(testDatabaseUrl);
	try {
		await sql`TRUNCATE TABLE demos`;
	} finally {
		await sql.end();
	}
}
