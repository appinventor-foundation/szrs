// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { execFileSync } from 'node:child_process';
import { testAuthEnv } from './auth.js';
import { testDatabaseUrl } from './database.js';

// Prepares the test database the way every other environment gets it:
// migrations through drizzle-kit, then the first admin through the same script
// the deploy uses.
export default function globalSetup() {
	const env = { ...process.env, ...testAuthEnv, DATABASE_URL: testDatabaseUrl };
	execFileSync('pnpm', ['exec', 'drizzle-kit', 'migrate'], { env, stdio: 'inherit' });
	execFileSync('pnpm', ['exec', 'tsx', 'scripts/ensure-admin.ts'], { env, stdio: 'inherit' });
}
