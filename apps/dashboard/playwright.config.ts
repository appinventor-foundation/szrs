// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { defineConfig } from '@playwright/test';
import { testDatabaseUrl } from './tests/support/database.js';

const port = 4173;

export default defineConfig({
	testDir: 'tests',
	testMatch: /.*\.e2e\.ts/,
	globalSetup: './tests/support/global-setup.ts',
	// The tests share one database and reset it between tests.
	workers: 1,
	use: {
		baseURL: `http://localhost:${port}`,
		// Plays the part of Traefik in production: adapter-node assumes https
		// unless a forwarded-protocol header says otherwise, and SvelteKit
		// rejects form posts whose Origin does not match.
		extraHTTPHeaders: { 'x-forwarded-proto': 'http' }
	},
	webServer: {
		command: 'pnpm build && node build',
		url: `http://localhost:${port}/healthz`,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		env: {
			PORT: String(port),
			PROTOCOL_HEADER: 'x-forwarded-proto',
			DATABASE_URL: testDatabaseUrl
		}
	}
});
