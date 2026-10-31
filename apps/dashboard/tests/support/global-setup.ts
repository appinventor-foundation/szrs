// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { execFileSync } from 'node:child_process';
import { testDatabaseUrl } from './database.js';

// Applies the committed migrations to the test database with drizzle-kit, the
// same way every other environment gets its schema.
export default function globalSetup() {
	execFileSync('pnpm', ['exec', 'drizzle-kit', 'migrate'], {
		env: { ...process.env, DATABASE_URL: testDatabaseUrl },
		stdio: 'inherit'
	});
}
