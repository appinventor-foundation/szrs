// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit only reads .env; the dev setup keeps its values in .env.local.
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

export default defineConfig({
	dialect: 'postgresql',
	schema: './src/lib/server/db/schema/index.ts',
	out: './drizzle',
	dbCredentials: { url }
});
