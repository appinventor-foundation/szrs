// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { createDatabase } from '../db/create-database.js';
import { createAuth } from './create-auth.js';

// Config for `pnpm auth:generate`. The CLI only reads the options, so these
// values never connect anywhere (postgres.js connects lazily).
export const auth = createAuth({
	db: createDatabase(process.env.DATABASE_URL ?? 'postgresql://cli:cli@localhost:5432/cli'),
	secret: 'cli-only-secret-not-used-at-runtime-0000',
	baseURL: 'http://localhost:5173'
});
