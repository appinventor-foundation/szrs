import { existsSync } from 'node:fs';

import { defineConfig } from 'vitest/config';

// Local convenience only — CI sets DATABASE_URL/INTERNAL_API_KEY directly via
// job env and never has a .env.local file, so this is a no-op there. Kept out
// of vitest.config.ts (shared with test:unit) so test:unit's "passes with
// DATABASE_URL fully unset" guarantee isn't affected by this file's presence.
if (existsSync('.env.local')) {
	process.loadEnvFile('.env.local');
}

export default defineConfig({
	test: {
		environment: 'node',
		expect: { requireAssertions: true },
		// Integration tests share one real Postgres database with no per-test
		// isolation, so files must not run concurrently against it.
		fileParallelism: false
	}
});
