// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import postgres from 'postgres';
import { adminCredentials } from './auth.js';

// Never the dev database: the tests empty their tables.
export const testDatabaseUrl =
	process.env.TEST_DATABASE_URL ?? 'postgresql://dashboard:dashboard@localhost:5433/dashboard_test';

// Empties everything the tests create. The seeded admin survives (global setup
// creates it once), but its sessions do not, so every test signs in itself.
// Add each new table here.
export async function resetDatabase(): Promise<void> {
	const sql = postgres(testDatabaseUrl);
	try {
		await sql`TRUNCATE TABLE demos`;
		await sql`DELETE FROM verification`;
		await sql`DELETE FROM session`;
		await sql`DELETE FROM "user" WHERE email <> ${adminCredentials.email}`;
	} finally {
		await sql.end();
	}
}
